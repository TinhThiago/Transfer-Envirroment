import type {EnvironmentId} from '../shared/contracts';
import {AppError} from '../core/errors';
interface Reservation{owner:string;job:string}
// Unlike a Web Lock, this reservation survives a tick, a closed tab and account switches.
export class TargetReservations{
 private database?:Promise<IDBDatabase>;
 constructor(private tenant:string,private owner:string){}
 private open(){return this.database??=new Promise((resolve,reject)=>{const request=indexedDB.open('ph-transfer-targets-v1:'+this.tenant,1);request.onupgradeneeded=()=>request.result.createObjectStore('targets');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(new AppError('STORAGE_FAILED','Không mở được khóa môi trường đích.'));});}
 private async change<T>(target:EnvironmentId,fn:(current:Reservation|undefined)=>{result:T;next?:Reservation;remove?:boolean}):Promise<T>{
  const db=await this.open();return new Promise((resolve,reject)=>{const tx=db.transaction('targets','readwrite',{durability:'strict'});const table=tx.objectStore('targets');const request=table.get(target);let result:T;request.onsuccess=()=>{const change=fn(request.result);result=change.result;if(change.remove)table.delete(target);else if(change.next)table.put(change.next,target);};tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(new AppError('STORAGE_FAILED','Không lưu được khóa môi trường đích.'));tx.onerror=()=>{};});
 }
 claim(target:EnvironmentId,job:string){return this.change(target,current=>current?{result:current.owner===this.owner&&current.job===job}:{result:true,next:{owner:this.owner,job}});}
 owned(target:EnvironmentId){return this.change(target,current=>({result:current?.owner===this.owner?current.job:undefined}));}
 release(target:EnvironmentId,job:string){return this.change(target,current=>({result:undefined,remove:current?.owner===this.owner&&current.job===job}));}
 async close(){if(this.database)(await this.database).close();}
}
