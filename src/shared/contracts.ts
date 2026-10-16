import { z } from 'zod';
export const environmentSchema=z.enum(['dev','production']);
export const guidSchema=z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,'GUID không hợp lệ.');
export type EnvironmentId=z.infer<typeof environmentSchema>;
export const requestSchema=z.object({source:environmentSchema,target:environmentSchema,kind:z.enum(['table','column','flow']),ids:z.array(guidSchema).min(1).max(100),tableId:guidSchema.optional(),includeData:z.boolean().default(false),deferFlowConfiguration:z.boolean().optional()}).refine(v=>v.source!==v.target,'Nguồn và đích phải khác nhau.').refine(v=>v.kind==='table'||!v.includeData,'Chỉ Table hỗ trợ chuyển data.').refine(v=>v.kind!=='column'||!!v.tableId,'Phải chọn một bảng.');
export type TransferRequest=z.infer<typeof requestSchema>;
export interface ComponentRef{id:string;kind:'table'|'column'|'flow'|'dependency';logicalName:string;displayName:string;componentType:number;selectable:boolean;reason?:string;managed?:boolean}
export interface TableMetadata extends ComponentRef{kind:'table';custom:boolean;entitySetName:string;primaryId:string;primaryName:string;objectTypeCode:number;tableType:string;ownershipType:string;activity:boolean;virtual:boolean}
export interface ColumnMetadata extends ComponentRef{kind:'column';attributeType:string;create:boolean;update:boolean;primary:boolean;required:boolean;sourceType:number;targets:string[]}
export interface FlowMetadata extends ComponentRef{kind:'flow';state:number;solutionAware:boolean}
export interface Dependency extends ComponentRef{forIds:string[]}
export interface FlowPreflight{connections:{id:string;logicalName:string;displayName:string;type:number}[];variables:{id:string;logicalName:string;displayName:string;type:number;valueIds:string[]}[];blockers:string[]}
export interface TransferPlan{id:string;hash:string;expiresAt:string;request:TransferRequest;components:ComponentRef[];dependencies:Dependency[];acceptedIds:string[];rejectedIds:string[];blockers:string[];warnings:string[];flowMappings?:FlowMappings;flowPreflight?:FlowPreflight;dataPreflight?:DataPreflight}
export interface ReferenceMapping{sourceTable:string;sourceId:string;targetId:string}
export interface DataPreflight{supported:boolean;blockers:string[];references:{table:string;id:string;displayName:string}[];mappings:ReferenceMapping[];counts:Record<string,number>}
export interface FlowMappings{connections:Record<string,string>;variables:Record<string,string>}
export type JobStatus='queued'|'checking'|'awaiting-input'|'exporting'|'importing'|'copying-data'|'verifying'|'succeeded'|'partial'|'failed'|'cancelled';
export interface Job{id:string;planId:string;planHash:string;target:EnvironmentId;status:JobStatus;step:string;createdAt:string;updatedAt:string;counts:Record<string,number>;error?:{code:string;message:string};importId?:string;importRejected?:boolean;asyncId?:string;solutionName?:string;sourceSolutionId?:string;cancelRequested?:boolean;schemaImported?:boolean;warnings:string[]}
export interface Catalog<T>{items:T[];total:number;eligible:number}
export const terminalStatuses:JobStatus[]=['succeeded','partial','failed','cancelled'];
