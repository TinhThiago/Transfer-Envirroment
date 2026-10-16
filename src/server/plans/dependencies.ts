import type {ComponentRef,Dependency,TableMetadata,TransferRequest} from '../../shared/contracts';
import type {CatalogService,RawTable} from '../catalog/catalog';
import {AppError} from '../errors';
export async function walkDependencies(roots:ComponentRef[],read:(item:ComponentRef)=>Promise<ComponentRef[]>):Promise<Dependency[]>{
 const selected=new Set(roots.map(r=>r.id));const result=new Map<string,Dependency>();const cache=new Map<string,ComponentRef[]>();
 for(const root of roots){const visited=new Set<string>();const queue=[root];
  while(queue.length){const item=queue.shift()!;if(visited.has(item.id))continue;visited.add(item.id);
   let children=cache.get(item.id);if(!children){children=await read(item);cache.set(item.id,children);}
   for(const child of children){if(!selected.has(child.id)){const dep=result.get(child.id)||{...child,forIds:[]};if(!dep.forIds.includes(root.id))dep.forIds.push(root.id);result.set(child.id,dep);}if(child.selectable)queue.push(child);}
  }
 }
 return [...result.values()];
}
export function selectAfterDecision(roots:ComponentRef[],deps:Dependency[],accepted:string[]):ComponentRef[]{
 const chosen=new Set(accepted);return roots.filter(root=>!deps.some(dep=>dep.forIds.includes(root.id)&&!chosen.has(dep.id)));
}
interface DependencyRow{requiredcomponentobjectid:string;requiredcomponentparentid?:string;requiredcomponenttype:number;dependencytype?:number}
export class DependencyReader{
 private snapshots=new WeakMap<TransferRequest,Promise<{tables:TableMetadata[];targetTables:RawTable[]}>>();
 constructor(private catalog:CatalogService){}
 async required(request:TransferRequest,item:ComponentRef):Promise<ComponentRef[]>{
  const {source,target}=request;let snapshot=this.snapshots.get(request);if(!snapshot){snapshot=Promise.all([this.catalog.tables(source),this.catalog.rawTables(target)]).then(([catalog,targetTables])=>({tables:catalog.items,targetTables}));this.snapshots.set(request,snapshot);}const {tables,targetTables}=await snapshot;const ownTable=item.kind==='table'?item.id:request.tableId;
  const rows=await this.catalog.client.all<DependencyRow>(source,`dependencies?$select=dependencytype,requiredcomponentobjectid,requiredcomponentparentid,requiredcomponenttype&$filter=${item.kind==='table'?`(dependentcomponentobjectid eq ${item.id} or dependentcomponentparentid eq ${item.id})`:`dependentcomponentobjectid eq ${item.id}`}`);
  const resolved=new Map<string,ComponentRef>();
  const includedIds=new Set<string>([item.id]);
  // A table exports all relationships, including incoming relationships.
  if(item.kind==='table'){
   type OneRelationship={MetadataId:string;ReferencingEntity:string;ReferencedEntity:string};type ManyRelationship={MetadataId:string;Entity1LogicalName:string;Entity2LogicalName:string};
   const relations=await this.catalog.client.request<{OneToManyRelationships:OneRelationship[];ManyToOneRelationships:OneRelationship[];ManyToManyRelationships:ManyRelationship[];Keys:{MetadataId:string}[]}>(source,`EntityDefinitions(${item.id})?$select=LogicalName&$expand=OneToManyRelationships($select=MetadataId,ReferencingEntity,ReferencedEntity),ManyToOneRelationships($select=MetadataId,ReferencingEntity,ReferencedEntity),ManyToManyRelationships($select=MetadataId,Entity1LogicalName,Entity2LogicalName),Keys($select=MetadataId)`);
   for(const rel of [...(relations.OneToManyRelationships||[]),...(relations.ManyToOneRelationships||[]),...(relations.ManyToManyRelationships||[]),...(relations.Keys||[])])if(rel.MetadataId)includedIds.add(rel.MetadataId);
   const [attributes,views,forms,charts,rules]=await Promise.all([
    this.catalog.attributes(source,item.id),
    this.catalog.client.all<{savedqueryid:string}>(source,`savedqueries?$select=savedqueryid&$filter=returnedtypecode eq '${item.logicalName}'`),
    this.catalog.client.all<{formid:string}>(source,`systemforms?$select=formid&$filter=objecttypecode eq '${item.logicalName}'`),
    this.catalog.client.all<{savedqueryvisualizationid:string}>(source,`savedqueryvisualizations?$select=savedqueryvisualizationid&$filter=primaryentitytypecode eq '${item.logicalName}'`),
    this.catalog.client.all<{workflowid:string}>(source,`workflows?$select=workflowid&$filter=primaryentity eq '${item.logicalName}' and category eq 2 and type eq 1`),
   ]);
   for(const attribute of attributes)includedIds.add(attribute.MetadataId);for(const view of views)includedIds.add(view.savedqueryid);for(const form of forms)includedIds.add(form.formid);for(const chart of charts)includedIds.add(chart.savedqueryvisualizationid);for(const rule of rules)includedIds.add(rule.workflowid);
   const names=new Set([...(relations.OneToManyRelationships||[]).flatMap(r=>[r.ReferencingEntity,r.ReferencedEntity]),...(relations.ManyToManyRelationships||[]).flatMap(r=>[r.Entity1LogicalName,r.Entity2LogicalName])]);
   for(const table of tables)if(table.id!==item.id&&names.has(table.logicalName)&&!targetTables.some(t=>t.LogicalName===table.logicalName))resolved.set(table.id,table.custom&&!table.managed?table:{...table,selectable:false,reason:'Bảng system/managed liên quan chưa có ở đích.'});
  }
  for(const row of rows){
   const id=row.requiredcomponentobjectid;let type=row.requiredcomponenttype;if(!id||includedIds.has(id)||(item.kind==='table'&&row.requiredcomponentparentid&&includedIds.has(row.requiredcomponentparentid)))continue;
   const sourceComponents=await this.catalog.client.all<{componenttype:number}>(source,`solutioncomponents?$select=componenttype&$filter=objectid eq ${id}&$top=1`);
   // Internal non-exportable nodes belong to the platform's component lifecycle.
   // Do not turn them into missing external assets; published dependencies remain checked.
   if(row.dependencytype===1&&!sourceComponents.length)continue;
   if(sourceComponents[0]?.componenttype)type=sourceComponents[0].componenttype;
   if(request.kind==='flow'){
    if(type===29){const flow=(await this.catalog.flows(source,target)).items.find(f=>f.id===id);if(flow?.selectable){resolved.set(id,flow);continue;}}
    if(type===380){const variable=await this.catalog.client.request<{schemaname:string;displayname:string}>(source,`environmentvariabledefinitions(${id})?$select=schemaname,displayname`);resolved.set(id,{id,kind:'dependency',componentType:type,logicalName:variable.schemaname,displayName:variable.displayname||variable.schemaname,selectable:true});continue;}
    const refs=await this.catalog.client.all<{connectionreferenceid:string;connectionreferencelogicalname:string;connectionreferencedisplayname:string}>(source,`connectionreferences?$select=connectionreferenceid,connectionreferencelogicalname,connectionreferencedisplayname&$filter=connectionreferenceid eq ${id}`);
    if(refs[0]){resolved.set(id,{id,kind:'dependency',componentType:type,logicalName:refs[0].connectionreferencelogicalname,displayName:refs[0].connectionreferencedisplayname,selectable:true});continue;}
   }
   const table=tables.find(t=>t.id===(type===1?id:row.requiredcomponentparentid));
   if(table){
    const dst=targetTables.find(t=>t.LogicalName===table.logicalName);
    if(!dst){resolved.set(table.id,table.custom&&!table.managed?table:{...table,selectable:false,reason:'Bảng system/managed bắt buộc chưa có ở đích.'});continue;}
    if(type===1)continue;
    if(type===2){const cols=await this.catalog.attributes(source,table.id);const col=cols.find(c=>c.MetadataId===id);if(col&&(await this.catalog.attributes(target,dst.MetadataId)).some(c=>c.LogicalName===col.LogicalName))continue;if(request.kind==='column'&&table.id===request.tableId){const sibling=(await this.catalog.columns(source,target,table.id)).items.find(c=>c.id===id);if(sibling?.selectable){resolved.set(id,sibling);continue;}}}
   }
   // Non-table assets must already exist at the destination; never silently pull an app/plugin.
   const existing=await this.catalog.client.all<{objectid:string}>(target,`solutioncomponents?$select=objectid&$filter=objectid eq ${id} and componenttype eq ${type}&$top=1`);
   if(existing.length)continue;
   resolved.set(id,{id,kind:'dependency',componentType:type,logicalName:id,displayName:table?`${table.displayName} · thành phần ${type}`:`Dependency loại ${type}`,selectable:false,reason:'Thành phần bắt buộc chưa có ở đích; chuyển qua Solution riêng trước.'});
  }
  return [...resolved.values()];
 }
}
