import {AppError} from '../core/errors';
import type {JobStorePort} from '../core/ports';
import {terminalStatuses,type Job,type TransferPlan,type EnvironmentId} from '../shared/contracts';
interface State{plans:Record<string,TransferPlan>;jobs:Record<string,Job>;keys:Record<string,string>;order:string[];checkpoints:Record<string,boolean>;journal:Record<string,string[]>;receipts?:Record<string,Record<string,boolean>>}
const empty=():State=>({plans:{},jobs:{},keys:{},order:[],checkpoints:{},journal:{}});
export class BrowserJobStore implements JobStorePort{
 constructor(private db:IDBDatabase){}
 private transaction<T>(write:boolean,operation:(state:State)=>T):Promise<T>{
  return new Promise((resolve,reject)=>{const tx=this.db.transaction('state',write?'readwrite':'readonly',write?{durability:'strict'}:undefined);const object=tx.objectStore('state');const read=object.get('snapshot');let result:T;let failure:unknown;
   read.onsuccess=()=>{try{const state:State=read.result||empty();result=operation(state);if(write)object.put(state,'snapshot');}catch(error){failure=error;tx.abort();}};
   tx.oncomplete=()=>resolve(structuredClone(result));tx.onabort=()=>reject(failure||new AppError('STORAGE_FAILED','Không lưu được lịch sử/checkpoint. Dừng trước bước ghi tiếp theo.'));tx.onerror=()=>{failure||=new AppError('STORAGE_FAILED','IndexedDB không khả dụng hoặc đã hết dung lượng.');};
  });
 }
 savePlan(plan:TransferPlan){return this.transaction(true,state=>{const previous=state.plans[plan.id];if(Object.values(state.jobs).some(j=>j.planId===plan.id)&&previous?.hash!==plan.hash)throw new AppError('PLAN_CONSUMED','Kế hoạch đã dùng cho job. Tạo kế hoạch mới.');const saved=structuredClone(plan);delete saved.flowMappings;state.plans[plan.id]=saved;});}
 getPlan(id:string){return this.transaction(false,s=>s.plans[id]);}
 createJob(plan:TransferPlan,key:string){return this.transaction(true,s=>{
  const existing=s.jobs[s.keys[key]];if(existing){if(existing.planId!==plan.id)throw new AppError('IDEMPOTENCY_CONFLICT','Khóa yêu cầu thuộc kế hoạch khác.');return existing;}
  if(s.plans[plan.id]&&s.plans[plan.id].hash!==plan.hash)throw new AppError('STALE_PLAN','Kế hoạch đã thay đổi.');
  const now=new Date().toISOString();const job:Job={id:crypto.randomUUID(),planId:plan.id,planHash:plan.hash,target:plan.request.target,status:'queued',step:'Đang chờ',createdAt:now,updatedAt:now,counts:{created:0,patched:0,associated:0},warnings:[]};s.jobs[job.id]=job;s.keys[key]=job.id;s.order.push(job.id);return job;
 });}
 findByKey(key:string){return this.transaction(false,s=>s.jobs[s.keys[key]]);}
 getJob(id:string){return this.transaction(false,s=>s.jobs[id]);}
 update(job:Job){return this.transaction(true,s=>{if(!s.jobs[job.id])throw new AppError('JOB_NOT_FOUND','Không tìm thấy job.');const saved={...structuredClone(job),updatedAt:new Date().toISOString()};s.jobs[job.id]=saved;return saved;});}
 list(){return this.transaction(false,s=>s.order.slice(-200).reverse().map(id=>s.jobs[id]));}
 unfinished(){return this.transaction(false,s=>s.order.map(id=>s.jobs[id]).filter(j=>!terminalStatuses.includes(j.status)));}
 checkpoint(job:string,stage:string,table:string,id:string){return this.transaction(true,s=>{s.checkpoints[JSON.stringify([job,stage,table,id])]=true;});}
 hasCheckpoint(job:string,stage:string,table:string,id:string){return this.transaction(false,s=>!!s.checkpoints[JSON.stringify([job,stage,table,id])]);}
 beginWrite(job:string,key:string){return this.transaction(true,s=>{const pending=s.journal[job]||[];if(pending.length)throw new AppError('WRITE_OUTCOME_UNKNOWN','Còn thao tác ghi cần đối chiếu. Không gửi lại.');s.journal[job]=[key];});}
 completeWrite(job:string,key:string,receipt?:string){return this.transaction(true,s=>{if(receipt){s.receipts??={};s.receipts[job]??={};s.receipts[job][receipt]=true;}s.journal[job]=(s.journal[job]||[]).filter(value=>value!==key);});}
 hasReceipt(job:string,key:string){return this.transaction(false,s=>!!s.receipts?.[job]?.[key]);}
 pendingWrites(job:string){return this.transaction(false,s=>s.journal[job]||[]);}
 recover(target?:EnvironmentId){return this.transaction(true,s=>{for(const job of Object.values(s.jobs)){
  if(target&&job.target!==target)continue;
  if(terminalStatuses.includes(job.status))continue;
  job.resumeRequired=true;job.status=job.schemaImported&&!(s.journal[job.id]||[]).length?'partial':'awaiting-input';job.step=job.importId&&!job.schemaImported?'Đối chiếu import cũ bằng ImportJobId; không gửi lại.':'Phiên trước đã dừng. Cần đối chiếu trước khi thực hiện thêm thao tác ghi.';
  job.error={code:(s.journal[job.id]||[]).length?'WRITE_OUTCOME_UNKNOWN':'SESSION_INTERRUPTED',message:job.step};job.updatedAt=new Date().toISOString();
 }});}
 close(){this.db.close();}
}
export function openBrowserStore(namespace:string):Promise<BrowserJobStore>{
 return new Promise((resolve,reject)=>{if(typeof indexedDB==='undefined'){reject(new AppError('STORAGE_UNAVAILABLE','Trình duyệt cần hỗ trợ IndexedDB để chuyển đổi.'));return;}const request=indexedDB.open('ph-transfer-v1:'+namespace,1);request.onupgradeneeded=()=>request.result.createObjectStore('state');request.onsuccess=()=>{request.result.onversionchange=()=>request.result.close();resolve(new BrowserJobStore(request.result));};request.onerror=()=>reject(new AppError('STORAGE_UNAVAILABLE','Không mở được IndexedDB. Cho phép lưu trữ trang rồi thử lại.'));request.onblocked=()=>reject(new AppError('STORAGE_UNAVAILABLE','Đóng các tab app cũ rồi thử lại.'));});
}
