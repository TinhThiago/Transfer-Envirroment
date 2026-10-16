import {PublicClientApplication,type IPublicClientApplication,type AccountInfo} from '@azure/msal-browser';
import {environments,type EnvironmentId} from '../core/environments';
import {AppError} from '../core/errors';
import {authSettings} from './auth-config';
export interface BrowserAccount{id:string;tenantId:string;username:string}
export class BrowserAuth{
 readonly redirectUri:string;
 constructor(private msal:IPublicClientApplication=new PublicClientApplication({auth:{clientId:authSettings().clientId,authority:`https://login.microsoftonline.com/${authSettings().tenantId}`,redirectUri:authSettings().redirectUri},cache:{cacheLocation:'sessionStorage'}}),readonly settings=authSettings()){this.redirectUri=settings.redirectUri;}
 async initialize(){await this.msal.initialize();const existing=this.msal.getActiveAccount()||this.msal.getAllAccounts().find(a=>a.tenantId===this.settings.tenantId);if(existing&&existing.tenantId===this.settings.tenantId)this.msal.setActiveAccount(existing);else this.msal.setActiveAccount(null);}
 private account():AccountInfo|null{const a=this.msal.getActiveAccount();return a?.tenantId===this.settings.tenantId?a:null;}
 getAccount():BrowserAccount|null{const a=this.account();return a?{id:a.homeAccountId,tenantId:a.tenantId,username:a.username}:null;}
 private scopes(env:EnvironmentId){return [`${environments[env].url}/user_impersonation`];}
 async signIn(env:EnvironmentId='dev'){
  try{const account=this.account();const options={scopes:this.scopes(env),redirectUri:this.redirectUri};const result=account?await this.msal.acquireTokenPopup({...options,account}):await this.msal.loginPopup({...options,prompt:'select_account'});if(result.account?.tenantId!==this.settings.tenantId)throw new AppError('AUTH_TENANT_MISMATCH','Chọn tài khoản trong đúng Microsoft tenant của ứng dụng.');this.msal.setActiveAccount(result.account);}catch(error){if(error instanceof AppError)throw error;throw new AppError('AUTH_FAILED','Không đăng nhập/cấp quyền được. Kiểm tra popup, SPA Redirect URI, Dataverse user_impersonation và consent trong Entra ID.');}
 }
 async getToken(env:EnvironmentId){
  const account=this.account();if(!account)throw new AppError('AUTH_INTERACTION_REQUIRED','Đăng nhập Microsoft để kết nối môi trường.');
  try{const result=await this.msal.acquireTokenSilent({account,scopes:this.scopes(env),redirectUri:this.redirectUri});if(!result.accessToken)throw Error('empty');return result.accessToken;}catch{throw new AppError('AUTH_INTERACTION_REQUIRED',`Phiên ${environments[env].name} cần đăng nhập/cấp quyền lại. Bấm nút cấp quyền tương ứng; app không tự mở popup.`);}
 }
 async signOut(){const account=this.account();await this.msal.logoutPopup({account:account||undefined,postLogoutRedirectUri:this.redirectUri});this.msal.setActiveAccount(null);}
}
