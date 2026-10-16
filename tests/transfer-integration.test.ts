import {it,expect} from 'vitest';
import {buildApp} from '../src/server/app';
import {loadConfig} from '../src/server/config';
import {JobStore} from '../src/server/jobs/store';
import {AppError} from '../src/server/errors';
import type {Worker} from '../src/server/jobs/worker';
import type {MicrosoftClient,RequestOptions} from '../src/server/microsoft/http';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
const tableId='11111111-1111-4111-8111-111111111111',columnId='22222222-2222-4222-8222-222222222222',flowId='33333333-3333-4333-8333-333333333333',recordId='44444444-4444-4444-8444-444444444444';
it.each(['table','table-data','column','flow'] as const)('executes %s through HTTP plan/job endpoints and the real worker with a Microsoft boundary fixture',async scenario=>{
 const store=new JobStore(':memory:');let imported=false;let container='';const writes:{env:string;path:string;body:unknown}[]=[];const records=new Map<string,Record<string,unknown>>();
 const rawTable={MetadataId:tableId,LogicalName:'ph_demo',DisplayName:{UserLocalizedLabel:{Label:'Demo'}},IsCustomEntity:true,IsManaged:false,EntitySetName:'ph_demos',PrimaryIdAttribute:'ph_demoid',PrimaryNameAttribute:'ph_name',ObjectTypeCode:10001,TableType:'Standard'};
 const baseAttributes=[{MetadataId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',LogicalName:'ph_demoid',IsPrimaryId:true,AttributeType:'Uniqueidentifier',IsValidForCreate:true},{MetadataId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',LogicalName:'ph_name',IsCustomAttribute:true,IsManaged:false,AttributeType:'String',IsValidForCreate:true,IsValidForUpdate:true}];
 const extra={MetadataId:columnId,LogicalName:'ph_extra',IsCustomAttribute:true,IsManaged:false,AttributeType:'String',IsValidForCreate:true,IsValidForUpdate:true};
 const all=async(env:string,path:string):Promise<unknown[]>=>{
  if(path.startsWith('EntityDefinitions')&&path.includes('/Attributes'))return [...baseAttributes,...scenario==='column'&&(env==='dev'||imported)?[extra]:[]];
  if(path.startsWith('EntityDefinitions'))return env==='dev'||scenario==='column'||imported?[rawTable]:[];
  if(path.startsWith('dependencies'))return [];
  if(path.startsWith('solutioncomponents'))return env==='dev'&&scenario==='flow'?[{objectid:flowId,componenttype:29}]:[];
  if(path.startsWith('workflows')&&path.includes('category eq 5'))return scenario==='flow'&&(env==='dev'||imported)?[{workflowid:flowId,name:'Demo Flow',uniquename:'ph_flow',statecode:env==='dev'?1:0,ismanaged:false}]:[];
  if(path.startsWith('savedqueries')||path.startsWith('systemforms')||path.startsWith('savedqueryvisualizations')||path.startsWith('workflows')||path.startsWith('connectionreferences'))return [];
  if(path.startsWith('solutions'))return path.includes("uniquename eq 'Default'")?[{_publisherid_value:'55555555-5555-4555-8555-555555555555'}]:[];
  throw Error('Unhandled catalog fixture: '+path);
 };
 const request=async(env:string,path:string,options:RequestOptions={}):Promise<unknown>=>{
  if(options.method&&options.method!=='GET'){
   writes.push({env,path,body:options.body});
   if(path==='solutions'){container=(options.body as {uniquename:string}).uniquename;return;}
   if(path==='AddSolutionComponent'||path==='PublishXml'||options.method==='DELETE')return;
   if(path==='ExportSolution')return {ExportSolutionFile:scenario==='flow'?Buffer.from(zipSync({'customizations.xml':strToU8(`<ImportExportXml><Workflows><Workflow WorkflowId="{${flowId}}"><JsonFileName>/Workflows/demo.json</JsonFileName><Category>5</Category><StateCode>1</StateCode><StatusCode>2</StatusCode></Workflow></Workflows></ImportExportXml>`),'Workflows/demo.json':strToU8('{"properties":{"definition":{"actions":{}}}}')})).toString('base64'):'ZmFrZQ=='};
   if(path==='ImportSolutionAsync'){imported=true;return {AsyncOperationId:'66666666-6666-4666-8666-666666666666'};}
   if(path==='ph_demos'){const row=options.body as Record<string,unknown>;records.set(String(row.ph_demoid),row);return;}
   if(path.startsWith('ph_demos(')&&options.method==='PATCH'){Object.assign(records.get(recordId)!,options.body);return;}
   throw Error('Unhandled write fixture: '+path);
  }
  if(path==='WhoAmI')return {UserId:'application-user'};
  if(path.startsWith('EntityDefinitions'))return path.includes('$expand')?{LogicalName:'ph_demo',OneToManyRelationships:[],ManyToOneRelationships:[],ManyToManyRelationships:[],Keys:[]}:{LogicalName:'ph_demo'};
  if(path.startsWith('asyncoperations'))return {statecode:3,statuscode:30};
  if(path.startsWith('solutions('))return {uniquename:container};
  if(path.startsWith('workflows('))return path.includes('clientdata')?{clientdata:'{"properties":{"connectionReferences":{}}}'}:{statecode:0};
  if(path.startsWith('ph_demos?'))return {value:[{ph_demoid:recordId,ph_name:'Demo record'}]};
  if(path.startsWith('ph_demos(')){const row=records.get(recordId);if(!row)throw new AppError('NOT_FOUND','fixture missing',404);return row;}
  throw Error('Unhandled request fixture: '+path);
 };
 const client={all,request} as unknown as MicrosoftClient;const app=buildApp({config:loadConfig({MICROSOFT_CLIENT_SECRET:'fixture-only'}),store,client});
 const kind=scenario==='table-data'?'table':scenario;const preview=await app.inject({method:'POST',url:'/api/plans',payload:{source:'dev',target:'production',kind,ids:[kind==='column'?columnId:kind==='flow'?flowId:tableId],tableId:kind==='column'?tableId:undefined,includeData:scenario==='table-data'}});
 expect(preview.statusCode,preview.body).toBe(200);const plan=preview.json();expect(plan.blockers).toEqual([]);
 const response=await app.inject({method:'POST',url:'/api/jobs',payload:{planId:plan.id,hash:plan.hash,idempotencyKey:crypto.randomUUID()}});expect(response.statusCode,response.body).toBe(200);
 const worker=(app as unknown as {transferWorker:Worker}).transferWorker;await worker.tick();await worker.tick();const finished=store.getJob(response.json().id)!;
 expect(finished.status,JSON.stringify(finished.error)).toBe('succeeded');expect(writes.filter(w=>w.env==='production'&&w.path==='ImportSolutionAsync')).toHaveLength(1);
 if(scenario==='flow'){
  const payload=writes.find(w=>w.path==='ImportSolutionAsync')!.body as {CustomizationFile:string};const xml=strFromU8(unzipSync(Buffer.from(payload.CustomizationFile,'base64'))['customizations.xml']);expect(xml).toContain('<StateCode>0</StateCode>');expect(xml).toContain('<StatusCode>1</StatusCode>');expect(writes.filter(w=>w.env==='dev'&&w.path.startsWith('workflows'))).toEqual([]);expect(plan.warnings.join(' ')).not.toContain('nguồn phải tắt');
 }
 const add=writes.find(w=>w.path==='AddSolutionComponent')!.body as {ComponentType:number;DoNotIncludeSubcomponents?:boolean};expect(add.ComponentType).toBe(kind==='table'?1:kind==='column'?2:29);if(kind==='table')expect(add.DoNotIncludeSubcomponents).toBe(false);else expect(add).not.toHaveProperty('DoNotIncludeSubcomponents');
 expect(records.size).toBe(scenario==='table-data'?1:0);if(scenario==='table-data'){expect(records.get(recordId)?.ph_name).toBe('Demo record');expect(finished.counts.created).toBe(1);}
 await app.close();store.close();
});
