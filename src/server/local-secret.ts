import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {AppError} from './errors';
const defaultPath='.runtime/client-secret.dpapi';
function protect(value:string,decrypt=false){
 if(process.platform!=='win32')throw new AppError('SECRET_STORAGE_UNAVAILABLE','Lưu secret mã hóa cục bộ chỉ hỗ trợ Windows.');
 const script="$ErrorActionPreference='Stop';[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;$value=[Console]::In.ReadToEnd();"+(decrypt?"$secure=ConvertTo-SecureString -String $value;$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);try{[Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer))}finally{[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}":"$secure=ConvertTo-SecureString -String $value -AsPlainText -Force;[Console]::Out.Write((ConvertFrom-SecureString -SecureString $secure))");
 const result=spawnSync(join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),['-NoProfile','-NonInteractive','-Command',script],{input:value,encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:1024*1024});
 if(result.error||result.status!==0||!result.stdout)throw new AppError('SECRET_STORAGE_FAILED','Không đọc/ghi được secret mã hóa. Dùng đúng tài khoản Windows đã lưu hoặc cấu hình lại secret.');
 return result.stdout.replace(/^\uFEFF/,'');
}
export function saveLocalSecret(secret:string,path=defaultPath){if(!secret.trim())throw new AppError('SECRET_REQUIRED','Không thể lưu secret trống.');const encrypted=protect(secret);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,encrypted,{encoding:'utf8',mode:0o600});}
export function readLocalSecret(path=defaultPath){return existsSync(path)?protect(readFileSync(path,'utf8'),true):'';}
