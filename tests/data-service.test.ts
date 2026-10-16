import {it,expect} from 'vitest';
import {DataService} from '../src/server/data/service';
it('rejects file/image and activity data before any write',async()=>{
 const catalog={rawTables:async()=>[],tables:async()=>({items:[{id:'a',logicalName:'ph_a',displayName:'A',entitySetName:'ph_as',primaryId:'ph_aid',activity:false,virtual:false,tableType:'Standard'}]}),attributes:async()=>[{LogicalName:'ph_file',AttributeType:'File'}],client:{all:async()=>[],request:async()=>({ManyToOneRelationships:[],ManyToManyRelationships:[]})}};
 const service=new DataService(catalog as never);const preflight=await service.inspect({request:{source:'dev',target:'production',includeData:true},components:[{id:'a',kind:'table'}]} as never);
 expect(preflight.supported).toBe(false);expect(preflight.blockers.join()).toContain('File');
});
