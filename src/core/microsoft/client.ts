import {environments,type EnvironmentId} from '../environments';
import {AppError} from '../errors';
import type {RequestOptions} from '../ports';
export class DataverseClient{
constructor(private token:(env:EnvironmentId)=>Promise<string>,private fetcher:typeof fetch=fetch,private sleep:(ms:number)=>Promise<void>=ms=>new Promise(r=>setTimeout(r,ms))){}
  async request<T>(env:EnvironmentId,path:string,options:RequestOptions={}):Promise<T>{
    const origin=environments[env]?.url;if(!origin)throw new AppError('INVALID_ENVIRONMENT','Môi trường không hợp lệ.');
    const url=new URL(path,`${origin}/api/data/v9.2/`);
    if(url.origin!==origin||!url.pathname.startsWith('/api/data/v9.2/')||url.username||url.password)throw new AppError('UNSAFE_URL','Địa chỉ API không nằm trong môi trường đã cấu hình.');
    const method=options.method||'GET';
    for(let attempt=0;attempt<4;attempt++){
      const token=await this.token(env);let response:Response;
      try{response=await this.fetcher(url,{method,headers:{Authorization:`Bearer ${token}`,Accept:'application/json','Content-Type':'application/json','OData-MaxVersion':'4.0','OData-Version':'4.0',...options.headers},body:options.body===undefined?undefined:JSON.stringify(options.body),redirect:'error',signal:AbortSignal.timeout(method==='GET'?60000:240000)});}
      catch{throw new AppError(method==='GET'?'NETWORK_ERROR':'WRITE_OUTCOME_UNKNOWN',method==='GET'?'Mất kết nối Dataverse.':'Mất phản hồi sau thao tác ghi. Không tự gửi lại để tránh ghi trùng.',502);}
      if(response.status===401){throw new AppError('AUTH_FAILED','Phiên xác thực Dataverse bị từ chối.',401);}
      if(response.status===403)throw new AppError('FORBIDDEN','Tài khoản xác thực thiếu quyền thực hiện thao tác này trên môi trường đã chọn.',403);
      if(response.status===404)throw new AppError('NOT_FOUND','Không tìm thấy thành phần trong môi trường.',404);
      if(method==='GET'&&[429,502,503,504].includes(response.status)&&attempt<3){const retry=response.headers.get('Retry-After');const seconds=retry?Number(retry):NaN;const ms=Number.isFinite(seconds)?seconds*1000:retry?Math.max(0,Date.parse(retry)-Date.now()):1000*2**attempt;await this.sleep(Math.min(Math.max(ms||1000,0),60000));continue;}
      if(!response.ok){let vendorCode='';try{const data=await response.json() as {error?:{code?:string}};if(/^0x[0-9a-f]+$/i.test(data.error?.code||''))vendorCode=` (${data.error?.code})`;}catch{}
        throw new AppError(response.status===429?'THROTTLED':'DATAVERSE_ERROR',`Dataverse trả lỗi HTTP ${response.status}${vendorCode}. Kiểm tra quyền, dependency và import job.`,response.status===429?429:502,response.status);}
      if(response.status===204||response.headers.get('content-length')==='0')return undefined as T;
      return await response.json() as T;
    }
    throw new AppError('THROTTLED','Dataverse đang giới hạn tần suất. Thử lại sau.',429);
  }
  async all<T>(env:EnvironmentId,path:string):Promise<T[]>{
    const result:T[]=[];const seen=new Set<string>();let next:string|undefined=path;
    while(next){if(seen.has(next))throw new AppError('PAGING_LOOP','Dataverse trả phân trang lặp.');seen.add(next);const data:{value:T[];'@odata.nextLink'?:string}=await this.request(env,next);result.push(...data.value);next=data['@odata.nextLink'];}
    return result;
  }
}
