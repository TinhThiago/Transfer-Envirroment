import type {DataPreflight,ReferenceMapping,TransferPlan,TableMetadata} from '../../shared/contracts';
import type {CatalogService,RawColumn} from '../catalog/catalog';
import type {JobStore} from '../jobs/store';
import {AppError} from '../errors';
import {copyRecords,type CopyRecord} from './copy';
interface LookupRelationship{ReferencingAttribute:string;ReferencedEntity:string;ReferencingEntityNavigationPropertyName:string}
interface ManyRelationship{SchemaName:string;Entity1LogicalName:string;Entity2LogicalName:string;Entity1NavigationPropertyName:string;Entity2NavigationPropertyName:string;IsCustomRelationship:boolean}
interface Association{table:string;id:string;navigation:string;targetTable:string;targetId:string;key:string}
interface Snapshot{rows:CopyRecord[];associations:Association[];preflight:DataPreflight;tables:TableMetadata[]}
const key=(table:string,id:string)=>`${table}:${id.toLowerCase()}`;
export class DataService{
 constructor(private catalog:CatalogService){}
 private async exists(env:'dev'|'production',entitySet:string,id:string){try{await this.catalog.client.request(env,`${entitySet}(${id})?$select=${(await this.catalog.rawTables(env)).find(t=>t.EntitySetName===entitySet)?.PrimaryIdAttribute||'versionnumber'}`);return true;}catch(e){if(e instanceof AppError&&e.code==='NOT_FOUND')return false;throw e;}}
 private async scan(plan:TransferPlan,mappings:ReferenceMapping[]=[]):Promise<Snapshot>{
  const {source,target}=plan.request;const all=(await this.catalog.tables(source)).items;const selected=all.filter(t=>plan.components.some(c=>c.kind==='table'&&c.id===t.id));
  const blockers:string[]=[];const refs=new Map<string,{table:string;id:string;displayName:string}>();const rows:CopyRecord[]=[];const associations:Association[]=[];const counts:Record<string,number>={};const selections=new Map<string,Set<string>>();
  const targetTables=await this.catalog.rawTables(target);const map=new Map(mappings.map(m=>[key(m.sourceTable,m.sourceId),m.targetId]));
  const snapshots:{table:TableMetadata;attributes:RawColumn[];records:Record<string,unknown>[];relationships:LookupRelationship[];many:ManyRelationship[]}[]=[];
  for(const table of selected){
   const attributes=await this.catalog.attributes(source,table.id);
   if(table.activity||table.virtual||table.tableType!=='Standard'){blockers.push(`${table.displayName}: chưa hỗ trợ chuyển data cho bảng activity, virtual hoặc elastic.`);continue;}
   const unsupported=attributes.filter(c=>['File','Image','PartyList','ManagedProperty'].includes(c.AttributeType||'')).map(c=>`${c.LogicalName} (${c.AttributeType})`);
   if(unsupported.length){blockers.push(`${table.displayName}: chưa hỗ trợ ${unsupported.join(', ')}.`);continue;}
   const metadata=await this.catalog.client.request<{ManyToOneRelationships:LookupRelationship[];ManyToManyRelationships:ManyRelationship[]}>(source,`EntityDefinitions(${table.id})?$select=LogicalName&$expand=ManyToOneRelationships($select=ReferencingAttribute,ReferencedEntity,ReferencingEntityNavigationPropertyName),ManyToManyRelationships($select=SchemaName,Entity1LogicalName,Entity2LogicalName,Entity1NavigationPropertyName,Entity2NavigationPropertyName,IsCustomRelationship)`);
   const writable=attributes.filter(c=>c.IsValidForCreate&&!c.AttributeOf&&!c.SourceType);
   const fields=[table.primaryId,...writable.filter(c=>!['Lookup','Owner','Customer'].includes(c.AttributeType||'')).map(c=>c.LogicalName),...writable.filter(c=>['Lookup','Owner','Customer'].includes(c.AttributeType||'')).map(c=>`_${c.LogicalName}_value`)];
   let next:string|undefined=`${table.entitySetName}?$select=${[...new Set(fields)].join(',')}`;const records:Record<string,unknown>[]=[];const seen=new Set<string>();
   while(next){if(seen.has(next))throw new AppError('PAGING_LOOP','Phân trang dữ liệu bị lặp.');seen.add(next);const page:{value:Record<string,unknown>[];'@odata.nextLink'?:string}=await this.catalog.client.request(source,next,{headers:{Prefer:'odata.include-annotations="Microsoft.Dynamics.CRM.lookuplogicalname,Microsoft.Dynamics.CRM.associatednavigationproperty,OData.Community.Display.V1.FormattedValue",odata.maxpagesize=1000'}});records.push(...page.value);if(records.length>50000)throw new AppError('DATA_LIMIT','Bản đầu hỗ trợ tối đa 50.000 bản ghi mỗi bảng; chia đợt để chuyển.');next=page['@odata.nextLink'];}
   counts[table.logicalName]=records.length;selections.set(table.logicalName,new Set(records.map(r=>String(r[table.primaryId]).toLowerCase())));snapshots.push({table,attributes:writable,records,relationships:metadata.ManyToOneRelationships||[],many:metadata.ManyToManyRelationships||[]});
  }
  const reference=async(tableName:string,id:string,displayName:string)=>{
   if(selections.get(tableName)?.has(id.toLowerCase()))return {table:all.find(t=>t.logicalName===tableName)?.entitySetName,id};
   const mapped=map.get(key(tableName,id));const targetTable=targetTables.find(t=>t.LogicalName===tableName);
   // Even equal GUIDs must be proved at destination. Never invent system user/team mappings.
   const targetId=mapped||id;
   if(!targetTable?.EntitySetName||!await this.exists(target,targetTable.EntitySetName,targetId)){refs.set(key(tableName,id),{table:tableName,id,displayName});return undefined;}
   return {table:targetTable.EntitySetName,id:targetId};
  };
  for(const snapshot of snapshots){const {table,attributes,records,relationships,many}=snapshot;
   for(const raw of records){
    const id=String(raw[table.primaryId]);const values:Record<string,unknown>={[table.primaryId]:id};const lookups:Record<string,unknown>={};
    for(const col of attributes){
     if(col.IsPrimaryId||col.AttributeOf||col.SourceType)continue;
     if(['Lookup','Owner','Customer'].includes(col.AttributeType||'')){
      const field=`_${col.LogicalName}_value`;if(!raw[field])continue;
      const annotated=raw[`${field}@Microsoft.Dynamics.CRM.lookuplogicalname`];const rel=relationships.find(r=>r.ReferencingAttribute===col.LogicalName&&(!annotated||r.ReferencedEntity===annotated));
      const navigation=String(raw[`${field}@Microsoft.Dynamics.CRM.associatednavigationproperty`]||rel?.ReferencingEntityNavigationPropertyName||'');
      if(!rel||!navigation){blockers.push(`${table.logicalName}.${col.LogicalName}: không xác định được lookup target.`);continue;}
      const ref=await reference(rel.ReferencedEntity,String(raw[field]),String(raw[`${field}@OData.Community.Display.V1.FormattedValue`]||raw[field]));
      if(ref)lookups[`${navigation}@odata.bind`]=`/${ref.table}(${ref.id})`;
     }else if(Object.hasOwn(raw,col.LogicalName)){
      if(col.AttributeType==='Virtual'&&typeof raw[col.LogicalName]!=='string'){blockers.push(`${table.logicalName}.${col.LogicalName}: kiểu dữ liệu chưa được hỗ trợ.`);continue;}
      values[col.LogicalName]=raw[col.LogicalName];
     }
    }
    rows.push({table:table.entitySetName,id,values,lookups});
    for(const rel of many.filter(r=>r.IsCustomRelationship)){
     const first=rel.Entity1LogicalName===table.logicalName;const navigation=first?rel.Entity1NavigationPropertyName:rel.Entity2NavigationPropertyName;const targetName=first?rel.Entity2LogicalName:rel.Entity1LogicalName;const targetTable=all.find(t=>t.logicalName===targetName);
     if(!targetTable||!navigation){blockers.push(`${rel.SchemaName}: không xác định được N:N.`);continue;}
     const related=await this.catalog.client.all<Record<string,string>>(source,`${table.entitySetName}(${id})/${navigation}?$select=${targetTable.primaryId}`);
     for(const record of related){const relatedId=record[targetTable.primaryId];const ref=await reference(targetName,relatedId,relatedId);if(ref)associations.push({table:table.entitySetName,id,navigation,targetTable:ref.table!,targetId:ref.id,key:`${rel.SchemaName}:${[id,ref.id].sort().join(':')}`});}
    }
   }
  }
  return {rows,associations,tables:selected,preflight:{supported:!blockers.length,blockers:[...new Set(blockers)],references:[...refs.values()],mappings,counts}};
 }
 async inspect(plan:TransferPlan,mappings:ReferenceMapping[]=plan.dataPreflight?.mappings||[]):Promise<DataPreflight>{if(!plan.request.includeData)return {supported:true,blockers:[],references:[],mappings:[],counts:{}};return (await this.scan(plan,mappings)).preflight;}
 async copy(plan:TransferPlan,jobId:string,store:JobStore,checkCancel:()=>void){
  const snapshot=await this.scan(plan,plan.dataPreflight?.mappings);if(snapshot.preflight.blockers.length||snapshot.preflight.references.length)throw new AppError('DATA_PREFLIGHT_FAILED','Dữ liệu hoặc tham chiếu đã thay đổi. Cần kiểm tra lại trước khi sao chép.');
  const target=plan.request.target;const changed=()=>{const job=store.getJob(jobId)!;job.counts={...job.counts,created:snapshot.rows.filter(r=>store.hasCheckpoint(jobId,'created',r.table,r.id)).length,patched:snapshot.rows.filter(r=>store.hasCheckpoint(jobId,'patched',r.table,r.id)).length};store.update(job);};
  await copyRecords(snapshot.rows,{exists:(table,id)=>this.exists(target,table,id),create:async(table,_id,values)=>{await this.catalog.client.request(target,table,{method:'POST',body:values});},patch:async(table,id,values)=>{await this.catalog.client.request(target,`${table}(${id})`,{method:'PATCH',body:values,headers:{'If-Match':'*'}});},done:(stage,table,id)=>store.hasCheckpoint(jobId,stage,table,id),mark:(stage,table,id)=>{store.checkpoint(jobId,stage,table,id);changed();},checkCancel});
  for(const association of snapshot.associations){checkCancel();if(store.hasCheckpoint(jobId,'associated',association.navigation,association.key))continue;
   const existing=await this.catalog.client.all<Record<string,string>>(target,`${association.table}(${association.id})/${association.navigation}?$filter=${snapshot.tables.find(t=>t.entitySetName===association.targetTable)?.primaryId||(await this.catalog.rawTables(target)).find(t=>t.EntitySetName===association.targetTable)?.PrimaryIdAttribute} eq ${association.targetId}&$top=1`);
   if(!existing.length)await this.catalog.client.request(target,`${association.table}(${association.id})/${association.navigation}/$ref`,{method:'POST',body:{'@odata.id':`${target==='dev'?'https://phuochungdev.crm5.dynamics.com':'https://phuochung1.crm5.dynamics.com'}/api/data/v9.2/${association.targetTable}(${association.targetId})`}});
   store.checkpoint(jobId,'associated',association.navigation,association.key);
  }
  for(const row of snapshot.rows)if(!await this.exists(target,row.table,row.id))throw new AppError('DATA_VERIFY_FAILED','Không tìm thấy bản ghi sau sao chép.');
 }
}
