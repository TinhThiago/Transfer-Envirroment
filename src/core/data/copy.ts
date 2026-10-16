import {AppError} from '../errors';
export interface CopyRecord{table:string;id:string;values:Record<string,unknown>;lookups:Record<string,unknown>}
export interface CopyAdapter{exists:(table:string,id:string)=>Promise<boolean>;create:(table:string,id:string,values:Record<string,unknown>)=>Promise<void>;patch:(table:string,id:string,values:Record<string,unknown>)=>Promise<void>;done:(stage:string,table:string,id:string)=>boolean|Promise<boolean>;mark:(stage:string,table:string,id:string)=>void|Promise<void>;checkCancel?:()=>void|Promise<void>}
export async function copyRecords(rows:CopyRecord[],adapter:CopyAdapter){
 for(const row of rows){await adapter.checkCancel?.();if(await adapter.done('created',row.table,row.id))continue;if(await adapter.exists(row.table,row.id))throw new AppError('DATA_CONFLICT',`Bản ghi ${row.id} đã có ở đích nhưng chưa có checkpoint của job. Không ghi đè.`);await adapter.create(row.table,row.id,row.values);await adapter.mark('created',row.table,row.id);}
 for(const row of rows){await adapter.checkCancel?.();if(await adapter.done('patched',row.table,row.id))continue;if(Object.keys(row.lookups).length)await adapter.patch(row.table,row.id,row.lookups);await adapter.mark('patched',row.table,row.id);}
}
