import type {BrowserAuth} from '../browser/auth';
import type {BrowserRuntime} from '../browser/runtime';
import {apiUrl} from './api';
let active:BrowserRuntime|undefined;let namespace='';
export function getBrowserRuntime(){if(!active)throw new Error('Đăng nhập Microsoft để mở phiên chuyển đổi.');return active;}
export async function startBrowserSession(auth:BrowserAuth){const account=auth.getAccount();if(!account)throw new Error('Chưa đăng nhập Microsoft.');const next=account.tenantId+':'+account.id;if(active&&namespace===next)return;await closeBrowserSession();const {BrowserRuntime}=await import('../browser/runtime');active=await BrowserRuntime.create(auth);namespace=next;active.start();}
export async function closeBrowserSession(){const previous=active;active=undefined;namespace='';await previous?.stop();}
export async function browserRequest<T>(path:string,body?:unknown){return getBrowserRuntime().request<T>(path,body);}
export async function openSolution(jobId:string){
 if(import.meta.env.VITE_RUNTIME_MODE!=='browser'){window.open(apiUrl(`/api/jobs/${jobId}/solution`),'_blank','noopener,noreferrer');return;}
 const tab=window.open('about:blank','_blank');if(tab)tab.opener=null;
 try{const url=await getBrowserRuntime().openSolution(jobId);if(tab)tab.location.replace(url);else throw new Error('Cho phép popup để mở Solution.');}catch(error){tab?.close();throw error;}
}
