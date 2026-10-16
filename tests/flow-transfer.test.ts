import {it,expect} from 'vitest';
import {validateFlowMappings,FlowService} from '../src/server/flows/flows';
it('defers connection and variable mappings while still checking destination flow Off and reference existence',async()=>{
 const reads:string[]=[];const service=new FlowService({client:{request:async(_:string,path:string)=>{reads.push(path);return {statecode:0}},all:async(_:string,path:string)=>{reads.push(path);return [{connectionid:null}]}}} as never);
 const plan={request:{target:'dev',deferFlowConfiguration:true},components:[{id:'f',kind:'flow'}],flowPreflight:{connections:[{logicalName:'ph_ref',displayName:'Dataverse'}],variables:[{logicalName:'ph_url',displayName:'URL'}]}} as never;
 expect(service.parameters(plan)).toEqual([]);await service.applyMappings(plan);expect(reads.some(p=>p.startsWith('environmentvariable'))).toBe(false);expect(service.configurationWarnings(plan).join(' ')).toContain('ph_ref');expect(service.configurationWarnings(plan).join(' ')).toContain('ph_url');
});
it('allows enabled source flows during read-only preflight without changing their state',async()=>{
 const requests:unknown[]=[];const service=new FlowService({flows:async()=>({items:[{id:'f',state:1}]}),client:{request:async(...args:unknown[])=>{requests.push(args);return {clientdata:'{}'}},all:async()=>[]}} as never);
 expect((await service.inspect({request:{source:'production'},components:[{id:'f'}]} as never)).blockers).toEqual([]);expect(requests).toEqual([['production','workflows(f)?$select=clientdata']]);
});
it('uses only supported connection overrides and applies environment values to inactive destination flows after import',async()=>{
 const writes:{path:string;body:unknown}[]=[];const service=new FlowService({client:{all:async(_:string,path:string)=>path.startsWith('environmentvariabledefinitions')?[{environmentvariabledefinitionid:'target-definition'}]:[],request:async(_:string,path:string,options?:{body:unknown})=>{if(path.startsWith('RetrieveEnvironmentVariableValue'))return {Value:'https://destination.invalid'};writes.push({path,body:options?.body})}}} as never);
 const plan={request:{source:'dev',target:'production',kind:'flow'},components:[],flowPreflight:{connections:[],variables:[{id:'source-definition',logicalName:'ph_url',valueIds:[]}],blockers:[]},flowMappings:{connections:{},variables:{ph_url:'https://destination.invalid'}}} as never;
 expect(service.parameters(plan)).toEqual([]);await service.applyMappings(plan);expect(writes).toEqual([{path:'environmentvariablevalues',body:{value:'https://destination.invalid','environmentvariabledefinitionid@odata.bind':'/environmentvariabledefinitions(target-definition)'}}]);
});
it('requires every destination connection and variable before import',()=>{
 expect(()=>validateFlowMappings(['refA'],['url'],{connections:{},variables:{}})).toThrow();
 expect(()=>validateFlowMappings(['refA'],['url'],{connections:{refA:'connection-id'},variables:{url:'https://destination.invalid'}})).not.toThrow();
});
it('does not accept an active destination flow or change its state during verification',async()=>{
 const calls:unknown[]=[];const service=new FlowService({client:{request:async(...args:unknown[])=>{calls.push(args);return {statecode:1}}}} as never);
 await expect(service.verify({request:{target:'dev'},components:[{kind:'flow',id:'f'}]} as never)).rejects.toMatchObject({code:'FLOW_ACTIVE'});expect(calls).toEqual([['dev','workflows(f)?$select=statecode']]);
});
