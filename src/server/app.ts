import Fastify from 'fastify';
import staticPlugin from '@fastify/static';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {z} from 'zod';
import {environmentSchema,guidSchema,requestSchema,type TransferPlan,type Job} from '../shared/contracts';
import {environments,type Config} from './config';
import {MicrosoftClient} from './microsoft/http';
import {CatalogService} from './catalog/catalog';
import {DependencyReader} from './plans/dependencies';
import {Planner} from './plans/planner';
import {SolutionService} from './solutions/solution';
import {DataService} from './data/service';
import {FlowService} from './flows/flows';
import {JobStore} from './jobs/store';
import {Worker} from './jobs/worker';
import {AppError,safeError} from './errors';
interface AppDependencies{config:Config;store?:JobStore;client?:MicrosoftClient}
export function buildApp({config,store=new JobStore(),client=new MicrosoftClient(config)}:AppDependencies){
 const app=Fastify({logger:false,bodyLimit:1024*1024});const catalog=new CatalogService(client);const planner=new Planner(catalog,new DependencyReader(catalog),p=>store.savePlan(p),id=>store.getPlan(id));const data=new DataService(catalog);const flows=new FlowService(catalog);const worker=new Worker(store,planner,new SolutionService(client),data,flows);
 app.decorate('transferWorker',worker);
 app.addHook('onRequest',async(req,reply)=>{
  const host=req.headers.host?.split(':')[0];if(host&&!['localhost','127.0.0.1','['].includes(host))throw new AppError('HOST_FORBIDDEN','App chỉ phục vụ trên máy local.',403);
  if(req.headers.origin&&!['http://127.0.0.1:'+config.port,'http://localhost:'+config.port,'http://127.0.0.1:5173','http://localhost:5173'].includes(req.headers.origin))throw new AppError('ORIGIN_FORBIDDEN','Nguồn yêu cầu không được phép.',403);
  if(req.url.startsWith('/api/'))reply.header('Cache-Control','no-store');reply.header('X-Content-Type-Options','nosniff');reply.header('Referrer-Policy','no-referrer');
 });
 app.setErrorHandler((error,_req,reply)=>{if(error instanceof z.ZodError){reply.status(400).send({error:{code:'INVALID_INPUT',message:'Thông tin gửi lên không hợp lệ. Kiểm tra môi trường, ID và lựa chọn.'}});return;}const info=safeError(error);reply.status(error instanceof AppError?error.status:500).send({error:info});});
 app.get('/api/environments',async()=>({configured:config.configured,environments:await Promise.all(Object.values(environments).map(async env=>{try{if(!config.configured)throw new AppError('NOT_CONFIGURED','Chưa cấu hình client secret ở backend.');await client.request(env.id,'WhoAmI');return {...env,connected:true,permissionScope:'read-only-check'};}catch(e){return {...env,connected:false,error:safeError(e)};}}))}));
 const pair=(query:unknown)=>z.object({source:environmentSchema,target:environmentSchema}).parse(query);
 app.get('/api/catalog/tables',async req=>{const {source,target}=pair(req.query);return catalog.tables(source,target);});
 app.get('/api/catalog/shared-tables',async req=>{const {source,target}=pair(req.query);const [src,dst]=await Promise.all([catalog.tables(source),catalog.rawTables(target)]);return {items:src.items.filter(t=>t.custom&&!t.managed&&dst.some(d=>d.LogicalName===t.logicalName)).map(t=>({...t,selectable:true,reason:undefined}))};});
 app.get('/api/catalog/columns',async req=>{const q=z.object({source:environmentSchema,target:environmentSchema,tableId:guidSchema}).parse(req.query);return catalog.columns(q.source,q.target,q.tableId);});
 app.get('/api/catalog/flows',async req=>{const {source,target}=pair(req.query);return catalog.flows(source,target);});
 const enrich=async(plan:TransferPlan)=>{
  plan.warnings=[...new Set([...plan.warnings,'Solution export dùng các thành phần đã publish ở nguồn.'])];
  if(plan.request.includeData){plan.dataPreflight=await data.inspect(plan);plan.blockers.push(...plan.dataPreflight.blockers);if(plan.dataPreflight.references.length)plan.blockers.push('Cần ánh xạ các bản ghi lookup chưa có ở đích.');}
  if(plan.request.kind==='flow'){
   try{plan.flowPreflight=await flows.inspect(plan);plan.blockers.push(...plan.flowPreflight.blockers);flows.parameters(plan);}catch(e){plan.blockers.push(safeError(e).message);}
   plan.warnings.push('Giữ nguyên trạng thái flow nguồn. Flow được chuẩn bị ở chế độ Off trong gói chuyển và kiểm tra lại ở đích. Kiểm tra URL hard-code và quyền connection ở đích trước khi bật.');
  }
  plan.blockers=[...new Set(plan.blockers)];plan.warnings=[...new Set(plan.warnings)];return planner.put(plan);
 };
 app.post('/api/plans',async req=>enrich(await planner.createPlan(requestSchema.parse(req.body))));
 app.get('/api/plans/:id',async req=>planner.get(z.object({id:guidSchema}).parse(req.params).id));
 app.post('/api/plans/:id/dependencies',async req=>{const {id}=z.object({id:guidSchema}).parse(req.params);const {acceptedIds}=z.object({acceptedIds:z.array(guidSchema).max(300)}).parse(req.body);return enrich(await planner.resolveDependencies(id,acceptedIds));});
 app.post('/api/plans/:id/references',async req=>{
  const {id}=z.object({id:guidSchema}).parse(req.params);const {mappings}=z.object({mappings:z.array(z.object({sourceTable:z.string().regex(/^[a-zA-Z0-9_]+$/),sourceId:guidSchema,targetId:guidSchema})).max(10000)}).parse(req.body);const plan=planner.get(id);if(!plan.dataPreflight)throw new AppError('NO_DATA_PREFLIGHT','Kế hoạch không chuyển data.');
  plan.dataPreflight.mappings=mappings;plan.blockers=plan.blockers.filter(b=>!b.includes('ánh xạ')&&!plan.dataPreflight?.blockers.includes(b));return enrich(plan);
 });
 app.post('/api/plans/:id/flow-mappings',async req=>{
  const {id}=z.object({id:guidSchema}).parse(req.params);const {configureLater,...mappings}=z.object({configureLater:z.boolean().optional(),connections:z.record(z.string().max(200),z.string().max(1000)),variables:z.record(z.string().max(200),z.string().max(10000))}).parse(req.body);const plan=planner.get(id);if(plan.request.kind!=='flow')throw new AppError('INVALID_KIND','Không phải kế hoạch Cloud flow.');plan.request.deferFlowConfiguration=configureLater===true;plan.flowMappings=configureLater?undefined:mappings;plan.blockers=plan.blockers.filter(b=>!b.includes('connection và environment variable'));return enrich(plan);
 });
 app.post('/api/jobs',async req=>{
  const body=z.object({planId:guidSchema,hash:z.string().length(64),idempotencyKey:guidSchema}).parse(req.body);const existing=store.findByKey(body.idempotencyKey);if(existing){if(existing.planId!==body.planId)throw new AppError('IDEMPOTENCY_CONFLICT','Khóa yêu cầu thuộc kế hoạch khác.',409);return existing;}const plan=await planner.validatePlan(body.planId,body.hash);
  if(plan.request.kind==='flow'){const info=await flows.inspect(plan);if(info.blockers.length)throw new AppError('FLOW_BLOCKED',info.blockers.join(' '));flows.parameters(plan);}
  if(plan.request.includeData){const info=await data.inspect(plan);if(info.blockers.length||info.references.length)throw new AppError('DATA_BLOCKED','Dữ liệu/tham chiếu cần kiểm tra lại.');}
  return store.createJob(plan,body.idempotencyKey);
 });
 app.get('/api/jobs',async()=>({jobs:store.list()}));
 app.get('/api/jobs/:id/solution',async(req,reply)=>{
  const {id}=z.object({id:guidSchema}).parse(req.params);const job=store.getJob(id);if(!job)throw new AppError('JOB_NOT_FOUND','Không tìm thấy job.',404);
  if(!job.schemaImported||!job.solutionName||!/^[a-zA-Z0-9_]+$/.test(job.solutionName))throw new AppError('SOLUTION_NOT_IMPORTED','Job chưa xác nhận nhập Solution tại đích.',404);
  // Resolve by unique name at the destination: its ID can differ from the source.
  const solutions=await client.all<{solutionid:string}>(job.target,`solutions?$select=solutionid&$filter=uniquename eq '${job.solutionName}'&$top=2`);
  if(solutions.length!==1)throw new AppError('SOLUTION_NOT_FOUND','Không tìm thấy duy nhất Solution của job tại môi trường đích.',404);
  const solutionId=encodeURIComponent(solutions[0].solutionid);let environmentId:string|undefined;
  try{environmentId=(await client.request<{Detail?:{EnvironmentId?:string}}>(job.target,"RetrieveCurrentOrganization(AccessType=@p1)?@p1=Microsoft.Dynamics.CRM.EndpointAccessType'Default'")).Detail?.EnvironmentId;}catch{}
  return reply.redirect(environmentId?`https://make.powerapps.com/environments/${encodeURIComponent(environmentId)}/solutions/${solutionId}`:`${environments[job.target].url}/tools/solution/edit.aspx?id=${solutionId}`);
 });
 app.get('/api/jobs/:id',async req=>{const {id}=z.object({id:guidSchema}).parse(req.params);const job=store.getJob(id);if(!job)throw new AppError('JOB_NOT_FOUND','Không tìm thấy job.',404);return job;});
 app.post('/api/jobs/:id/cancel',async req=>{const {id}=z.object({id:guidSchema}).parse(req.params);const job=store.getJob(id);if(!job)throw new AppError('JOB_NOT_FOUND','Không tìm thấy job.',404);if(job.importId&&!job.schemaImported)throw new AppError('IMPORT_IN_PROGRESS','Import đã gửi cho Microsoft. App tiếp tục theo dõi, không thể hủy transaction từ xa.');job.cancelRequested=true;return store.update(job);});
 app.post('/api/jobs/:id/retry',async req=>{const {id}=z.object({id:guidSchema}).parse(req.params);const job=store.getJob(id);if(!job)throw new AppError('JOB_NOT_FOUND','Không tìm thấy job.',404);if(job.status!=='partial'||!job.schemaImported)throw new AppError('UNSAFE_RETRY','Chỉ tiếp tục các bước còn lại của job partial đã xác nhận import cấu hình thành công.');const plan=planner.get(job.planId);if(plan.hash!==job.planHash)throw new AppError('PLAN_MANIFEST_CHANGED','Kế hoạch không khớp job đã duyệt.');if(plan.request.kind==='flow')flows.parameters(plan);job.status='queued';job.step='Tiếp tục sau import đã hoàn tất';job.error=undefined;job.cancelRequested=false;return store.update(job);});
 const dist=resolve('dist');if(existsSync(resolve(dist,'index.html'))){app.register(staticPlugin,{root:dist,index:'index.html'});app.setNotFoundHandler((req,reply)=>req.url.startsWith('/api/')?reply.status(404).send({error:{code:'NOT_FOUND',message:'Không có API này.'}}):reply.sendFile('index.html'));}
 return app;
}
