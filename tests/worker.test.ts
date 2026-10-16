import {it,expect} from 'vitest';
import {Worker} from '../src/server/jobs/worker';
import {JobStore} from '../src/server/jobs/store';
import type {TransferPlan} from '../src/shared/contracts';
import {SolutionService} from '../src/server/solutions/solution';
import {AppError} from '../src/server/errors';
import {FlowService} from '../src/server/flows/flows';
const plan={id:'p',hash:'h',expiresAt:'2099-01-01',request:{source:'dev',target:'production',kind:'table',ids:[],includeData:false},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:[],warnings:[]} satisfies TransferPlan;
it('finishes an imported deferred flow with a persistent configuration checklist, without writing mappings',async()=>{
 const store=new JobStore(':memory:');const p={...plan,request:{...plan.request,kind:'flow',deferFlowConfiguration:true},components:[{id:'f',kind:'flow'}],flowPreflight:{connections:[{logicalName:'ph_ref',displayName:'Dataverse'}],variables:[{logicalName:'ph_url',displayName:'URL'}]}} as unknown as TransferPlan;store.savePlan(p);const job=store.createJob(p,'deferred-flow');store.update({...job,status:'importing',importId:'i'});const calls:unknown[]=[];
 const flows=new FlowService({client:{request:async(...args:unknown[])=>{calls.push(args);return {statecode:0}},all:async()=>[{connectionid:null}]}} as never);
 const worker=new Worker(store,{get:()=>p} as never,{importStatus:async()=>'succeeded',publish:async()=>{},cleanup:async()=>{}} as never,{} as never,flows);await worker.tick();
 const done=store.getJob(job.id)!;expect(done.status).toBe('succeeded');expect(done.step).toContain('chờ cấu hình');expect(done.warnings.join(' ')).toContain('ph_ref');expect(done.warnings.join(' ')).toContain('ph_url');expect(calls.every(c=>(c as unknown[]).length===2)).toBe(true);store.close();
});
it('publishes imported schema before copying data and checking metadata',async()=>{
 const store=new JobStore(':memory:');const p={...plan,request:{...plan.request,includeData:true}};store.savePlan(p);const job=store.createJob(p,'publish-order');store.update({...job,status:'importing',importId:'i'});const calls:string[]=[];
 const worker=new Worker(store,{get:()=>p,catalog:{tables:async()=>{calls.push('verify');return {items:[]}}}} as never,{importStatus:async()=>'succeeded',publish:async()=>{calls.push('publish')},cleanup:async()=>{}} as never,{copy:async()=>{calls.push('data')}} as never,{} as never);
 await worker.tick();expect(calls).toEqual(['publish','verify','data']);expect(store.getJob(job.id)?.status).toBe('succeeded');store.close();
});
it('waits for destination metadata propagation without importing again',async()=>{
 const store=new JobStore(':memory:');const p={...plan,components:[{id:'t',kind:'table',componentType:1,logicalName:'ph_notification',displayName:'Notification',selectable:true}]} as TransferPlan;store.savePlan(p);const job=store.createJob(p,'metadata-delay');store.update({...job,status:'importing',importId:'i'});let reads=0,publishes=0;const waits:number[]=[];
 const catalog={tables:async()=>{reads++;return {items:reads===1?[]:[{id:'destination',logicalName:'ph_notification'}]}},attributes:async()=>[],client:{request:async()=>({OneToManyRelationships:[],ManyToOneRelationships:[],ManyToManyRelationships:[],Keys:[]}),all:async()=>[]}};
 const worker=new Worker(store,{get:()=>p,catalog} as never,{importStatus:async()=>'succeeded',publish:async()=>{publishes++},cleanup:async()=>{}} as never,{} as never,{} as never,async ms=>{waits.push(ms)});
 await worker.tick();expect(reads).toBe(2);expect(publishes).toBe(1);expect(waits).toHaveLength(1);expect(store.getJob(job.id)?.status).toBe('succeeded');store.close();
});
it('recovers an accepted import by polling instead of submitting again',async()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const job=store.createJob(plan,'k');store.update({...job,status:'importing',importId:'i',asyncId:'a'});let submitted=0;
 const solutions={importStatus:async()=>'pending',startImport:async()=>{submitted++}};
 const worker=new Worker(store,{get:()=>plan} as never,solutions as never,{} as never,{} as never);
 await worker.tick();expect(submitted).toBe(0);expect(store.getJob(job.id)?.status).toBe('importing');store.close();
});
it('keeps a real missing-table error after bounded read-only retries and never copies data',async()=>{
 const store=new JobStore(':memory:');const p={...plan,request:{...plan.request,includeData:true}};store.savePlan(p);const job=store.createJob(p,'missing');store.update({...job,status:'importing',importId:'i'});let reads=0,copies=0;
 const worker=new Worker(store,{get:()=>p,catalog:{tables:async()=>{reads++;throw new AppError('VERIFY_FAILED','Missing metadata')}}} as never,{importStatus:async()=>'succeeded',publish:async()=>{}} as never,{copy:async()=>{copies++}} as never,{} as never,async()=>{});
 await worker.tick();expect(reads).toBe(5);expect(copies).toBe(0);expect(store.getJob(job.id)?.status).toBe('partial');expect(store.getJob(job.id)?.error?.code).toBe('VERIFY_FAILED');store.close();
});
it('serializes queued jobs behind an unresolved import on the same destination',async()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const first=store.createJob(plan,'k1');store.update({...first,status:'awaiting-input'});const second=store.createJob(plan,'k2');
 const worker=new Worker(store,{} as never,{} as never,{} as never,{} as never);await worker.tick();expect(store.getJob(second.id)?.status).toBe('queued');store.close();
});
it('continues polling a lost import response by its saved ImportJobId',async()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const job=store.createJob(plan,'k');store.update({...job,status:'awaiting-input',importId:'i'});let polls=0;
 const worker=new Worker(store,{get:()=>plan} as never,{importStatus:async()=>{polls++;return 'pending'}} as never,{} as never,{} as never);await worker.tick();expect(polls).toBe(1);expect(store.getJob(job.id)?.status).toBe('importing');store.close();
});
it('reports partial when a data copy fails after schema import',async()=>{
 const store=new JobStore(':memory:');const p={...plan,request:{...plan.request,includeData:true}};store.savePlan(p);const job=store.createJob(p,'k');store.update({...job,status:'importing',importId:'i',asyncId:'a'});
 const worker=new Worker(store,{get:()=>p,catalog:{tables:async()=>({items:[]})}} as never,{importStatus:async()=>'succeeded',publish:async()=>{}} as never,{copy:async()=>{throw Error('failure')}} as never,{} as never);
 await worker.tick();expect(store.getJob(job.id)?.status).toBe('partial');expect(store.getJob(job.id)?.schemaImported).toBe(true);store.close();
});
it('does not poll a nonexistent import after Microsoft explicitly rejected the request',async()=>{
 const store=new JobStore(':memory:');store.savePlan(plan);const job=store.createJob(plan,'rejected');let polls=0;const service=new SolutionService({request:async()=>{throw new AppError('DATAVERSE_ERROR','HTTP 400 rejected',502,400)}} as never);
 const solutions={build:async()=>'zip',startImport:service.startImport.bind(service),importStatus:async()=>{polls++;return 'pending'}};const worker=new Worker(store,{get:()=>plan,validatePlan:async()=>plan} as never,solutions as never,{} as never,{} as never);
 await worker.tick();await worker.tick();expect(store.getJob(job.id)?.status).toBe('failed');expect(store.getJob(job.id)?.error?.code).toBe('DATAVERSE_ERROR');expect(polls).toBe(0);store.close();
});

