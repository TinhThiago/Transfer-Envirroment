import {it,expect} from 'vitest';
import {SolutionService} from '../src/core/solutions/solution';
import {resumeBusyImport} from '../src/core/jobs/resume-busy';
import {AppError} from '../src/core/errors';
const job={id:'job',planId:'plan',planHash:'hash',target:'production',status:'awaiting-input',error:{code:'ENVIRONMENT_BUSY'},importId:'old-import',asyncId:'old-async',schemaImported:false,warnings:[]} as any;
it('classifies only a completed failed import with the exact concurrency code as waiting',async()=>{
 const service=new SolutionService({request:async()=>({statecode:3,statuscode:31,errorcode:-2147020463})} as never);await expect(service.importStatus('production',job)).rejects.toMatchObject({code:'ENVIRONMENT_BUSY'});
 const pending=new SolutionService({request:async()=>({statecode:0,statuscode:10,errorcode:-2147020463})} as never);expect(await pending.importStatus('production',job)).toBe('pending');
});
it('resumes only after rechecking definitive concurrency failure and validating the plan',async()=>{
 let validated=0;const result=await resumeBusyImport(job,{validatePlan:async()=>{validated++;return {request:{kind:'table'}}}} as any,{importStatus:async()=>{throw new AppError('ENVIRONMENT_BUSY','busy')}} as any);expect(result.status).toBe('queued');expect(result.importId).toBeUndefined();expect(result.asyncId).toBeUndefined();expect(result.importAttempts?.[0]).toMatchObject({importId:'old-import',asyncId:'old-async'});expect(job.importId).toBe('old-import');expect(validated).toBe(1);
});
it.each(['pending','succeeded','failed'])('refuses to resubmit when previous import result is %s',async status=>{
 await expect(resumeBusyImport(job,{} as any,{importStatus:async()=>status} as any)).rejects.toMatchObject({code:'UNSAFE_RETRY'});expect(job.importId).toBe('old-import');
});
it('preserves a waiting job if its plan is stale',async()=>{
 await expect(resumeBusyImport(job,{validatePlan:async()=>{throw new AppError('STALE_PLAN','stale')}} as any,{importStatus:async()=>{throw new AppError('ENVIRONMENT_BUSY','busy')}} as any)).rejects.toMatchObject({code:'STALE_PLAN'});expect(job.importId).toBe('old-import');
});
