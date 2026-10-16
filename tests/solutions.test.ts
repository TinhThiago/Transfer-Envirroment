import {it,expect} from 'vitest';
import {componentParameters,importParameters,SolutionService} from '../src/server/solutions/solution';
import {AppError} from '../src/server/errors';
import type {Job} from '../src/shared/contracts';
it('includes all table subcomponents without silently adding dependencies',()=>{
 expect(componentParameters({id:'a',componentType:1},'ph_job')).toMatchObject({ComponentId:'a',ComponentType:1,AddRequiredComponents:false,DoNotIncludeSubcomponents:false});
 expect(componentParameters({id:'c',componentType:2},'ph_job')).not.toHaveProperty('DoNotIncludeSubcomponents');
});
it.each([29,10163,10035,380,10])('omits entity-only segmentation for component type %i, avoiding 0x80040216',type=>{
 expect(componentParameters({id:'component',componentType:type},'ph_job')).toEqual({ComponentId:'component',ComponentType:type,SolutionUniqueName:'ph_job',AddRequiredComponents:false});
});
it('keeps component properties when including all table assets, avoiding Dataverse 0x80040216',()=>{
 const params=componentParameters({id:'a',componentType:1},'ph_job');expect(params.DoNotIncludeSubcomponents).toBe(false);expect(params).not.toHaveProperty('IncludedComponentSettingsValues');
});
it('does not infer import success from progress 100 without an explicit result',async()=>{
 const service=new SolutionService({request:async()=>({progress:100,completedon:'2026-10-15',data:''})} as never);
 await expect(service.importStatus('production',{importId:'i'} as never)).rejects.toMatchObject({code:'IMPORT_OUTCOME_UNKNOWN'});
});
it('does not overwrite existing unmanaged components or activate classic workflows',()=>{
 const params=importParameters('zip','import-id');expect(params.OverwriteUnmanagedCustomizations).toBe(false);expect(params.PublishWorkflows).toBe(false);expect(params.ImportJobId).toBe('import-id');
});
it('omits an empty polymorphic ComponentParameters collection for imports without overrides',()=>{
 expect(importParameters('zip','import-id')).not.toHaveProperty('ComponentParameters');expect(importParameters('zip','import-id',[{'@odata.type':'Microsoft.Dynamics.CRM.connectionreference'}])).toHaveProperty('ComponentParameters');
});
it('preserves a definitive import rejection instead of treating it as a lost response',async()=>{
 const service=new SolutionService({request:async()=>{throw new AppError('DATAVERSE_ERROR','Rejected HTTP 400',502,400)}} as never);const job={status:'queued'} as Job;
 await expect(service.startImport({request:{target:'dev'}} as never,'zip',job,()=>{})).rejects.toMatchObject({code:'DATAVERSE_ERROR'});expect(job.importRejected).toBe(true);
});
it('packages incoming custom lookup and relationship even when the related table already exists',async()=>{
 const added:{ComponentId:string;ComponentType:number}[]=[];
 const client={all:async(_:string,path:string)=>path.startsWith('solutions')?[{solutionid:'solution'}]:path.includes('/Attributes')?[{MetadataId:'lookup',LogicalName:'ph_demo',IsCustomAttribute:true,IsManaged:false}]:path.startsWith('solutioncomponents')?added.map(c=>({objectid:c.ComponentId,componenttype:c.ComponentType})):[],request:async(_:string,path:string,options?:{body:{ComponentId:string;ComponentType:number}})=>{
  if(path==='AddSolutionComponent'){added.push(options!.body);return {id:'component'};}
  if(path==='ExportSolution')return {ExportSolutionFile:'zip'};
  if(path.includes('$expand'))return {OneToManyRelationships:[{MetadataId:'relationship',SchemaName:'ph_existing_ph_demo',ReferencingEntity:'ph_existing',ReferencedEntity:'ph_demo',ReferencingAttribute:'ph_demo',IsManaged:false}],ManyToOneRelationships:[],ManyToManyRelationships:[]};
  if(path.startsWith('EntityDefinitions'))return {MetadataId:'existing-table'};
 }};
 const service=new SolutionService(client as never);const plan={request:{source:'production',target:'dev'},components:[{id:'table',kind:'table',componentType:1,logicalName:'ph_demo'}]} as never;const job={id:'job',solutionName:'ph_job',sourceSolutionId:'solution'} as Job;
 expect(await service.build(plan,job,()=>{})).toBe('zip');expect(added.map(c=>[c.ComponentId,c.ComponentType])).toEqual([['table',1],['lookup',2],['relationship',10]]);
});
it('removes only the exact unmanaged job container in both environments',async()=>{
 const job={id:'11111111-1111-4111-8111-111111111111',sourceSolutionId:'source',solutionName:'phtransfer_11111111111141118111111111111111',schemaImported:true} as Job;const deleted:string[]=[];
 const service=new SolutionService({all:async(env:string)=>[{solutionid:env==='dev'?'source':'target',uniquename:job.solutionName,ismanaged:false}],request:async(env:string,path:string,options:{method:string})=>{expect(options.method).toBe('DELETE');deleted.push(env+':'+path)}} as never);
 await service.cleanup({request:{source:'dev',target:'production'}} as never,job);expect(deleted).toEqual(['dev:solutions(source)','production:solutions(target)']);
});
it('refuses to delete managed or mismatched solutions and never deletes components',async()=>{
 const job={id:'11111111-1111-4111-8111-111111111111',sourceSolutionId:'source',solutionName:'phtransfer_11111111111141118111111111111111',schemaImported:true} as Job;let deletes=0;
 const service=new SolutionService({all:async()=>[{solutionid:'source',uniquename:job.solutionName,ismanaged:true}],request:async()=>{deletes++}} as never);await expect(service.cleanup({request:{source:'dev',target:'production'}} as never,job)).rejects.toMatchObject({code:'CLEANUP_MISMATCH'});expect(deletes).toBe(0);
});
it('treats absent containers as already cleaned',async()=>{
 const job={id:'11111111-1111-4111-8111-111111111111',sourceSolutionId:'source',solutionName:'phtransfer_11111111111141118111111111111111',schemaImported:true} as Job;const service=new SolutionService({all:async()=>[],request:async()=>{throw Error('must not delete')}} as never);await expect(service.cleanup({request:{source:'dev',target:'production'}} as never,job)).resolves.toBeUndefined();
});
