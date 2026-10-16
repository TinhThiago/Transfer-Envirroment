export class AppError extends Error{
  constructor(public code:string,message:string,public status=400,public upstreamStatus?:number){super(message);}
}
export function safeError(error:unknown):{code:string,message:string}{return error instanceof AppError?{code:error.code,message:error.message}:{code:'INTERNAL_ERROR',message:'Thao tác chưa hoàn tất. Kiểm tra kết nối và thử lại.'};}
