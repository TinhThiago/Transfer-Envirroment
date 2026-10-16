import {it,expect} from 'vitest';
import {copyRecords,type CopyAdapter} from '../src/server/data/copy';
it('creates all records before patching circular lookups and resumes without duplicate creates',async()=>{
 const operations:string[]=[];const done=new Set<string>();const rows=[{table:'ph_a',id:'a',values:{name:'A'},lookups:{parent:'b'}},{table:'ph_a',id:'b',values:{name:'B'},lookups:{parent:'a'}}];
 const adapter:CopyAdapter={exists:async()=>false,create:async(_,id)=>{operations.push('create:'+id)},patch:async(_,id)=>{operations.push('patch:'+id)},done:(stage,table,id)=>done.has(stage+table+id),mark:(stage,table,id)=>{done.add(stage+table+id)}};
 await copyRecords(rows,adapter);expect(operations).toEqual(['create:a','create:b','patch:a','patch:b']);await copyRecords(rows,adapter);expect(operations).toHaveLength(4);
});
it('refuses to overwrite existing destination records outside this job',async()=>{
 const adapter:CopyAdapter={exists:async()=>true,create:async()=>{throw Error('must not create')},patch:async()=>{throw Error('must not patch')},done:()=>false,mark:()=>{}};
 await expect(copyRecords([{table:'ph_a',id:'a',values:{},lookups:{}}],adapter)).rejects.toMatchObject({code:'DATA_CONFLICT'});
});
