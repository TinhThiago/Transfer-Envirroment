import {it,expect,vi} from 'vitest';
import {BrowserAuth} from '../src/browser/auth';
import {authSettings} from '../src/browser/auth-config';
const account={homeAccountId:'user',tenantId:'tenant',username:'me@example.com'};
it('preserves safe Microsoft diagnostic codes without exposing response payloads',async()=>{
 const auth=new BrowserAuth({getActiveAccount:()=>null,loginPopup:async()=>{throw {errorCode:'invalid_client',errorMessage:'AADSTS700016: Application not found. access_token=private-value',correlationId:'11111111-1111-4111-8111-111111111111'}}} as never,{...authSettings('https://example.com','/'),tenantId:'tenant'});
 await expect(auth.signIn()).rejects.toMatchObject({message:expect.stringContaining('AADSTS700016')});
 try{await auth.signIn()}catch(error){expect((error as Error).message).toContain('invalid_client');expect((error as Error).message).not.toContain('private-value');}
});
it('requests resource-scoped tokens silently and never opens a popup during polling',async()=>{
 const silent=vi.fn(async(_options:{scopes:string[]})=>({accessToken:'dev-token',account}));const popup=vi.fn();const msal={initialize:async()=>{},getActiveAccount:()=>account,getAllAccounts:()=>[account],setActiveAccount:()=>{},acquireTokenSilent:silent,loginPopup:popup,acquireTokenPopup:popup};
 const auth=new BrowserAuth(msal as never,{...authSettings('https://user.github.io','/Transfer-Enviroment/'),tenantId:'tenant'});await auth.initialize();expect(auth.redirectUri).toBe('https://user.github.io/Transfer-Enviroment/auth-callback.html');expect(await auth.getToken('dev')).toBe('dev-token');expect(silent.mock.calls[0][0].scopes).toEqual(['https://phuochungdev.crm5.dynamics.com/user_impersonation']);
 silent.mockRejectedValueOnce({errorCode:'consent_required'});await expect(auth.getToken('production')).rejects.toMatchObject({code:'AUTH_INTERACTION_REQUIRED'});expect(popup).not.toHaveBeenCalled();
});
it('uses a user gesture for sign-in and clears the account on logout',async()=>{
 let current:typeof account|null=null;const popup=vi.fn(async(_options:{scopes:string[]})=>({account,accessToken:'token'}));const auth=new BrowserAuth({initialize:async()=>{},getActiveAccount:()=>current,getAllAccounts:()=>[],setActiveAccount:(value:typeof current)=>{current=value},loginPopup:popup,logoutPopup:async()=>{}} as never,{...authSettings('https://example.com','/'),tenantId:'tenant'});
 await auth.initialize();expect(auth.getAccount()).toBeNull();await auth.signIn('production');expect(auth.getAccount()?.id).toBe('user');expect(popup.mock.calls[0][0].scopes).toEqual(['https://phuochung1.crm5.dynamics.com/user_impersonation']);await auth.signOut();expect(auth.getAccount()).toBeNull();
});
