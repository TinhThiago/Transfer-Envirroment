export function apiUrl(path:string){
 const base=(import.meta.env.VITE_API_BASE_URL||'').trim().replace(/\/+$/,'');
 if(!path.startsWith('/api/'))throw new Error('Đường dẫn API không hợp lệ.');
 if(base){const url=new URL(base);if(url.username||url.password||url.search||url.hash||!['https:','http:'].includes(url.protocol))throw new Error('VITE_API_BASE_URL không hợp lệ.');}
 return base+path;
}
export async function api<T>(path:string,body?:unknown):Promise<T>{
 if(import.meta.env.VITE_RUNTIME_MODE==='browser'){const {browserRequest}=await import('./runtime');return browserRequest<T>(path,body);}
 let response:Response;try{response=await fetch(apiUrl(path),{method:body===undefined?'GET':'POST',credentials:'include',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Không kết nối được backend. Kiểm tra địa chỉ API, đăng nhập backend và cấu hình CORS.');}
 if(!(response.headers.get('content-type')||'').includes('application/json'))throw new Error('Backend chưa trả JSON. Kiểm tra VITE_API_BASE_URL hoặc đăng nhập backend trước.');
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Thao tác chưa hoàn tất.');return data as T;
}
