import {it,expect} from 'vitest';
import {DependencyReader} from '../src/server/plans/dependencies';
it('includes a table view attribute and relationship subcomponent instead of blocking them as external assets',async()=>{
 const table={id:'t',kind:'table',logicalName:'ph_t',displayName:'T',custom:true,selectable:true,managed:false};
 const catalog={tables:async()=>({items:[table]}),rawTables:async()=>[],attributes:async()=>[],client:{all:async(_:string,path:string)=>path.startsWith('dependencies')?[{requiredcomponentobjectid:'a',requiredcomponentparentid:'view',requiredcomponenttype:6},{requiredcomponentobjectid:'b',requiredcomponentparentid:'relationship',requiredcomponenttype:12}]:path.startsWith('savedqueries')?[{savedqueryid:'view'}]:[],request:async()=>({OneToManyRelationships:[{MetadataId:'relationship',ReferencingEntity:'ph_t',ReferencedEntity:'ph_t'}],ManyToOneRelationships:[],ManyToManyRelationships:[],Keys:[]})}};
 const deps=await new DependencyReader(catalog as never).required({source:'dev',target:'production',kind:'table'} as never,table as never);expect(deps).toEqual([]);
});
