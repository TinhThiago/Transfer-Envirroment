import {it,expect} from 'vitest';
import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {prepareInactiveFlowArtifact} from '../src/server/flows/artifact';
import {SolutionService} from '../src/server/solutions/solution';
const id='33333333-3333-4333-8333-333333333333';
const flow=(category=5)=>`<Workflow WorkflowId="{${id}}" Name="Luồng &amp; A"><JsonFileName>/Workflows/demo.json</JsonFileName><Category>${category}</Category><StateCode>1</StateCode><StatusCode>2</StatusCode></Workflow>`;
const pack=(xml:string)=>Buffer.from(zipSync({'customizations.xml':strToU8(xml),'Workflows/demo.json':strToU8('{"properties":{"state":"Started","definition":{"actions":{}}}}'),'solution.xml':strToU8('<ImportExportXml/>')})).toString('base64');
it('sets only the packaged flow to draft/off and preserves definitions, ids and other assets',()=>{
 const original=pack(`<ImportExportXml><Workflows>${flow()}</Workflows></ImportExportXml>`);const output=prepareInactiveFlowArtifact(original,[id]);const files=unzipSync(Buffer.from(output,'base64'));const xml=strFromU8(files['customizations.xml']);
 expect(xml).toContain('<StateCode>0</StateCode>');expect(xml).toContain('<StatusCode>1</StatusCode>');expect(xml).toContain(`WorkflowId="{${id}}"`);expect(xml).toContain('Luồng &amp; A');
 const before=unzipSync(Buffer.from(original,'base64'));expect(files['Workflows/demo.json']).toEqual(before['Workflows/demo.json']);expect(files['solution.xml']).toEqual(before['solution.xml']);expect(strFromU8(before['customizations.xml'])).toContain('<StateCode>1</StateCode>');
 expect(prepareInactiveFlowArtifact(output,[id])).toBe(output);
});
it('removes source connection binding and current variable values only when configuring later',()=>{
 const original=pack(`<ImportExportXml><Workflows>${flow()}</Workflows><connectionreferences><connectionreference connectionreferencelogicalname="ph_ref"><connectionid>source-connection</connectionid><connectorid>dataverse</connectorid></connectionreference></connectionreferences><environmentvariabledefinitions><environmentvariabledefinition schemaname="ph_url"><environmentvariablevalues><environmentvariablevalue><value>source-url</value></environmentvariablevalue></environmentvariablevalues></environmentvariabledefinition></environmentvariabledefinitions></ImportExportXml>`);
 const xml=strFromU8(unzipSync(Buffer.from(prepareInactiveFlowArtifact(original,[id],true),'base64'))['customizations.xml']);expect(xml).not.toContain('source-connection');expect(xml).not.toContain('source-url');expect(xml).toContain('ph_ref');expect(xml).toContain('ph_url');expect(xml).toContain('<connectorid>dataverse</connectorid>');
});
it.each(['not a zip',pack('<ImportExportXml/>'),pack(`<ImportExportXml><Workflows>${flow(0)}</Workflows></ImportExportXml>`),pack(`<ImportExportXml><Workflows>${flow().replace('<StateCode>1</StateCode>','')}</Workflows></ImportExportXml>`),pack('<!DOCTYPE x><ImportExportXml/>')])('rejects an unverified or unsupported artifact before import',async artifact=>{
 let calls=0;const service=new SolutionService({request:async()=>{calls++;return {AsyncOperationId:'a'}}} as never);const job={} as never;
 await expect(service.startImport({request:{kind:'flow',target:'dev'},components:[{kind:'flow',id}]} as never,artifact,job,()=>{})).rejects.toMatchObject({code:'SAFE_FLOW_IMPORT_UNAVAILABLE'});expect(calls).toBe(0);expect(job).not.toHaveProperty('importId');
});
it('sends an off artifact even when the exported source flow is on, without issuing a source state update',async()=>{
 const calls:{env:string;path:string;body:any}[]=[];const service=new SolutionService({request:async(env:string,path:string,options:any)=>{calls.push({env,path,body:options.body});return {AsyncOperationId:'a'}}} as never);
 await service.startImport({request:{kind:'flow',target:'dev'},components:[{kind:'flow',id}]} as never,pack(`<ImportExportXml><Workflows>${flow()}</Workflows></ImportExportXml>`),{} as never,()=>{});
 expect(calls).toHaveLength(1);expect(calls[0].env).toBe('dev');expect(calls[0].path).toBe('ImportSolutionAsync');const xml=strFromU8(unzipSync(Buffer.from(calls[0].body.CustomizationFile,'base64'))['customizations.xml']);expect(xml).toContain('<StateCode>0</StateCode>');expect(calls[0].body.PublishWorkflows).toBe(false);
});
