import {it,expect} from 'vitest';
import {JobStore} from '../src/server/jobs/store';
import type {TransferPlan} from '../src/shared/contracts';
const plan={id:'plan1',hash:'hash',request:{source:'dev',target:'production',kind:'table',ids:['a'],includeData:false},components:[],dependencies:[],blockers:[],warnings:[],expiresAt:'2099-01-01',acceptedIds:[],rejectedIds:[]} satisfies TransferPlan;
it('persists plans and deduplicates job requests without changing destination',()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const one=store.createJob(plan,'key');const two=store.createJob(plan,'key');
 expect(one.id).toBe(two.id);expect(store.getPlan('plan1')?.hash).toBe('hash');expect(store.list()).toHaveLength(1);store.close();
});
it('freezes an approved plan after enqueue and retains the accepted hash in the job',()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const job=store.createJob(plan,'freeze');expect(job.planHash).toBe('hash');expect(()=>store.savePlan({...plan,hash:'changed',components:[{id:'extra'} as never]})).toThrow();expect(store.getPlan(plan.id)?.hash).toBe('hash');store.close();
});
it('keeps old unresolved work in the worker queue beyond the newest 200 history entries',()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const first=store.createJob(plan,'first');store.update({...first,status:'importing',importId:'i'});for(let i=0;i<205;i++){const job=store.createJob(plan,'later'+i);store.update({...job,status:'succeeded'});}
 expect(store.list()).toHaveLength(200);expect(store.unfinished().map(j=>j.id)).toEqual([first.id]);store.close();
});
it('does not reuse the same idempotency key for a different plan',()=>{
 const store=new JobStore(':memory:');store.createJob(plan,'key');expect(()=>store.createJob({...plan,id:'other'},'key')).toThrow();store.close();
});
it('stores import ID and data checkpoint for recovery',()=>{
 const store=new JobStore(':memory:');const job=store.createJob(plan,'k');store.update({...job,status:'importing',importId:'import1',asyncId:'async1'});store.checkpoint(job.id,'created','ph_a','record1');
 expect(store.getJob(job.id)?.importId).toBe('import1');expect(store.hasCheckpoint(job.id,'created','ph_a','record1')).toBe(true);expect(store.hasCheckpoint(job.id,'created','ph_a','other')).toBe(false);store.close();
});
