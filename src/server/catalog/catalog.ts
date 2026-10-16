import type {Catalog,ColumnMetadata,FlowMetadata,TableMetadata,EnvironmentId} from '../../shared/contracts';
import type {MicrosoftClient} from '../microsoft/http';
import {AppError} from '../errors';
interface Label{UserLocalizedLabel?:{Label?:string};LocalizedLabels?:{Label:string}[]}
export interface RawTable{MetadataId:string;LogicalName:string;DisplayName?:Label;IsCustomEntity?:boolean;IsManaged?:boolean;EntitySetName?:string;PrimaryIdAttribute?:string;PrimaryNameAttribute?:string;ObjectTypeCode?:number;OwnershipType?:string;IsActivity?:boolean;DataProviderId?:string;TableType?:string}
export interface RawColumn{MetadataId:string;LogicalName:string;SchemaName?:string;DisplayName?:Label;IsCustomAttribute?:boolean;IsManaged?:boolean;AttributeType?:string;IsValidForCreate?:boolean;IsValidForUpdate?:boolean;IsPrimaryId?:boolean;IsPrimaryName?:boolean;AttributeOf?:string;RequiredLevel?:{Value:string};SourceType?:number;Targets?:string[]}
export const label=(name:Label|undefined,fallback:string)=>name?.UserLocalizedLabel?.Label||name?.LocalizedLabels?.[0]?.Label||fallback;
function result<T extends {selectable:boolean}>(items:T[]):Catalog<T>{return {items,total:items.length,eligible:items.filter(x=>x.selectable).length};}
export class CatalogService{
  constructor(public client:MicrosoftClient){}
  async rawTables(env:EnvironmentId){return this.client.all<RawTable>(env,'EntityDefinitions?$select=MetadataId,LogicalName,DisplayName,IsCustomEntity,IsManaged,EntitySetName,PrimaryIdAttribute,PrimaryNameAttribute,ObjectTypeCode,OwnershipType,IsActivity,DataProviderId,TableType');}
  async tables(source:EnvironmentId,target?:EnvironmentId):Promise<Catalog<TableMetadata>>{
    const [raw,other]=await Promise.all([this.rawTables(source),target?this.rawTables(target):Promise.resolve([])]);const existing=new Set(other.map(t=>t.LogicalName));
    return result(raw.map(t=>{
      const reason=!t.IsCustomEntity?'Bảng hệ thống':t.IsManaged?'Bảng managed':existing.has(t.LogicalName)?'Đã có ở môi trường đích':undefined;
      return {id:t.MetadataId,kind:'table',componentType:1,logicalName:t.LogicalName,displayName:label(t.DisplayName,t.LogicalName),custom:!!t.IsCustomEntity,managed:!!t.IsManaged,selectable:!reason,reason,entitySetName:t.EntitySetName||'',primaryId:t.PrimaryIdAttribute||'',primaryName:t.PrimaryNameAttribute||'',objectTypeCode:t.ObjectTypeCode||0,tableType:t.TableType||'Standard',ownershipType:t.OwnershipType||'OrganizationOwned',activity:!!t.IsActivity,virtual:!!t.DataProviderId} satisfies TableMetadata;
    }).sort((a,b)=>a.displayName.localeCompare(b.displayName,'vi')));
  }
  async attributes(env:EnvironmentId,tableId:string){return this.client.all<RawColumn>(env,`EntityDefinitions(${tableId})/Attributes?$select=MetadataId,LogicalName,SchemaName,DisplayName,IsCustomAttribute,IsManaged,AttributeType,IsValidForCreate,IsValidForUpdate,IsPrimaryId,IsPrimaryName,AttributeOf,RequiredLevel,SourceType`);}
  async columns(source:EnvironmentId,target:EnvironmentId,tableId:string):Promise<Catalog<ColumnMetadata>>{
    const [src,dst]=await Promise.all([this.rawTables(source),this.rawTables(target)]);const table=src.find(t=>t.MetadataId===tableId);const match=dst.find(t=>t.LogicalName===table?.LogicalName);
    if(!table||!match)throw new AppError('TABLE_NOT_SHARED','Bảng phải có trong cả môi trường nguồn và đích.');
    const [columns,targetColumns]=await Promise.all([this.attributes(source,tableId),this.attributes(target,match.MetadataId)]);const existing=new Set(targetColumns.map(c=>c.LogicalName));
    return result(columns.map(c=>{
      const reason=c.IsPrimaryId?'Primary ID không chuyển riêng':!c.IsCustomAttribute?'Column hệ thống':c.IsManaged?'Column managed':c.AttributeOf?'Column tự sinh':existing.has(c.LogicalName)?'Đã có ở môi trường đích':undefined;
      return {id:c.MetadataId,kind:'column',componentType:2,logicalName:c.LogicalName,displayName:label(c.DisplayName,c.LogicalName),managed:!!c.IsManaged,selectable:!reason,reason,attributeType:c.AttributeType||'Unknown',create:!!c.IsValidForCreate,update:!!c.IsValidForUpdate,primary:!!c.IsPrimaryId,required:c.RequiredLevel?.Value==='ApplicationRequired'||c.RequiredLevel?.Value==='SystemRequired',sourceType:c.SourceType||0,targets:c.Targets||[]} satisfies ColumnMetadata;
    }).sort((a,b)=>a.displayName.localeCompare(b.displayName,'vi')));
  }
  async flows(source:EnvironmentId,target?:EnvironmentId):Promise<Catalog<FlowMetadata>>{
    type RawFlow={workflowid:string;workflowidunique?:string;name:string;uniquename?:string;statecode:number;ismanaged:boolean};
    const query='workflows?$select=workflowid,workflowidunique,name,uniquename,statecode,ismanaged&$filter=category eq 5 and type eq 1';
    const [flows,other,components]=await Promise.all([this.client.all<RawFlow>(source,query),target?this.client.all<RawFlow>(target,query):Promise.resolve([]),this.client.all<{objectid:string}>(source,"solutioncomponents?$select=objectid&$filter=componenttype eq 29 and solutionid/isvisible eq true and solutionid/uniquename ne 'Default' and solutionid/uniquename ne 'Active'")]);
    const aware=new Set(components.map(x=>x.objectid));const existing=new Set(other.map(f=>f.workflowid));
    return result(flows.map(f=>{
      const reason=f.ismanaged?'Flow managed':existing.has(f.workflowid)?'Đã có ở môi trường đích':!aware.has(f.workflowid)?'Cần thêm vào một Solution trước':undefined;
      return {id:f.workflowid,kind:'flow',componentType:29,logicalName:f.uniquename||f.workflowid,displayName:f.name,managed:f.ismanaged,selectable:!reason,reason,state:f.statecode,solutionAware:aware.has(f.workflowid)} satisfies FlowMetadata;
    }).sort((a,b)=>a.displayName.localeCompare(b.displayName,'vi')));
  }
}
