import 'fake-indexeddb/auto';
import {it,expect,beforeEach} from 'vitest';
import {BrowserRuntime} from '../src/browser/runtime';
import {TargetReservations} from '../src/browser/reservations';
import {openBrowserStore} from '../src/browser/store';
import type {TransferPlan} from '../src/shared/contracts';
const plan={id:'11111111-1111-4111-8111-111111111111',hash:'h',request:{kind:'table',source:'dev',target:'production',ids:[],includeData:false},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:[],warnings:[],expiresAt:'2099-01-01'} satisfies TransferPlan;
let auth={getAccount:()=>({id:'user',tenantId:'tenant',username:'u'}),getToken:async()=>'fixture-token'};
beforeEach(()=>{const tenantId=crypto.randomUUID();auth={getAccount:()=>({id:'user',tenantId,username:'u'}),getToken:async()=>'fixture-token'};});
const locks={run:async<T>(_target:string,fn:()=>Promise<T>)=>fn(),available:true};
it('releases its own completed reservation after a tab closes before releasing it',async()=>{
 const identity=auth.getAccount();const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'completed');await store.update({...job,status:'succeeded'});const reservation=new TargetReservations(identity.tenantId,`${identity.tenantId}:${identity.id}`);await reservation.claim('production',job.id);await reservation.close();const runtime=new BrowserRuntime({auth,store,locks,client:{} as never});await runtime.tick();const other=new TargetReservations(identity.tenantId,'other');expect(await other.claim('production','next')).toBe(true);await other.close();await runtime.stop();
});
it('recovers an accepted import by polling its saved ID and never submits again',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'k');await store.update({...job,status:'importing',importId:'old-import',asyncId:'old-async'});await store.recover();const calls:string[]=[];
 const client={request:async(_:string,path:string)=>{calls.push(path);return {statecode:0,statuscode:10}},all:async()=>[]};const runtime=new BrowserRuntime({auth,store,client:client as never,locks});await runtime.tick();expect(calls).toEqual(['asyncoperations(old-async)?$select=statecode,statuscode,errorcode']);expect((await store.getJob(job.id))?.status).toBe('awaiting-input');await runtime.stop();
});
it('refuses browser transfers when persistent locking is unavailable',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());const runtime=new BrowserRuntime({auth,store,client:{} as never,locks:{...locks,available:false}});await expect(runtime.request('/api/jobs',{planId:plan.id,hash:'h',idempotencyKey:crypto.randomUUID()})).rejects.toMatchObject({code:'BROWSER_UNSUPPORTED'});await runtime.stop();
});
it('does not replay an interrupted record write after reopening',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'k');await store.update({...job,status:'copying-data',schemaImported:true,importId:'i'});await store.beginWrite(job.id,'production:POST:ph_demos');await store.recover();let calls=0;const runtime=new BrowserRuntime({auth,store,client:{request:async()=>{calls++},all:async()=>[]} as never,locks});await runtime.tick();expect(calls).toBe(0);expect((await store.getJob(job.id))?.status).toBe('awaiting-input');await runtime.stop();
});
it('pauses for authentication without marking a job failed or opening a popup',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'auth');
 const {AppError}=await import('../src/core/errors');const runtime=new BrowserRuntime({auth,store,client:{request:async()=>{},all:async()=>{throw new AppError('AUTH_INTERACTION_REQUIRED','Sign in')}} as never,locks});await runtime.tick();expect((await store.getJob(job.id))?.status).toBe('awaiting-input');await runtime.stop();
});
it('clears only the old import journal after an explicit result, then continues without resubmitting',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'confirm');await store.update({...job,status:'importing',importId:'i',asyncId:'a'});await store.beginWrite(job.id,'production:POST:ImportSolutionAsync');await store.recover();const calls:string[]=[];
 const runtime=new BrowserRuntime({auth,store,locks,client:{all:async()=>[],request:async(_:string,path:string)=>{calls.push(path);return path.startsWith('asyncoperations')?{statecode:3,statuscode:30}:undefined}} as never});await runtime.tick();expect((await store.getJob(job.id))?.status).toBe('partial');expect(calls).not.toContain('PublishXml');expect(await store.pendingWrites(job.id)).toEqual([]);await runtime.request(`/api/jobs/${job.id}/retry`,{});await runtime.tick();expect((await store.getJob(job.id))?.status).toBe('succeeded');expect(calls).not.toContain('ImportSolutionAsync');await runtime.stop();
});
it('reserves a destination across ticks and accounts while an import is still pending',async()=>{
 const tenant=crypto.randomUUID();const identity=(id:string)=>({getAccount:()=>({id,tenantId:tenant,username:id}),getToken:async()=>'fixture-token'});const storeA=await openBrowserStore(tenant+':a'),storeB=await openBrowserStore(tenant+':b');await storeA.savePlan(plan);await storeB.savePlan(plan);const a=await storeA.createJob(plan,'a');await storeA.update({...a,status:'importing',importId:'i',asyncId:'a'});await storeB.createJob(plan,'b');let bCalls=0;
 const one=new BrowserRuntime({auth:identity('a'),store:storeA,locks,client:{request:async()=>({statecode:0,statuscode:10}),all:async()=>[]} as never});const two=new BrowserRuntime({auth:identity('b'),store:storeB,locks,client:{request:async()=>{bCalls++},all:async()=>{bCalls++;return []}} as never});
 await one.tick();await one.stop();await two.tick();expect(bCalls).toBe(0);await two.stop();
});
it('settles cancellation of a recovered pre-import job without touching Microsoft',async()=>{
 const store=await openBrowserStore(crypto.randomUUID());await store.savePlan(plan);const job=await store.createJob(plan,'cancel');await store.recover();let calls=0;const runtime=new BrowserRuntime({auth,store,locks,client:{request:async()=>{calls++},all:async()=>{calls++;return []}} as never});await runtime.request(`/api/jobs/${job.id}/cancel`,{});await runtime.tick();expect((await store.getJob(job.id))?.status).toBe('cancelled');expect((await store.unfinished()).length).toBe(0);expect(calls).toBe(0);await runtime.stop();
});
it('restores only the original approved flow mappings in session after a reload',async()=>{
 const namespace=crypto.randomUUID();let store=await openBrowserStore(namespace);let runtime=new BrowserRuntime({auth,store,locks,client:{} as never});const mappings={connections:{ph_ref:'connection'},variables:{ph_url:'approved'}};
 const flowPlan=await runtime.planner.put({...plan,request:{...plan.request,kind:'flow'},flowMappings:mappings,flowPreflight:{connections:[{id:'ref',logicalName:'ph_ref',displayName:'Ref',type:10163}],variables:[{id:'v',logicalName:'ph_url',displayName:'URL',type:380,valueIds:[]}],blockers:[]}});const job=await store.createJob(flowPlan,'strict');await store.update({...job,status:'partial',schemaImported:true,importId:'i'});await runtime.stop();
 store=await openBrowserStore(namespace);runtime=new BrowserRuntime({auth,store,locks,client:{} as never});await expect(runtime.request(`/api/jobs/${job.id}/session-mappings`,{connections:{ph_ref:'changed'},variables:{ph_url:'approved'}})).rejects.toMatchObject({code:'PLAN_MANIFEST_CHANGED'});
 await runtime.request(`/api/jobs/${job.id}/session-mappings`,mappings);await runtime.request(`/api/jobs/${job.id}/retry`,{});expect((await store.getJob(job.id))?.status).toBe('queued');expect(await store.getPlan(flowPlan.id)).not.toHaveProperty('flowMappings');await runtime.stop();
});
