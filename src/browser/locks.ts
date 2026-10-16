import type {EnvironmentId} from '../shared/contracts';
import {AppError} from '../core/errors';
export interface BrowserLocks{available:boolean;run<T>(target:EnvironmentId,fn:()=>Promise<T>):Promise<T|undefined>}
export function browserLocks(tenant:string):BrowserLocks{
 const manager=globalThis.navigator?.locks;
 return {available:!!manager,run:async(target,fn)=>{if(!manager)throw new AppError('BROWSER_UNSUPPORTED','Trình duyệt cần hỗ trợ Web Locks và IndexedDB để chuyển đổi.');return manager.request(`ph-transfer:${tenant}:${target}`,{ifAvailable:true},lock=>lock?fn():Promise.resolve(undefined));}};
}
