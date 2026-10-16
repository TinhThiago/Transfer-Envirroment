import type {CatalogService} from '../catalog/catalog';
import type {EnvironmentId,TableMetadata} from '../../shared/contracts';
import {AppError} from '../errors';
export async function verifyTableAssets(catalog:CatalogService,source:EnvironmentId,target:EnvironmentId,src:Pick<TableMetadata,'id'|'logicalName'>,dst:Pick<TableMetadata,'id'>){
 const read=async(env:EnvironmentId,id:string)=>{
  const schema=await catalog.client.request<{OneToManyRelationships:{SchemaName:string}[];ManyToOneRelationships:{SchemaName:string}[];ManyToManyRelationships:{SchemaName:string}[];Keys:{SchemaName:string}[]}>(env,`EntityDefinitions(${id})?$select=LogicalName&$expand=OneToManyRelationships($select=SchemaName),ManyToOneRelationships($select=SchemaName),ManyToManyRelationships($select=SchemaName),Keys($select=SchemaName)`);
  const [views,forms,charts,rules]=await Promise.all([
   catalog.client.all<{savedqueryid:string}>(env,`savedqueries?$select=savedqueryid&$filter=returnedtypecode eq '${src.logicalName}'`),
   catalog.client.all<{formid:string}>(env,`systemforms?$select=formid&$filter=objecttypecode eq '${src.logicalName}'`),
   catalog.client.all<{savedqueryvisualizationid:string}>(env,`savedqueryvisualizations?$select=savedqueryvisualizationid&$filter=primaryentitytypecode eq '${src.logicalName}'`),
   catalog.client.all<{workflowid:string}>(env,`workflows?$select=workflowid&$filter=primaryentity eq '${src.logicalName}' and category eq 2 and type eq 1`),
  ]);
  return new Set([
   ...(schema.OneToManyRelationships||[]).map(r=>'relationship:'+r.SchemaName),...(schema.ManyToOneRelationships||[]).map(r=>'relationship:'+r.SchemaName),...(schema.ManyToManyRelationships||[]).map(r=>'relationship:'+r.SchemaName),...(schema.Keys||[]).map(k=>'key:'+k.SchemaName),...views.map(v=>'view:'+v.savedqueryid),...forms.map(f=>'form:'+f.formid),...charts.map(c=>'chart:'+c.savedqueryvisualizationid),...rules.map(r=>'rule:'+r.workflowid),
  ]);
 };
 const [expected,actual]=await Promise.all([read(source,src.id),read(target,dst.id)]);const missing=[...expected].filter(asset=>!actual.has(asset));if(missing.length)throw new AppError('ASSET_VERIFY_FAILED',`Bảng ${src.logicalName} còn thiếu ${missing.length} tài sản ở đích (${missing.slice(0,5).join(', ')}).`);
}
