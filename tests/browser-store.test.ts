import 'fake-indexeddb/auto';
import {it,expect} from 'vitest';
import {openBrowserStore} from '../src/browser/store';
import type {TransferPlan} from '../src/shared/contracts';
const plan={id:'p',hash:'hash',request:{kind:'flow',source:'dev',target:'production',ids:[],includeData:false},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:[],warnings:[],expiresAt:'2099-01-01',flowMappings:{connections:{x:'sensitive'},variables:{url:'private-value'}}} satisfies TransferPlan;
it('durably restores jobs, checkpoints and pending writes without session mappings',async()=>{
 const namespace=crypto.randomUUID();let store=await openBrowserStore(namespace);await store.savePlan(plan);const job=await store.createJob(plan,'key');await store.update({...job,importId:'saved-import',status:'importing'});await store.checkpoint(job.id,'created','ph_demo','row');await store.beginWrite(job.id,'production:POST:ImportSolutionAsync');store.close();
 store=await openBrowserStore(namespace);expect((await store.getJob(job.id))?.importId).toBe('saved-import');expect(await store.hasCheckpoint(job.id,'created','ph_demo','row')).toBe(true);expect(await store.pendingWrites(job.id)).toHaveLength(1);expect(await store.getPlan('p')).not.toHaveProperty('flowMappings');expect((await store.createJob(plan,'key')).id).toBe(job.id);await expect(store.savePlan({...plan,hash:'changed'})).rejects.toMatchObject({code:'PLAN_CONSUMED'});store.close();
 const other=await openBrowserStore(namespace+'-other');expect(await other.list()).toEqual([]);other.close();
});
it('does not replay an interrupted write and waits for committed recovery state',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'key');await store.beginWrite(job.id,'dev:POST:solutions');await store.recover();expect((await store.getJob(job.id))?.status).toBe('awaiting-input');expect((await store.getJob(job.id))?.error?.code).toBe('WRITE_OUTCOME_UNKNOWN');await store.completeWrite(job.id,'dev:POST:solutions');expect(await store.pendingWrites(job.id)).toEqual([]);store.close();
});
it('offers explicit continuation after schema import at a committed boundary and rejects missing-job updates',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'boundary');await store.update({...job,status:'verifying',schemaImported:true,importId:'i'});await store.recover();expect((await store.getJob(job.id))?.status).toBe('partial');await expect(store.update({...job,id:'missing'})).rejects.toMatchObject({code:'JOB_NOT_FOUND'});store.close();
});
