import {createHash,randomUUID} from 'node:crypto';
import type {ComponentRef,TransferPlan,TransferRequest} from '../../shared/contracts';
import type {CatalogService} from '../catalog/catalog';
import {AppError} from '../errors';
import {walkDependencies,selectAfterDecision,type DependencyReader} from './dependencies';
export class Planner{
 private plans=new Map<string,TransferPlan>();
 constructor(public catalog:CatalogService,private reader:Pick<DependencyReader,'required'>,private save?:(plan:TransferPlan)=>void,private restore?:(id:string)=>TransferPlan|undefined){}
 get(id:string):TransferPlan{const p=this.plans.get(id)||this.restore?.(id);if(!p)throw new AppError('PLAN_NOT_FOUND','Không tìm thấy kế hoạch. Hãy kiểm tra lại.',404);return structuredClone(p);}
 put(plan:TransferPlan){const copy=structuredClone(plan);copy.hash=createHash('sha256').update(JSON.stringify({...copy,hash:''})).digest('hex');this.save?.(copy);this.plans.set(copy.id,copy);return structuredClone(copy);}
 async available(request:TransferRequest):Promise<ComponentRef[]>{return request.kind==='table'?(await this.catalog.tables(request.source,request.target)).items:request.kind==='column'?(await this.catalog.columns(request.source,request.target,request.tableId!)).items:(await this.catalog.flows(request.source,request.target)).items;}
 async createPlan(request:TransferRequest):Promise<TransferPlan>{
  if(request.source===request.target)throw new AppError('INVALID_ENVIRONMENT','Môi trường nguồn và đích phải khác nhau.');
  const available=await this.available(request);const roots=request.ids.map(id=>available.find(c=>c.id===id));
  if(roots.some(c=>!c?.selectable))throw new AppError('INVALID_SELECTION','Có thành phần không hợp lệ hoặc đã có ở đích. Tải lại danh sách.');
  const components=roots as ComponentRef[];const dependencies=await walkDependencies(components,item=>this.reader.required(request,item));
  const plan:TransferPlan={id:randomUUID(),hash:'',expiresAt:new Date(Date.now()+15*60000).toISOString(),request,components,dependencies,acceptedIds:[],rejectedIds:[],blockers:[],warnings:[]};
  if(dependencies.length)plan.blockers.push('Cần quyết định các dependency trước khi chuyển.');
  for(const dep of dependencies.filter(d=>!d.selectable))plan.blockers.push(`${dep.displayName}: ${dep.reason}`);
  return this.put(plan);
 }
 async resolveDependencies(id:string,acceptedIds:string[]){
  const plan=this.get(id);const roots=plan.components.filter(c=>plan.request.ids.includes(c.id));
  if(acceptedIds.some(id=>!plan.dependencies.some(d=>d.id===id&&d.selectable)))throw new AppError('INVALID_DEPENDENCY','Chỉ được thêm dependency custom unmanaged đã liệt kê.');
  const remaining=selectAfterDecision(roots,plan.dependencies,acceptedIds);
  const relevant=plan.dependencies.filter(d=>d.forIds.some(root=>remaining.some(r=>r.id===root)));
  plan.components=[...remaining,...relevant.filter(d=>acceptedIds.includes(d.id))];
  plan.acceptedIds=acceptedIds;plan.rejectedIds=roots.filter(r=>!remaining.some(c=>c.id===r.id)).map(r=>r.id);plan.blockers=[];
  if(!remaining.length)plan.blockers.push('Không còn thành phần có thể chuyển sau khi từ chối dependency.');
  if(plan.rejectedIds.length)plan.warnings.push('Đã bỏ các bảng cần dependency bị từ chối. Kiểm tra danh sách còn lại trước khi chuyển.');
  return this.put(plan);
 }
 async validatePlan(id:string,hash:string){
  const plan=this.get(id);if(plan.hash!==hash||Date.parse(plan.expiresAt)<Date.now())throw new AppError('STALE_PLAN','Kế hoạch đã thay đổi hoặc hết hạn. Kiểm tra lại.');
  if(plan.blockers.length)throw new AppError('PLAN_BLOCKED',plan.blockers.join(' '));
  const available=await this.available(plan.request);
  for(const item of plan.components.filter(c=>plan.request.ids.includes(c.id)))if(!available.find(c=>c.id===item.id)?.selectable)throw new AppError('STALE_PLAN','Thành phần ở nguồn/đích đã thay đổi. Kiểm tra lại trước khi chuyển.');
  if(plan.request.kind==='table')for(const item of plan.components)if(!available.find(c=>c.id===item.id)?.selectable)throw new AppError('STALE_PLAN','Bảng phụ thuộc đã thay đổi. Kiểm tra lại.');
  // Refresh the graph to detect new dependencies between preview and execution.
  const deps=await walkDependencies(plan.components,item=>this.reader.required(plan.request,item));
  if(deps.length)throw new AppError('STALE_PLAN','Dependency đã thay đổi. Hãy lập kế hoạch mới.');
  return plan;
 }
}
