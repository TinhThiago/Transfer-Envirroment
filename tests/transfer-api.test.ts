import {it,expect} from 'vitest';
import {buildApp} from '../src/server/app';
import {loadConfig} from '../src/server/config';
import {JobStore} from '../src/server/jobs/store';
import type {TransferPlan} from '../src/shared/contracts';
it('opens the imported destination solution using its destination ID, including old jobs',async()=>{
 const store=new JobStore(':memory:');const p={id:'p',hash:'h',request:{target:'dev'},components:[]} as unknown as TransferPlan;store.savePlan(p);const job=store.createJob(p,'solution-link');store.update({...job,status:'succeeded',schemaImported:true,solutionName:'phtransfer_demo',sourceSolutionId:'source-id'});
 const reads:string[]=[];const client={all:async(env:string,path:string)=>{expect(env).toBe('dev');reads.push(path);return [{solutionid:'destination-id'}]},request:async()=>({Detail:{EnvironmentId:'destination-env'}})};
 const app=buildApp({config:loadConfig({}),store,client:client as never});const response=await app.inject(`/api/jobs/${job.id}/solution`);expect(response.statusCode).toBe(302);expect(response.headers.location).toBe('https://make.powerapps.com/environments/destination-env/solutions/destination-id');expect(reads[0]).toContain("uniquename eq 'phtransfer_demo'");await app.close();store.close();
});
it('saves configure-later in the approved plan and restores strict validation when switched back',async()=>{
 const store=new JobStore(':memory:');const plan={id:'11111111-1111-4111-8111-111111111111',hash:'a'.repeat(64),expiresAt:'2099-01-01',request:{source:'dev',target:'production',kind:'flow',ids:['flow'],includeData:false},components:[{id:'flow',kind:'flow'}],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:['Điền đủ connection và environment variable cho môi trường đích.'],warnings:[]} as unknown as TransferPlan;store.savePlan(plan);
 const client={all:async(_:string,path:string)=>path.startsWith('workflows')?[{workflowid:'flow',name:'Flow',statecode:1}]:path.startsWith('solutioncomponents')?[{objectid:'flow',componenttype:10035}]:path.startsWith('connectionreferences')?[{connectionreferenceid:'ref',connectionreferencelogicalname:'ph_ref'}]:[],request:async()=>({clientdata:'{"connectionReferenceLogicalName":"ph_ref"}'})};
 const app=buildApp({config:loadConfig({}),store,client:client as never});const save=(configureLater:boolean)=>app.inject({method:'POST',url:`/api/plans/${plan.id}/flow-mappings`,payload:{configureLater,connections:{},variables:{}}});
 const deferred=await save(true);expect(deferred.statusCode,deferred.body).toBe(200);expect(deferred.json().blockers).toEqual([]);expect(store.getPlan(plan.id)?.request.deferFlowConfiguration).toBe(true);expect(deferred.json().hash).not.toBe(plan.hash);
 const strict=await save(false);expect(strict.json().blockers.join(' ')).toContain('Điền đủ connection');await app.close();store.close();
});
it('offers only source custom unmanaged tables that also exist at the destination for Column',async()=>{
 const row=(id:string,custom:boolean,managed:boolean)=>({MetadataId:id,LogicalName:id,IsCustomEntity:custom,IsManaged:managed,DisplayName:{UserLocalizedLabel:{Label:id}}});
 const client={all:async(env:string)=>env==='dev'?[row('custom',true,false),row('system',false,false),row('managed',true,true),row('missing',true,false)]:[row('custom',true,false),row('system',false,false),row('managed',true,true)]};
 const store=new JobStore(':memory:');const app=buildApp({config:loadConfig({}),store,client:client as never});const response=await app.inject('/api/catalog/shared-tables?source=dev&target=production');expect(response.json().items.map((item:{id:string})=>item.id)).toEqual(['custom']);await app.close();store.close();
});
it('reports missing configuration without exposing secret or fabricating a live catalog',async()=>{
 const store=new JobStore(':memory:');const app=buildApp({config:loadConfig({}),store});
 const response=await app.inject('/api/environments');expect(response.statusCode).toBe(200);expect(response.json().environments[0].connected).toBe(false);
 const catalog=await app.inject('/api/catalog/tables?source=dev&target=production');expect(catalog.statusCode).toBe(503);expect(catalog.json().error.code).toBe('NOT_CONFIGURED');await app.close();store.close();
});
it('returns an existing job for repeated request even after the target catalog changes',async()=>{
 const store=new JobStore(':memory:');const plan={id:'11111111-1111-4111-8111-111111111111',hash:'a'.repeat(64),expiresAt:'2099-01-01',request:{source:'dev',target:'production',kind:'table',ids:[],includeData:false},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:[],warnings:[]} satisfies TransferPlan;
 store.savePlan(plan);const idempotencyKey='22222222-2222-4222-8222-222222222222';const job=store.createJob(plan,idempotencyKey);let remoteCalls=0;
 const client={all:async()=>{remoteCalls++;throw Error('must not revalidate duplicate request')}};
 const app=buildApp({config:loadConfig({}),store,client:client as never});const response=await app.inject({method:'POST',url:'/api/jobs',payload:{planId:plan.id,hash:plan.hash,idempotencyKey}});
 expect(response.statusCode).toBe(200);expect(response.json().id).toBe(job.id);expect(remoteCalls).toBe(0);await app.close();store.close();
});
it('rejects cross-site writes and invalid selections at the HTTP boundary',async()=>{
 const store=new JobStore(':memory:');const app=buildApp({config:loadConfig({MICROSOFT_CLIENT_SECRET:'private-secret'}),store});
 const foreign=await app.inject({method:'POST',url:'/api/plans',headers:{origin:'https://evil.invalid'},payload:{}});expect(foreign.statusCode).toBe(403);
 const invalid=await app.inject({method:'POST',url:'/api/plans',payload:{source:'dev',target:'dev',kind:'table',ids:[]}});expect(invalid.statusCode).toBe(400);expect(invalid.body).not.toContain('private-secret');await app.close();store.close();
});
it('allows resuming a partial data job without resetting its import ID or checkpoints',async()=>{
 const store=new JobStore(':memory:');const plan={id:'11111111-1111-4111-8111-111111111111',hash:'a'.repeat(64),expiresAt:'2099-01-01',request:{source:'dev',target:'production',kind:'table',ids:[],includeData:true},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:[],warnings:[]} satisfies TransferPlan;store.savePlan(plan);const job=store.createJob(plan,'retry');store.update({...job,status:'partial',schemaImported:true,importId:'saved-import'});store.checkpoint(job.id,'created','ph_as','record');
 const app=buildApp({config:loadConfig({}),store});const response=await app.inject({method:'POST',url:`/api/jobs/${job.id}/retry`,payload:{}});expect(response.statusCode).toBe(200);expect(response.json().status).toBe('queued');expect(response.json().importId).toBe('saved-import');expect(store.hasCheckpoint(job.id,'created','ph_as','record')).toBe(true);await app.close();store.close();
});
