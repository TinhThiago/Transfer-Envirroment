import type {FlowMappings,FlowPreflight,TransferPlan} from '../../shared/contracts';
import type {CatalogService} from '../catalog/catalog';
import {AppError} from '../errors';
export function validateFlowMappings(connections:string[],variables:string[],mappings:FlowMappings){if(connections.some(c=>!mappings.connections[c]?.trim())||variables.some(v=>!Object.hasOwn(mappings.variables,v)))throw new AppError('FLOW_MAPPING_REQUIRED','Điền đủ connection và environment variable cho môi trường đích.');}
export class FlowService{
 constructor(private catalog:CatalogService){}
 async inspect(plan:TransferPlan):Promise<FlowPreflight>{
  const env=plan.request.source;const flows=(await this.catalog.flows(env)).items.filter(f=>plan.components.some(c=>c.id===f.id));
  const names=new Set<string>();const variableIds=new Set<string>();const blockers:string[]=[];
  for(const f of flows){
   const flow=await this.catalog.client.request<{clientdata:string}>(env,`workflows(${f.id})?$select=clientdata`);
   let parsed:unknown;try{parsed=JSON.parse(flow.clientdata);}catch{throw new AppError('FLOW_DEFINITION_INVALID','Không đọc được định nghĩa Cloud flow.');}
   const scan=(value:unknown)=>{if(!value||typeof value!=='object')return;for(const [k,v] of Object.entries(value)){if(k==='connectionReferenceLogicalName'&&typeof v==='string')names.add(v);else scan(v);}};scan(parsed);
   const deps=await this.catalog.client.all<{requiredcomponenttype:number;requiredcomponentobjectid:string}>(env,`dependencies?$select=requiredcomponenttype,requiredcomponentobjectid&$filter=dependentcomponentobjectid eq ${f.id}`);
   deps.filter(d=>d.requiredcomponenttype===380).forEach(d=>variableIds.add(d.requiredcomponentobjectid));
  }
  const refs=await this.catalog.client.all<{connectionreferenceid:string;connectionreferencelogicalname:string;connectionreferencedisplayname:string}>(env,'connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname');
  const connections:FlowPreflight['connections']=[];
  for(const name of names){const ref=refs.find(r=>r.connectionreferencelogicalname===name);if(!ref){blockers.push(`Không tìm thấy connection reference ${name}.`);continue;}
   const components=await this.catalog.client.all<{componenttype:number}>(env,`solutioncomponents?$select=componenttype&$filter=objectid eq ${ref.connectionreferenceid}&$top=1`);
   if(!components.length){blockers.push(`Connection reference ${name} chưa có trong Solution.`);continue;}
   connections.push({id:ref.connectionreferenceid,logicalName:name,displayName:ref.connectionreferencedisplayname||name,type:components[0].componenttype});
  }
  const variables:FlowPreflight['variables']=[];
  for(const id of variableIds){const def=await this.catalog.client.request<{schemaname:string;displayname:string;type:number}>(env,`environmentvariabledefinitions(${id})?$select=schemaname,displayname,type`);
   if(def.type===100000005){blockers.push(`Biến secret ${def.schemaname}: cấu hình riêng ở đích trước.`);continue;}
   const values=await this.catalog.client.all<{environmentvariablevalueid:string}>(env,`environmentvariablevalues?$select=environmentvariablevalueid&$filter=_environmentvariabledefinitionid_value eq ${id}`);
   variables.push({id,logicalName:def.schemaname,displayName:def.displayname||def.schemaname,type:380,valueIds:values.map(v=>v.environmentvariablevalueid)});
  }
  return {connections,variables,blockers};
 }
 parameters(plan:TransferPlan){
  if(plan.request.deferFlowConfiguration)return [];
  const info=plan.flowPreflight;if(!info)return [];const mappings=plan.flowMappings||{connections:{},variables:{}};
  validateFlowMappings(info.connections.map(r=>r.logicalName),info.variables.map(v=>v.logicalName),mappings);
  return info.connections.map(ref=>({'@odata.type':'Microsoft.Dynamics.CRM.connectionreference',connectionreferenceid:ref.id,connectionreferencelogicalname:ref.logicalName,connectionid:mappings.connections[ref.logicalName]}));
 }
 async applyMappings(plan:TransferPlan){
  if(plan.request.deferFlowConfiguration){await this.verify(plan);return;}
  await this.verify(plan);const info=plan.flowPreflight;if(!info)return;this.parameters(plan);const target=plan.request.target;
  for(const variable of info.variables){
   if(!/^[a-zA-Z0-9_]+$/.test(variable.logicalName))throw new AppError('INVALID_SCHEMA','Tên environment variable không hợp lệ.');
   const value=plan.flowMappings!.variables[variable.logicalName];const definitions=await this.catalog.client.all<{environmentvariabledefinitionid:string}>(target,`environmentvariabledefinitions?$select=environmentvariabledefinitionid&$filter=schemaname eq '${variable.logicalName}'`);
   if(definitions.length!==1)throw new AppError('VARIABLE_NOT_FOUND','Không xác định duy nhất environment variable ở đích.');const definitionId=definitions[0].environmentvariabledefinitionid;
   const values=await this.catalog.client.all<{environmentvariablevalueid:string;value:string;ismanaged:boolean}>(target,`environmentvariablevalues?$select=environmentvariablevalueid,value,ismanaged&$filter=_environmentvariabledefinitionid_value eq ${definitionId} and statecode eq 0`);const editable=values.filter(v=>!v.ismanaged);
   if(editable.length){for(const current of editable)if(current.value!==value)await this.catalog.client.request(target,`environmentvariablevalues(${current.environmentvariablevalueid})`,{method:'PATCH',body:{value},headers:{'If-Match':'*'}});}
   else await this.catalog.client.request(target,'environmentvariablevalues',{method:'POST',body:{value,'environmentvariabledefinitionid@odata.bind':`/environmentvariabledefinitions(${definitionId})`}});
   const effective=await this.catalog.client.request<{Value:string}>(target,`RetrieveEnvironmentVariableValue(DefinitionSchemaName='${variable.logicalName}')`);if(effective.Value!==value)throw new AppError('VARIABLE_VERIFY_FAILED','Giá trị environment variable có hiệu lực chưa khớp cấu hình đã duyệt.');
  }
  await this.verify(plan);
 }
 async verify(plan:TransferPlan){
  for(const flow of plan.components.filter(c=>c.kind==='flow')){const dst=await this.catalog.client.request<{statecode:number}>(plan.request.target,`workflows(${flow.id})?$select=statecode`);if(dst.statecode!==0)throw new AppError('FLOW_ACTIVE','Flow đích chưa ở trạng thái Tắt. Kiểm tra trong Power Automate ngay.');}
  for(const ref of plan.flowPreflight?.connections||[]){if(!plan.request.deferFlowConfiguration&&!plan.flowMappings?.connections[ref.logicalName])throw new AppError('FLOW_MAPPING_REQUIRED','Cần nạp lại connection mapping đã duyệt sau khi server khởi động lại.');const connections=await this.catalog.client.all<{connectionid:string}>(plan.request.target,`connectionreferences?$select=connectionid&$filter=connectionreferencelogicalname eq '${ref.logicalName.replaceAll("'","''")}'`);if(connections.length!==1||(!plan.request.deferFlowConfiguration&&connections[0].connectionid!==plan.flowMappings!.connections[ref.logicalName]))throw new AppError('CONNECTION_VERIFY_FAILED','Connection reference ở đích chưa khớp cấu hình đã duyệt.');}
 }
 configurationWarnings(plan:TransferPlan){if(!plan.request.deferFlowConfiguration)return [];return ['Flow đã chuyển ở chế độ Off. Mở Solution tại môi trường đích, gắn connection và kiểm tra environment variable trước khi bật.',...(plan.flowPreflight?.connections||[]).map(r=>`Cần cấu hình/kiểm tra connection: ${r.displayName} (${r.logicalName}).`),...(plan.flowPreflight?.variables||[]).map(v=>`Cần cấu hình/kiểm tra environment variable: ${v.displayName} (${v.logicalName}).`)];}
}
