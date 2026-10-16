import {z} from 'zod';
import {requestSchema,environmentSchema,guidSchema,terminalStatuses,type Job,type TransferPlan,type EnvironmentId} from '../shared/contracts';
import {environments} from '../core/environments';
import {AppError,safeError} from '../core/errors';
import type {MicrosoftPort,RequestOptions} from '../core/ports';
import {DataverseClient} from '../core/microsoft/client';
import {CatalogService} from '../core/catalog/catalog';
import {DependencyReader} from '../core/plans/dependencies';
import {Planner} from '../core/plans/planner';
import {SolutionService} from '../core/solutions/solution';
import {DataService} from '../core/data/service';
import {FlowService} from '../core/flows/flows';
import {Worker} from '../core/jobs/worker';
import type {BrowserAuth} from './auth';
import {openBrowserStore,type BrowserJobStore} from './store';
import {browserLocks,type BrowserLocks} from './locks';
import {TargetReservations} from './reservations';
import {sha256,canonicalJson} from '../core/binary';
type AuthPort=Pick<BrowserAuth,'getAccount'|'getToken'>;
interface Options{auth:AuthPort;store:BrowserJobStore;client?:MicrosoftPort;locks?:BrowserLocks}
export class BrowserRuntime{
 readonly catalog:CatalogService;readonly planner:Planner;readonly flows:FlowService;readonly data:DataService;
 private client:MicrosoftPort;private worker:Worker;private locks:BrowserLocks;private reservations:TargetReservations;private timer?:ReturnType<typeof setInterval>;private activeJob?:Job;private ticking?:Promise<void>;private stopped=false;hasWork=false;
 static async create(auth:BrowserAuth){const account=auth.getAccount();if(!account)throw new AppError('AUTH_INTERACTION_REQUIRED','Đăng nhập Microsoft trước.');const store=await openBrowserStore(account.tenantId+':'+account.id);const locks=browserLocks(account.tenantId);const jobs=await store.unfinished();if(locks.available)for(const target of new Set(jobs.map(j=>j.target)))await locks.run(target,()=>store.recover(target));const runtime=new BrowserRuntime({auth,store,locks});runtime.hasWork=jobs.length>0;return runtime;}
 constructor(private options:Options){
  const identity=options.auth.getAccount();this.locks=options.locks||browserLocks(identity?.tenantId||'');this.reservations=new TargetReservations(identity?.tenantId||'',`${identity?.tenantId}:${identity?.id}`);const raw=options.client||new DataverseClient(env=>options.auth.getToken(env));
  this.client={all:<T>(env:EnvironmentId,path:string)=>raw.all<T>(env,path),request:async<T>(env:EnvironmentId,path:string,settings:RequestOptions={})=>{
   const writing=!!settings.method&&settings.method!=='GET';if(!writing){const result=await raw.request<T>(env,path,settings);const job=this.activeJob;if(job?.importId&&!job.schemaImported){
    const status=result as {statecode?:number;progress?:number;completedon?:string;data?:string};const known=job.asyncId&&path.startsWith(`asyncoperations(${job.asyncId})`)?status.statecode===3:path.startsWith(`importjobs(${job.importId})`)&&!!(status.completedon||Number(status.progress)>=100)&&/result="(?:success|failure)"|success="(?:true|false)"/i.test(status.data||'');
    if(known){const key=`${job.target}:POST:ImportSolutionAsync`;if((await options.store.pendingWrites(job.id)).includes(key))await options.store.completeWrite(job.id,key);}
   }return result;}
   if(this.stopped||!this.activeJob)throw new AppError('WRITE_NOT_AUTHORIZED','Chưa có job và khóa môi trường cho thao tác ghi.');
   await options.auth.getToken(env);const job=this.activeJob;const key=`${env}:${settings.method}:${path}`;const recordWrite=env===job.target&&(settings.method==='PATCH'||path.endsWith('/$ref')||settings.method==='POST'&&/^[a-z][a-z0-9_]*$/.test(path));const receipt=recordWrite?key+':'+await sha256(canonicalJson(settings.body)):undefined;if(receipt&&await options.store.hasReceipt(job.id,receipt))return undefined as T;await options.store.beginWrite(job.id,key);
   try{const result=await raw.request<T>(env,path,settings);await options.store.completeWrite(job.id,key,receipt);return result;}
   catch(error){if(error instanceof AppError){const status=error.upstreamStatus||error.status;if(status>=400&&status<500&&status!==408&&error.code!=='WRITE_OUTCOME_UNKNOWN')await options.store.completeWrite(job.id,key);}throw error;}
  }};
  this.catalog=new CatalogService(this.client);this.planner=new Planner(this.catalog,new DependencyReader(this.catalog),p=>options.store.savePlan(p),id=>options.store.getPlan(id));this.flows=new FlowService(this.catalog);this.data=new DataService(this.catalog);this.worker=new Worker(options.store,this.planner,new SolutionService(this.client),this.data,this.flows);
 }
 start(){if(!this.timer&&!this.stopped)this.timer=setInterval(()=>{void this.tick().catch(()=>{});},3000);}
 async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);this.timer=undefined;await this.ticking;await this.reservations.close();this.options.store.close();}
 tick():Promise<void>{if(this.stopped||this.ticking)return this.ticking||Promise.resolve();const run=async()=>{
  for(const target of Object.keys(environments) as EnvironmentId[])await this.locks.run(target,async()=>{const id=await this.reservations.owned(target);if(!id)return;const job=await this.options.store.getJob(id);if(job&&terminalStatuses.includes(job.status)&&!(await this.options.store.pendingWrites(id)).length)await this.reservations.release(target,id);});
  const jobs=await this.options.store.unfinished();this.hasWork=jobs.length>0;for(const target of new Set(jobs.map(j=>j.target))){if(this.stopped)break;await this.locks.run(target,async()=>{const first=(await this.options.store.unfinished()).find(j=>j.target===target);if(!first)return;
   if(first.cancelRequested&&!first.importId&&!(await this.options.store.pendingWrites(first.id)).length){first.status='cancelled';first.resumeRequired=false;first.error=undefined;first.step='Đã dừng trước import.';await this.options.store.update(first);await this.reservations.release(target,first.id);return;}
   if(!await this.reservations.claim(target,first.id)){first.step='Đang chờ job khác hoàn tất hoặc đối chiếu tại môi trường đích (kể cả tài khoản khác trên trình duyệt này).';await this.options.store.update(first);return;}this.activeJob=first;try{
   if(first.resumeRequired){if(first.importId&&!first.schemaImported){try{const result=await new SolutionService(this.client).importStatus(target,first);if(result!=='pending'){first.schemaImported=result==='succeeded';first.status=result==='succeeded'?'partial':'failed';first.step=result==='succeeded'?'Import cũ đã hoàn tất. Bấm Thử lại bước còn lại để tiếp tục.':'Import cũ thất bại trên Microsoft.';first.error=result==='failed'?{code:'IMPORT_FAILED',message:first.step}:undefined;await this.options.store.update(first);}}catch(error){first.error=safeError(error);first.step=first.error.message;await this.options.store.update(first);}}return;}
   await this.worker.tick(target);
  }finally{this.activeJob=undefined;const latest=await this.options.store.getJob(first.id);if(latest&&terminalStatuses.includes(latest.status)&&!(await this.options.store.pendingWrites(first.id)).length)await this.reservations.release(target,first.id);}});}
 };this.ticking=run().finally(()=>{this.ticking=undefined;});return this.ticking;}
 private async enrich(plan:TransferPlan){
  plan.warnings=[...new Set([...plan.warnings,'Solution export dùng các thành phần đã publish ở nguồn.'])];
  if(plan.request.includeData){plan.dataPreflight=await this.data.inspect(plan);plan.blockers.push(...plan.dataPreflight.blockers);if(plan.dataPreflight.references.length)plan.blockers.push('Cần ánh xạ các bản ghi lookup chưa có ở đích.');}
  if(plan.request.kind==='flow'){try{plan.flowPreflight=await this.flows.inspect(plan);plan.blockers.push(...plan.flowPreflight.blockers);this.flows.parameters(plan);}catch(error){plan.blockers.push(safeError(error).message);}plan.warnings.push('Giữ nguyên flow nguồn. Flow đích Off; kiểm tra connection và environment variable trước khi bật.');}
  plan.blockers=[...new Set(plan.blockers)];plan.warnings=[...new Set(plan.warnings)];return this.planner.put(plan);
 }
 async request<T>(path:string,body?:unknown):Promise<T>{
  if(this.stopped)throw new AppError('SESSION_CLOSED','Phiên đã đóng. Đăng nhập lại.');if(!this.options.auth.getAccount())throw new AppError('AUTH_INTERACTION_REQUIRED','Đăng nhập Microsoft trước.');
  try{return await this.dispatch(path,body) as T;}catch(error){if(error instanceof z.ZodError)throw new AppError('INVALID_INPUT','Thông tin không hợp lệ. Kiểm tra ID, môi trường và lựa chọn.');throw error;}
 }
 private async dispatch(path:string,body?:unknown):Promise<unknown>{
  const url=new URL(path,'https://local.invalid');if(url.origin!=='https://local.invalid')throw new AppError('INVALID_PATH','Đường dẫn không hợp lệ.');const route=url.pathname;const store=this.options.store;
  if(route==='/api/environments')return {configured:true,environments:await Promise.all(Object.values(environments).map(async env=>{try{await this.client.request(env.id,'WhoAmI');return {...env,connected:true};}catch(error){return {...env,connected:false,error:safeError(error)};}}))};
  if(route.startsWith('/api/catalog/')){
   const {source,target}=z.object({source:environmentSchema,target:environmentSchema}).parse(Object.fromEntries(url.searchParams));const kind=route.slice('/api/catalog/'.length);
   if(kind==='tables')return this.catalog.tables(source,target);if(kind==='flows')return this.catalog.flows(source,target);if(kind==='columns')return this.catalog.columns(source,target,guidSchema.parse(url.searchParams.get('tableId')));
   if(kind==='shared-tables'){const [src,dst]=await Promise.all([this.catalog.tables(source),this.catalog.rawTables(target)]);return {items:src.items.filter(t=>t.custom&&!t.managed&&dst.some(d=>d.LogicalName===t.logicalName)).map(t=>({...t,selectable:true,reason:undefined}))};}
  }
  if(route==='/api/plans'&&body!==undefined){
   const health=await this.dispatch('/api/environments') as {environments:{connected:boolean;error?:{message:string}}[]};if(health.environments.some(e=>!e.connected))throw new AppError('ENVIRONMENT_NOT_READY',health.environments.filter(e=>!e.connected).map(e=>e.error?.message).join(' '));
   return this.enrich(await this.planner.createPlan(requestSchema.parse(body)));
  }
  const planRoute=route.match(/^\/api\/plans\/([^/]+)(?:\/(dependencies|references|flow-mappings))?$/);
  if(planRoute){const id=guidSchema.parse(planRoute[1]);if(!planRoute[2])return this.planner.get(id);
   if(planRoute[2]==='dependencies'){const {acceptedIds}=z.object({acceptedIds:z.array(guidSchema).max(300)}).parse(body);return this.enrich(await this.planner.resolveDependencies(id,acceptedIds));}
   const plan=await this.planner.get(id);
   if(planRoute[2]==='flow-mappings'){if(plan.request.kind!=='flow')throw new AppError('INVALID_KIND','Không phải kế hoạch flow.');const {configureLater,...mappings}=z.object({configureLater:z.boolean().optional(),connections:z.record(z.string().max(200),z.string().max(1000)),variables:z.record(z.string().max(200),z.string().max(10000))}).parse(body);plan.request.deferFlowConfiguration=configureLater===true;plan.flowMappings=configureLater?undefined:mappings;plan.blockers=plan.blockers.filter(b=>!b.includes('connection và environment variable'));return this.enrich(plan);}
   const {mappings}=z.object({mappings:z.array(z.object({sourceTable:z.string().regex(/^[a-zA-Z0-9_]+$/),sourceId:guidSchema,targetId:guidSchema})).max(10000)}).parse(body);if(!plan.dataPreflight)throw new AppError('NO_DATA_PREFLIGHT','Không có dữ liệu cần ánh xạ.');plan.dataPreflight.mappings=mappings;plan.blockers=plan.blockers.filter(b=>!b.includes('ánh xạ')&&!plan.dataPreflight?.blockers.includes(b));return this.enrich(plan);
  }
  if(route==='/api/jobs'){
   if(body===undefined){const jobs=await store.list();for(const job of jobs){if(!job.schemaImported||!['partial','awaiting-input'].includes(job.status))continue;const plan=await this.planner.get(job.planId);job.sessionMappingsRequired=plan.request.kind==='flow'&&!plan.request.deferFlowConfiguration&&!plan.flowMappings&&!!((plan.flowPreflight?.connections.length||0)+(plan.flowPreflight?.variables.length||0));}return {jobs};}if(!this.locks.available)throw new AppError('BROWSER_UNSUPPORTED','Trình duyệt cần hỗ trợ Web Locks và IndexedDB để chuyển đổi.');
   const input=z.object({planId:guidSchema,hash:z.string().length(64),idempotencyKey:guidSchema}).parse(body);const previous=await store.findByKey(input.idempotencyKey);if(previous){if(previous.planId!==input.planId)throw new AppError('IDEMPOTENCY_CONFLICT','Khóa yêu cầu thuộc kế hoạch khác.');return previous;}
   const plan=await this.planner.validatePlan(input.planId,input.hash);if(plan.request.kind==='flow'){const info=await this.flows.inspect(plan);if(info.blockers.length)throw new AppError('FLOW_BLOCKED',info.blockers.join(' '));this.flows.parameters(plan);}if(plan.request.includeData){const info=await this.data.inspect(plan);if(info.blockers.length||info.references.length)throw new AppError('DATA_BLOCKED','Cần kiểm tra lại dữ liệu/tham chiếu.');}
   this.hasWork=true;return store.createJob(plan,input.idempotencyKey);
  }
  const jobRoute=route.match(/^\/api\/jobs\/([^/]+)(?:\/(cancel|retry|continue|session-mappings))?$/);
  if(jobRoute){const id=guidSchema.parse(jobRoute[1]);const job=await store.getJob(id);if(!job)throw new AppError('JOB_NOT_FOUND','Không tìm thấy job.');if(!jobRoute[2])return job;
   if(jobRoute[2]==='cancel'){if(job.importId&&!job.schemaImported)throw new AppError('IMPORT_IN_PROGRESS','Import đã gửi Microsoft; tiếp tục theo dõi kết quả.');job.cancelRequested=true;return store.update(job);}
   if(jobRoute[2]==='session-mappings'){const plan=await this.planner.get(job.planId);if(plan.request.kind!=='flow'||plan.request.deferFlowConfiguration||!job.schemaImported)throw new AppError('INVALID_KIND','Job không cần khôi phục cấu hình Flow.');const mappings=z.object({connections:z.record(z.string().max(200),z.string().min(1).max(1000)),variables:z.record(z.string().max(200),z.string().max(10000))}).parse(body);await this.planner.restoreMappings(job.planId,job.planHash,mappings);return {restored:true};}
   if((await store.pendingWrites(id)).length)throw new AppError('WRITE_OUTCOME_UNKNOWN','Có thao tác ghi chưa xác định kết quả. Không tự gửi lại.');
   if(jobRoute[2]==='retry'&&(job.status!=='partial'||!job.schemaImported))throw new AppError('UNSAFE_RETRY','Chỉ tiếp tục job partial đã nhập cấu trúc.');
   if(jobRoute[2]==='continue'&&job.error?.code!=='AUTH_INTERACTION_REQUIRED')throw new AppError('UNSAFE_RETRY','Cần đối chiếu job trước.');
   const plan=await this.planner.get(job.planId);if(plan.hash!==job.planHash)throw new AppError('PLAN_MANIFEST_CHANGED','Kế hoạch không khớp job.');if(plan.request.kind==='flow')this.flows.parameters(plan);job.status='queued';job.error=undefined;job.cancelRequested=false;if(jobRoute[2]==='retry')job.resumeRequired=false;return store.update(job);
  }
  throw new AppError('NOT_FOUND','Không có tác vụ này.',404);
 }
 async openSolution(id:string){const job=await this.options.store.getJob(guidSchema.parse(id));if(!job?.schemaImported||!job.solutionName||!/^[a-zA-Z0-9_]+$/.test(job.solutionName))throw new AppError('SOLUTION_NOT_IMPORTED','Job chưa xác nhận nhập Solution.');let matches=await this.client.all<{solutionid:string}>(job.target,`solutions?$select=solutionid&$filter=uniquename eq '${job.solutionName}'&$top=2`);if(!matches.length)matches=await this.client.all<{solutionid:string}>(job.target,"solutions?$select=solutionid&$filter=uniquename eq 'Default'&$top=2");if(matches.length!==1)throw new AppError('SOLUTION_NOT_FOUND','Không xác định được Solution đích.');const info=await this.client.request<{Detail:{EnvironmentId:string}}>(job.target,"RetrieveCurrentOrganization(AccessType=@p1)?@p1=Microsoft.Dynamics.CRM.EndpointAccessType'Default'");return `https://make.powerapps.com/environments/${encodeURIComponent(info.Detail.EnvironmentId)}/solutions/${encodeURIComponent(matches[0].solutionid)}`;}
}
