import type {EnvironmentId,Job,TransferPlan} from '../shared/contracts';
export type Awaitable<T>=T|Promise<T>;
export interface RequestOptions{method?:'GET'|'POST'|'PATCH'|'DELETE';body?:unknown;headers?:Record<string,string>}
export interface MicrosoftPort{request<T>(env:EnvironmentId,path:string,options?:RequestOptions):Promise<T>;all<T>(env:EnvironmentId,path:string):Promise<T[]>}
export interface JobStorePort{
 savePlan(plan:TransferPlan):Awaitable<void>;getPlan(id:string):Awaitable<TransferPlan|undefined>;
 createJob(plan:TransferPlan,key:string):Awaitable<Job>;findByKey(key:string):Awaitable<Job|undefined>;getJob(id:string):Awaitable<Job|undefined>;
 update(job:Job):Awaitable<Job>;list():Awaitable<Job[]>;unfinished():Awaitable<Job[]>;
 checkpoint(job:string,stage:string,table:string,id:string):Awaitable<void>;hasCheckpoint(job:string,stage:string,table:string,id:string):Awaitable<boolean>;
}
