import {DatabaseSync} from 'node:sqlite';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import type {Job,TransferPlan} from '../../shared/contracts';
import {AppError} from '../errors';
export class JobStore{
 private db:DatabaseSync;
 constructor(path='.runtime/transfer.db'){
  if(path!==':memory:')mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);
  this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, idem TEXT UNIQUE NOT NULL, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS checkpoints(job TEXT,stage TEXT,tbl TEXT,record TEXT,PRIMARY KEY(job,stage,tbl,record));');
 }
 savePlan(plan:TransferPlan){const previous=this.getPlan(plan.id);const consumed=this.db.prepare("SELECT 1 FROM jobs WHERE json_extract(payload,'$.planId')=? LIMIT 1").get(plan.id);if(consumed&&previous?.hash!==plan.hash)throw new AppError('PLAN_CONSUMED','Kế hoạch đã được dùng cho job; không thể thay đổi phạm vi hoặc ánh xạ. Tạo kế hoạch mới.',409);const saved=structuredClone(plan);delete saved.flowMappings;this.db.prepare('INSERT OR REPLACE INTO plans VALUES(?,?)').run(plan.id,JSON.stringify(saved));}
 getPlan(id:string):TransferPlan|undefined{const row=this.db.prepare('SELECT payload FROM plans WHERE id=?').get(id) as {payload:string}|undefined;return row?JSON.parse(row.payload):undefined;}
 createJob(plan:TransferPlan,key:string){
  const found=this.db.prepare('SELECT payload FROM jobs WHERE idem=?').get(key) as {payload:string}|undefined;
  if(found){const job=JSON.parse(found.payload) as Job;if(job.planId!==plan.id)throw new AppError('IDEMPOTENCY_CONFLICT','Khóa yêu cầu đã thuộc kế hoạch khác.',409);return job;}
  const current=this.getPlan(plan.id);if(current&&current.hash!==plan.hash)throw new AppError('STALE_PLAN','Kế hoạch đã thay đổi trong lúc kiểm tra. Duyệt lại trước khi tạo job.',409);
  const now=new Date().toISOString();const job:Job={id:randomUUID(),planId:plan.id,planHash:plan.hash,target:plan.request.target,status:'queued',step:'Đang chờ',createdAt:now,updatedAt:now,counts:{created:0,patched:0,associated:0},warnings:[]};
  this.db.prepare('INSERT INTO jobs VALUES(?,?,?)').run(job.id,key,JSON.stringify(job));return job;
 }
 findByKey(key:string):Job|undefined{const row=this.db.prepare('SELECT payload FROM jobs WHERE idem=?').get(key) as {payload:string}|undefined;return row?JSON.parse(row.payload):undefined;}
 getJob(id:string):Job|undefined{const row=this.db.prepare('SELECT payload FROM jobs WHERE id=?').get(id) as {payload:string}|undefined;return row?JSON.parse(row.payload):undefined;}
 update(job:Job){job.updatedAt=new Date().toISOString();this.db.prepare('UPDATE jobs SET payload=? WHERE id=?').run(JSON.stringify(job),job.id);return job;}
 list():Job[]{return (this.db.prepare('SELECT payload FROM jobs ORDER BY rowid DESC LIMIT 200').all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 unfinished():Job[]{return (this.db.prepare("SELECT payload FROM jobs WHERE json_extract(payload,'$.status') NOT IN ('succeeded','partial','failed','cancelled') ORDER BY rowid ASC").all() as {payload:string}[]).map(r=>JSON.parse(r.payload));}
 checkpoint(job:string,stage:string,table:string,id:string){this.db.prepare('INSERT OR IGNORE INTO checkpoints VALUES(?,?,?,?)').run(job,stage,table,id);}
 hasCheckpoint(job:string,stage:string,table:string,id:string){return !!this.db.prepare('SELECT 1 FROM checkpoints WHERE job=? AND stage=? AND tbl=? AND record=?').get(job,stage,table,id);}
 close(){this.db.close();}
}
