import {it,expect} from 'vitest';
import {verifyTableAssets} from '../src/server/solutions/verify';
it('does not report success when a required form or relationship is missing at destination',async()=>{
 const catalog={attributes:async()=>[],client:{all:async(env:string,path:string)=>env==='dev'&&path.startsWith('systemforms')?[{formid:'form1'}]:[],request:async(env:string)=>({ManyToOneRelationships:env==='dev'?[{SchemaName:'ph_relation'}]:[],OneToManyRelationships:[],ManyToManyRelationships:[],Keys:[]})}};
 await expect(verifyTableAssets(catalog as never,'dev','production',{id:'source',logicalName:'ph_t'} as never,{id:'target'} as never)).rejects.toMatchObject({code:'ASSET_VERIFY_FAILED'});
});
