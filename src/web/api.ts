export async function api<T>(path:string,body?:unknown):Promise<T>{
 let response:Response;try{response=await fetch(path,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});}catch{throw new Error('Không kết nối được backend. Kiểm tra app đang chạy và tải lại.');}
 const data=await response.json();if(!response.ok)throw new Error(data.error?.message||'Thao tác chưa hoàn tất.');return data as T;
}
