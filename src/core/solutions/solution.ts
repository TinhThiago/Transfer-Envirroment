import {randomUUID} from '../binary';
import type {ComponentRef,Job,TransferPlan,EnvironmentId} from '../../shared/contracts';
import type {MicrosoftPort as MicrosoftClient} from '../ports';
import {AppError} from '../errors';
import {prepareInactiveFlowArtifact} from '../flows/artifact';
export function componentParameters(component:Pick<ComponentRef,'id'|'componentType'>,solutionName:string){return {ComponentId:component.id,ComponentType:component.componentType,SolutionUniqueName:solutionName,AddRequiredComponents:false,...component.componentType===1?{DoNotIncludeSubcomponents:false}:{}};}
export function importParameters(base64:string,importId:string,componentParameters:unknown[]=[]){return {OverwriteUnmanagedCustomizations:false,PublishWorkflows:false,CustomizationFile:base64,ImportJobId:importId,SkipProductUpdateDependencies:false,...componentParameters.length?{ComponentParameters:componentParameters}:{}};}
export class SolutionService{
 constructor(private client:MicrosoftClient){}
 private async includeTableRelationships(plan:TransferPlan,job:Job){
  const tables=plan.components.filter(c=>c.kind==='table');if(!tables.length)return;const source=plan.request.source;
  const included=async()=>new Set((await this.client.all<{objectid:string}>(source,`solutioncomponents?$select=objectid&$filter=_solutionid_value eq ${job.sourceSolutionId}`)).map(c=>c.objectid));let ids=await included();
  type Relation={MetadataId:string;SchemaName:string;IsManaged?:boolean;ReferencingEntity?:string;ReferencingAttribute?:string};
  for(const table of tables){
   const metadata=await this.client.request<{OneToManyRelationships:Relation[];ManyToOneRelationships:Relation[];ManyToManyRelationships:Relation[]}>(source,`EntityDefinitions(${table.id})?$select=LogicalName&$expand=OneToManyRelationships($select=MetadataId,SchemaName,IsManaged,ReferencingEntity,ReferencingAttribute),ManyToOneRelationships($select=MetadataId,SchemaName,IsManaged,ReferencingEntity,ReferencingAttribute),ManyToManyRelationships($select=MetadataId,SchemaName,IsManaged)`);
   for(const rel of [...(metadata.OneToManyRelationships||[]),...(metadata.ManyToOneRelationships||[]),...(metadata.ManyToManyRelationships||[])]){
    if(ids.has(rel.MetadataId))continue;if(rel.IsManaged)continue;
    if(rel.ReferencingEntity&&rel.ReferencingAttribute){
     const owner=await this.client.request<{MetadataId:string}>(source,`EntityDefinitions(LogicalName='${rel.ReferencingEntity}')?$select=MetadataId`);
     const columns=await this.client.all<{MetadataId:string;LogicalName:string;IsCustomAttribute:boolean;IsManaged:boolean}>(source,`EntityDefinitions(${owner.MetadataId})/Attributes?$select=MetadataId,LogicalName,IsCustomAttribute,IsManaged`);const lookup=columns.find(c=>c.LogicalName===rel.ReferencingAttribute);
     if(lookup?.IsCustomAttribute&&!lookup.IsManaged&&!ids.has(lookup.MetadataId)){await this.client.request(source,'AddSolutionComponent',{method:'POST',body:componentParameters({id:lookup.MetadataId,componentType:2},job.solutionName!)});ids.add(lookup.MetadataId);}
    }
    // Adding a lookup may automatically bring its relationship; avoid adding it twice.
    ids=await included();if(!ids.has(rel.MetadataId)){await this.client.request(source,'AddSolutionComponent',{method:'POST',body:componentParameters({id:rel.MetadataId,componentType:10},job.solutionName!)});ids.add(rel.MetadataId);}
   }
  }
 }
 async build(plan:TransferPlan,job:Job,save:(job:Job)=>void|Promise<void>){
  const env=plan.request.source;
  if(!job.solutionName){job.solutionName='phtransfer_'+job.id.replaceAll('-','');job.sourceSolutionId=randomUUID();await save(job);}
  const existing=await this.client.all<{solutionid:string}>(env,`solutions?$select=solutionid&$filter=uniquename eq '${job.solutionName}'`);
  if(!existing.length){const defaults=await this.client.all<{_publisherid_value:string}>(env,"solutions?$select=_publisherid_value&$filter=uniquename eq 'Default'&$top=1");if(!defaults[0]?._publisherid_value)throw new AppError('NO_PUBLISHER','Không lấy được publisher để tạo Solution tạm.');
   await this.client.request(env,'solutions',{method:'POST',body:{solutionid:job.sourceSolutionId,uniquename:job.solutionName,friendlyname:`PH Transfer · ${job.id.slice(0,8)}`,version:'1.0.0.0',description:'Temporary transfer container created by PH Environment Transfer.','publisherid@odata.bind':`/publishers(${defaults[0]._publisherid_value})`}});
  }
  for(const component of plan.components){if(plan.request.kind==='flow'&&plan.request.deferFlowConfiguration&&component.componentType===381)continue;await this.client.request(env,'AddSolutionComponent',{method:'POST',body:componentParameters(component,job.solutionName)});}
  await this.includeTableRelationships(plan,job);
  const exported=await this.client.request<{ExportSolutionFile:string}>(env,'ExportSolution',{method:'POST',body:{SolutionName:job.solutionName,Managed:false}});
  if(!exported.ExportSolutionFile)throw new AppError('EXPORT_EMPTY','Microsoft không trả gói Solution.');return exported.ExportSolutionFile;
 }
 async startImport(plan:TransferPlan,base64:string,job:Job,save:(job:Job)=>void,parameters:unknown[]=[]){
  if(plan.request.kind==='flow')base64=prepareInactiveFlowArtifact(base64,plan.components.filter(c=>c.kind==='flow').map(c=>c.id),plan.request.deferFlowConfiguration);
  job.importId=randomUUID();job.status='importing';job.step='Đang nhập Solution';await save(job);
  let result:{AsyncOperationId:string;ImportJobKey?:string};
  try{result=await this.client.request(plan.request.target,'ImportSolutionAsync',{method:'POST',body:importParameters(base64,job.importId,parameters)});}
  catch(error){if(error instanceof AppError){const http=error.upstreamStatus||error.status;if(http>=400&&http<500&&http!==408){job.importRejected=true;await save(job);}}throw error;}
  if(!result.AsyncOperationId)throw new AppError('IMPORT_OUTCOME_UNKNOWN','Chưa nhận được AsyncOperationId. Dùng ImportJobId để đối chiếu; không tự nhập lại.');
  job.asyncId=result.AsyncOperationId;await save(job);
 }
 async importStatus(env:EnvironmentId,job:Job):Promise<'pending'|'succeeded'|'failed'>{
  if(job.asyncId){const op=await this.client.request<{statecode:number;statuscode:number;errorcode?:number}>(env,`asyncoperations(${job.asyncId})?$select=statecode,statuscode,errorcode`);if(op.statecode!==3)return 'pending';return op.statuscode===30?'succeeded':'failed';}
  if(job.importId){try{const status=await this.client.request<{progress:number;completedon?:string;data?:string}>(env,`importjobs(${job.importId})?$select=progress,completedon,data`);if(status.completedon||status.progress>=100){if(status.data&&/result="failure"|success="false"|errorcode="(?!0")/i.test(status.data))return 'failed';if(status.data&&/result="success"|success="true"/i.test(status.data))return 'succeeded';throw new AppError('IMPORT_OUTCOME_UNKNOWN','Import đã kết thúc nhưng chưa có kết quả rõ ràng. Đối chiếu ImportJobId, không tự nhập lại.');}return 'pending';}catch(e){if(e instanceof AppError&&e.code==='NOT_FOUND')throw new AppError('IMPORT_OUTCOME_UNKNOWN','Chưa xác định được import đã được chấp nhận. Tra cứu ImportJobId trước khi chạy lại.');throw e;}}
  throw new AppError('IMPORT_OUTCOME_UNKNOWN','Thiếu thông tin theo dõi import.');
 }
 async publish(plan:TransferPlan){if(plan.request.kind==='flow')return;const tableNames=plan.request.kind==='table'?plan.components.map(c=>c.logicalName):[(await this.client.request<{LogicalName:string}>(plan.request.target,`EntityDefinitions(LogicalName='${(await this.client.request<{LogicalName:string}>(plan.request.source,`EntityDefinitions(${plan.request.tableId})?$select=LogicalName`)).LogicalName}')?$select=LogicalName`)).LogicalName];
  // Logical names come from server metadata, never client XML.
  if(tableNames.some(n=>!/^[a-zA-Z0-9_]+$/.test(n)))throw new AppError('INVALID_SCHEMA','Logical name không hợp lệ.');
  await this.client.request(plan.request.target,'PublishXml',{method:'POST',body:{ParameterXml:`<importexportxml><entities>${tableNames.map(n=>`<entity>${n}</entity>`).join('')}</entities></importexportxml>`}});
 }
 async cleanup(plan:TransferPlan,job:Job){
  if(!job.sourceSolutionId&&!job.solutionName)return;
  if(!job.schemaImported||!job.sourceSolutionId||job.solutionName!=='phtransfer_'+job.id.replaceAll('-','')||!/^phtransfer_[a-fA-F0-9]{32}$/.test(job.solutionName))throw new AppError('CLEANUP_MISMATCH','Không xác nhận được Solution tạm thuộc job đã import.');
  const containers:{env:EnvironmentId;id:string}[]=[];
  for(const env of [plan.request.source,plan.request.target]){
   const matches:{solutionid:string;uniquename:string;ismanaged:boolean}[]=await this.client.all<{solutionid:string;uniquename:string;ismanaged:boolean}>(env,`solutions?$select=solutionid,uniquename,ismanaged&$filter=uniquename eq '${job.solutionName}'&$top=2`);
   if(!matches.length)continue;
   const solution=matches[0];if(matches.length!==1||solution.uniquename!==job.solutionName||solution.ismanaged!==false||!solution.solutionid||(env===plan.request.source&&solution.solutionid!==job.sourceSolutionId))throw new AppError('CLEANUP_MISMATCH','Chỉ xóa container unmanaged khớp chính xác Solution tạm của job.');
   containers.push({env,id:solution.solutionid});
  }
  for(const {env,id} of containers){try{await this.client.request(env,`solutions(${id})`,{method:'DELETE'});}catch(error){if(!(error instanceof AppError&&error.code==='NOT_FOUND'))throw error;}}
 }
}
