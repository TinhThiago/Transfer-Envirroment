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
it.each([true,false])('resolves an unparented flow column by table and column names (exists=%s)',async exists=>{
 const attributeId='f1a2b35d-e0af-f111-aaad-00224819a344';const table={id:'table-source',logicalName:'ph_production_equipment',displayName:'Máy móc thiết bị',custom:true,managed:false};const column={MetadataId:attributeId,LogicalName:'ph_equipment_code',DisplayName:{UserLocalizedLabel:{Label:'Mã thiết bị'}},IsCustomAttribute:true,IsManaged:false};
 const catalog={tables:async()=>({items:[table]}),rawTables:async()=>[{MetadataId:'table-target',LogicalName:table.logicalName}],attributes:async(env:string)=>env==='dev'?[column]:exists?[{...column,MetadataId:'different-guid'}]:[],client:{request:async()=>({}),all:async(env:string,path:string)=>{
 if(path.startsWith('dependencies'))return [{requiredcomponentobjectid:attributeId,requiredcomponentparentid:'00000000-0000-0000-0000-000000000000',requiredcomponenttype:2,dependencytype:2}];
 if(path.startsWith('EntityDefinitions?'))return [{MetadataId:table.id,LogicalName:table.logicalName,Attributes:[column]}];
 if(path.startsWith('solutioncomponents'))return env==='dev'?[{componenttype:2}]:[];return [];
 }}};
 const deps=await new DependencyReader(catalog as never).required({source:'dev',target:'production',kind:'flow'} as never,{id:'flow',kind:'flow'} as never);
 if(exists)expect(deps).toEqual([]);else{expect(deps).toHaveLength(1);expect(deps[0]).toMatchObject({selectable:false,logicalName:'ph_equipment_code'});expect(deps[0].displayName).toContain('Mã thiết bị');}
});
it('does not match a same-named column from a different destination table',async()=>{
 const attributeId='f1a2b35d-e0af-f111-aaad-00224819a344';let targetReads=0;const table={id:'source-table',logicalName:'ph_expected',custom:true,managed:false};const column={MetadataId:attributeId,LogicalName:'ph_code'};
 const catalog={tables:async()=>({items:[table]}),rawTables:async()=>[{MetadataId:'other-table',LogicalName:'ph_other'}],attributes:async()=>{targetReads++;return [column]},client:{all:async(_:string,path:string)=>path.startsWith('dependencies')?[{requiredcomponentobjectid:attributeId,requiredcomponenttype:2,dependencytype:2}]:path.startsWith('EntityDefinitions?')?[{MetadataId:table.id,LogicalName:table.logicalName,Attributes:[column]}]:[{componenttype:2}],request:async()=>({})}};
 const deps=await new DependencyReader(catalog as never).required({source:'dev',target:'production',kind:'flow'} as never,{id:'flow',kind:'flow'} as never);expect(deps).not.toEqual([]);expect(targetReads).toBe(0);
});
