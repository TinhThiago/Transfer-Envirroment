import type {Job} from '../../shared/contracts';
import type {Planner} from '../plans/planner';
import type {SolutionService} from '../solutions/solution';
import {AppError} from '../errors';
export async function resumeBusyImport(job:Job,planner:Planner,solutions:SolutionService):Promise<Job>{
 if(job.schemaImported||!job.importId||!job.asyncId||!(['awaiting-input','failed'].includes(job.status))||!['ENVIRONMENT_BUSY','IMPORT_FAILED'].includes(job.error?.code||''))throw new AppError('UNSAFE_RETRY','Job không ở trạng thái có thể tiếp tục import do môi trường bận.');
 let confirmed=false;try{await solutions.importStatus(job.target,job);}catch(error){if(error instanceof AppError&&error.code==='ENVIRONMENT_BUSY')confirmed=true;else throw error;}
 if(!confirmed)throw new AppError('UNSAFE_RETRY','Chưa xác nhận lượt import trước đã thất bại do môi trường bận. Không gửi lại.');
 await planner.validatePlan(job.planId,job.planHash);
 const next=structuredClone(job);next.importAttempts=[...(next.importAttempts||[]),{importId:job.importId,asyncId:job.asyncId,reason:'ENVIRONMENT_BUSY'}];delete next.importId;delete next.asyncId;delete next.importRejected;delete next.error;next.resumeRequired=false;next.cancelRequested=false;next.status='queued';next.step='Người dùng đã yêu cầu tiếp tục; kiểm tra lại trước khi import.';return next;
}
