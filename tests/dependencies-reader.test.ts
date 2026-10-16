import {it,expect} from 'vitest';
import {DependencyReader} from '../src/server/plans/dependencies';
it('checks flow dependencies that have no table parent',async()=>{
 const catalog={tables:async()=>({items:[]}),rawTables:async()=>[],client:{all:async(_:string,path:string)=>path.startsWith('dependencies')?[{requiredcomponentobjectid:'v',requiredcomponenttype:380}]:[],request:async()=>({schemaname:'ph_url',displayname:'URL'})}};
 const deps=await new DependencyReader(catalog as never).required({source:'dev',target:'production',kind:'flow'} as never,{id:'f',kind:'flow'} as never);
 expect(deps.map(d=>d.logicalName)).toEqual(['ph_url']);
});
it('lets Dataverse manage non-exportable solution-internal nodes while retaining published blockers',async()=>{
 const catalog={tables:async()=>({items:[]}),rawTables:async()=>[],client:{all:async(_:string,path:string)=>path.startsWith('dependencies')?[{requiredcomponentobjectid:'internal',requiredcomponenttype:12,requiredcomponentparentid:'00000000-0000-0000-0000-000000000000',dependencytype:1},{requiredcomponentobjectid:'published',requiredcomponenttype:6,dependencytype:2}]:[]}};
 const deps=await new DependencyReader(catalog as never).required({source:'dev',target:'production',kind:'column',tableId:'t'} as never,{id:'a',kind:'column'} as never);expect(deps.map(d=>d.id)).toEqual(['published']);
});
it('does not suppress a missing sibling column required by a segmented column',async()=>{
 const table={id:'t',logicalName:'ph_t',displayName:'T'};const column={id:'b',kind:'column',componentType:2,logicalName:'ph_b',displayName:'B',selectable:true};
 const catalog={tables:async()=>({items:[table]}),rawTables:async()=>[{MetadataId:'target-t',LogicalName:'ph_t'}],attributes:async(env:string)=>env==='dev'?[{MetadataId:'b',LogicalName:'ph_b',IsCustomAttribute:true,IsManaged:false}]:[],columns:async()=>({items:[column]}),client:{all:async(_:string,path:string)=>path.startsWith('dependencies')?[{requiredcomponentobjectid:'b',requiredcomponentparentid:'t',requiredcomponenttype:2}]:[]}};
 const deps=await new DependencyReader(catalog as never).required({source:'dev',target:'production',kind:'column',tableId:'t'} as never,{id:'a',kind:'column'} as never);expect(deps.map(d=>d.id)).toEqual(['b']);expect(deps[0].selectable).toBe(true);
});
