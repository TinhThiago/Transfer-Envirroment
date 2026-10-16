import {terminalStatuses,type Job,type TransferPlan} from '../../shared/contracts';
import type {Planner} from '../plans/planner';
import type {SolutionService} from '../solutions/solution';
import type {DataService} from '../data/service';
import type {FlowService} from '../flows/flows';
import {AppError,safeError} from '../errors';
import type {JobStorePort as JobStore} from '../ports';
import {verifyTableAssets} from '../solutions/verify';
export class Worker{
 private running=false;
 constructor(private store:JobStore,private planner:Planner,private solutions:SolutionService,private data:DataService,private flows:FlowService,private sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))){}
 async tick(target?:Job['target']){
  if(this.running)return;this.running=true;
  try{const blocked=new Set<string>();for(const job of await this.store.unfinished()){
   if(target&&job.target!==target)continue;if(terminalStatuses.includes(job.status))continue;if(blocked.has(job.target))continue;blocked.add(job.target);if(job.status==='awaiting-input'&&(!job.importId||job.schemaImported))continue;await this.run(job);
  }}finally{this.running=false;}
 }
 private async run(job:Job){
  const save=async()=>{const fresh=await this.store.getJob(job.id);job.cancelRequested=fresh?.cancelRequested||job.cancelRequested;await this.store.update(job);};
  const checkCancel=async()=>{if((await this.store.getJob(job.id))?.cancelRequested)throw new AppError('CANCELLED','Đã dừng tại ranh giới an toàn. Những thay đổi đã thực hiện vẫn được giữ.');};
  try{
   let plan=await this.planner.get(job.planId);if(job.planHash!==plan.hash)throw new AppError('PLAN_MANIFEST_CHANGED','Kế hoạch không còn khớp bản đã duyệt cho job. Không thực hiện thêm thao tác ghi.');
   if(!job.importId&&!job.schemaImported){
    await checkCancel();job.status='checking';job.step='Kiểm tra lại nguồn, đích và dependency';await save();plan=await this.planner.validatePlan(plan.id,job.planHash);
    if(plan.request.includeData){const info=await this.data.inspect(plan);if(!info.supported||info.references.length)throw new AppError('DATA_PREFLIGHT_FAILED','Cần giải quyết dữ liệu/tham chiếu trước khi chuyển.');}
    if(plan.request.kind==='flow'){const info=await this.flows.inspect(plan);if(info.blockers.length)throw new AppError('FLOW_BLOCKED',info.blockers.join(' '));plan.flowPreflight=info;this.flows.parameters(plan);}
    job.status='exporting';job.step='Đóng gói toàn bộ thành phần đã duyệt';await save();const artifact=await this.solutions.build(plan,job,()=>save());await checkCancel();
    // Recheck destination immediately before import. A stale plan must not write.
    await this.planner.validatePlan(plan.id,plan.hash);
    if(plan.request.kind==='flow')await this.flows.inspect(plan);
    await this.solutions.startImport(plan,artifact,job,()=>save(),plan.request.kind==='flow'?this.flows.parameters(plan):[]);return;
   }
   if(!job.schemaImported){job.status='importing';job.step='Theo dõi import trên Dataverse';await save();const status=await this.solutions.importStatus(plan.request.target,job);if(status==='pending')return;if(status==='failed')throw new AppError('IMPORT_FAILED',`Import thất bại. Tra cứu ImportJobId ${job.importId}.`);job.schemaImported=true;await save();}
   await checkCancel();
   // Unmanaged imports need publication before data APIs and published metadata are used.
   job.step='Công bố cấu trúc đã nhập';await save();await this.solutions.publish(plan);
   job.step='Kiểm tra metadata sau công bố';await save();await this.verifyWithPropagation(plan,checkCancel);
   if(plan.request.includeData){job.status='copying-data';job.step='Tạo bản ghi, gán lookup và liên kết N:N';await save();await this.data.copy(plan,job.id,this.store,checkCancel);job.counts=(await this.store.getJob(job.id))!.counts;}
   job.status='verifying';job.step='Kiểm tra thành phần tại môi trường đích';await save();if(plan.request.kind==='flow'){await this.flows.applyMappings(plan);await this.verify(plan);}
   try{await this.solutions.cleanup(plan,job);}catch{job.warnings.push('Chưa dọn được Solution tạm ở nguồn. Không ảnh hưởng thành phần đã nhập.');}
   if(plan.request.kind==='flow'&&plan.request.deferFlowConfiguration)job.warnings=[...new Set([...job.warnings,...this.flows.configurationWarnings(plan)])];
   job.status='succeeded';job.step=plan.request.kind==='flow'&&plan.request.deferFlowConfiguration?'Đã chuyển flow Off — chờ cấu hình connection tại đích':'Chuyển đổi hoàn tất';await save();
  }catch(error){const info=safeError(error);info.message=`${job.step}: ${info.message}`;job.error=info;if(info.code==='AUTH_INTERACTION_REQUIRED'){job.status='awaiting-input';}else if(info.code==='CANCELLED'){job.status=job.schemaImported?'partial':'cancelled';}else if((job.importId&&!job.importRejected&&!job.schemaImported&&info.code!=='IMPORT_FAILED')||(job.schemaImported&&info.code==='WRITE_OUTCOME_UNKNOWN')){job.status='awaiting-input';}else{job.status=job.schemaImported?'partial':'failed';}job.step=info.message;await save();}
 }
 private async verifyWithPropagation(plan:TransferPlan,checkCancel:()=>void|Promise<void>){
  if(plan.request.kind==='flow')return;
  for(let attempt=0;;attempt++){
   await checkCancel();try{await this.verify(plan);return;}catch(error){
    if(!(error instanceof AppError)||!(error.code==='VERIFY_FAILED'||error.code==='DATAVERSE_ERROR'&&error.upstreamStatus===400&&/0x80041102/i.test(error.message))||attempt>=4)throw error;
    // Only retry read-only checks. Never resubmit an import or repeat a data write.
    await this.sleep(2000*2**attempt);
   }
  }
 }
 private async verify(plan:TransferPlan){
  const {source,target}=plan.request;
  if(plan.request.kind==='flow'){await this.flows.verify(plan);return;}
  if(plan.request.kind==='table'){
   const tables=(await this.planner.catalog.tables(target)).items;
   for(const component of plan.components.filter(c=>c.kind==='table')){
    const dst=tables.find(t=>t.logicalName===component.logicalName);if(!dst)throw new AppError('VERIFY_FAILED',`Chưa tìm thấy bảng ${component.logicalName} ở đích.`);
    const [srcCols,dstCols]=await Promise.all([this.planner.catalog.attributes(source,component.id),this.planner.catalog.attributes(target,dst.id)]);
    if(srcCols.some(c=>!dstCols.some(d=>d.LogicalName===c.LogicalName)))throw new AppError('VERIFY_FAILED',`Bảng ${component.logicalName} còn thiếu column ở đích.`);
    await verifyTableAssets(this.planner.catalog,source,target,component,dst);
   }
  }else{
   const src=(await this.planner.catalog.rawTables(source)).find(t=>t.MetadataId===plan.request.tableId)!;const dst=(await this.planner.catalog.rawTables(target)).find(t=>t.LogicalName===src.LogicalName);if(!dst)throw new AppError('VERIFY_FAILED','Không tìm thấy bảng đích.');
   const columns=await this.planner.catalog.attributes(target,dst.MetadataId);if(plan.components.some(c=>c.kind==='column'&&!columns.some(d=>d.LogicalName===c.logicalName)))throw new AppError('VERIFY_FAILED','Column chưa có ở đích.');
  }
 }
}
