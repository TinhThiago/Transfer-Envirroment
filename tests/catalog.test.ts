import {it,expect} from 'vitest';
import {CatalogService} from '../src/server/catalog/catalog';
import type {MicrosoftClient} from '../src/server/microsoft/http';
const raw=(id:string,name:string,custom=true,managed=false)=>({MetadataId:id,LogicalName:name,DisplayName:{UserLocalizedLabel:{Label:'Tên trùng — Đơn hàng'}},IsCustomEntity:custom,IsManaged:managed,EntitySetName:name+'s',PrimaryIdAttribute:name+'id',ObjectTypeCode:10001});
it('compares by logical name and excludes system/managed/existing tables',async()=>{
  const client={all:async(env:string)=>env==='dev'?[raw('a','ph_a'),raw('b','ph_b'),raw('c','account',false),raw('d','ph_d',true,true)]:[raw('x','ph_b')]};
  const service=new CatalogService(client as unknown as MicrosoftClient);const result=await service.tables('dev','production');
  expect(result.items.filter(x=>x.selectable).map(x=>x.id)).toEqual(['a']);expect(result.items[0].displayName).toBe('Tên trùng — Đơn hàng');
});
it('requests table type so elastic tables cannot be mistaken for Standard',async()=>{
 const client={all:async(_:string,path:string)=>[{...raw('a','ph_elastic'),...new URLSearchParams(path.split('?')[1]).get('$select')?.split(',').includes('TableType')?{TableType:'Elastic'}:{}}]};
 const result=await new CatalogService(client as unknown as MicrosoftClient).tables('dev');expect(result.items[0].tableType).toBe('Elastic');
});
it('requires a table present in both environments for column selection',async()=>{
  const client={all:async(env:string)=>env==='dev'?[raw('a','ph_a')]:[]};
  const service=new CatalogService(client as unknown as MicrosoftClient);
  await expect(service.columns('dev','production','a')).rejects.toMatchObject({code:'TABLE_NOT_SHARED'});
});
it('blocks primary/system columns and compares logical names',async()=>{
  const client={all:async(env:string,path:string)=>path.includes('/Attributes')?(env==='dev'?[
    {MetadataId:'c1',LogicalName:'ph_new',IsCustomAttribute:true,IsManaged:false,AttributeType:'String',IsValidForCreate:true,IsValidForUpdate:true},
    {MetadataId:'c2',LogicalName:'ph_existing',IsCustomAttribute:true,IsManaged:false,AttributeType:'String'},
    {MetadataId:'c3',LogicalName:'ph_aid',IsPrimaryId:true,IsCustomAttribute:true},
  ]:[{LogicalName:'ph_existing'}]):[raw(env==='dev'?'a':'x','ph_a')]};
  const service=new CatalogService(client as unknown as MicrosoftClient);const result=await service.columns('dev','production','a');
  expect(result.items.filter(x=>x.selectable).map(x=>x.id)).toEqual(['c1']);
});
it('identifies solution-aware flows and blocks existing destination identities',async()=>{
  const client={all:async(env:string,path:string)=>path.startsWith('solutioncomponents')?[{objectid:'flow1'}]:env==='dev'?[
    {workflowid:'flow1',workflowidunique:'version1',name:'Luồng A',statecode:0,ismanaged:false},
    {workflowid:'flow2',name:'Luồng A',statecode:0,ismanaged:false}]:[{workflowid:'flow1'}]};
  const result=await new CatalogService(client as unknown as MicrosoftClient).flows('dev','production');
  expect(result.items[0].reason).toContain('đích');expect(result.items[1].reason).toContain('Solution');
});
