import {it,expect,vi} from 'vitest';
import {browserLocks} from '../src/browser/locks';
it('serializes targets across tabs without waiting or recovering a locked job',async()=>{
 const held=new Set<string>();let release!:()=>void;const gate=new Promise<void>(r=>{release=r});
 const request=async(name:string,_options:unknown,fn:(lock:object|null)=>Promise<unknown>)=>{if(held.has(name))return fn(null);held.add(name);try{return await fn({});}finally{held.delete(name)}};
 vi.stubGlobal('navigator',{locks:{request}});try{const one=browserLocks('tenant'),two=browserLocks('tenant');let writes=0;const running=one.run('dev',async()=>{writes++;await gate;});await two.run('dev',async()=>{writes++});expect(writes).toBe(1);release();await running;await two.run('dev',async()=>{writes++});expect(writes).toBe(2);}finally{vi.unstubAllGlobals()}
});
