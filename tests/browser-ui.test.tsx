// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {MicrosoftSignIn} from '../src/web/components/MicrosoftSignIn';
vi.mock('../src/web/runtime',()=>({startBrowserSession:vi.fn(async()=>{}),closeBrowserSession:vi.fn(async()=>{}),getBrowserRuntime:()=>({hasWork:false})}));
afterEach(cleanup);
it('gates the app until Microsoft sign-in and displays the exact SPA redirect URI',async()=>{
 let account:unknown=null;const signIn=vi.fn(async()=>{account={id:'u',tenantId:'t',username:'me@example.com'}});const auth={initialize:async()=>{},getAccount:()=>account,signIn,signOut:async()=>{account=null},redirectUri:'https://user.github.io/repo/auth-callback.html',settings:{tenantId:'t',clientId:'c'}};
 render(<MicrosoftSignIn auth={auth as never}><div>Transfer UI</div></MicrosoftSignIn>);await screen.findByRole('button',{name:'Đăng nhập Microsoft'});expect(screen.queryByText('Transfer UI')).toBeNull();expect(screen.getByDisplayValue(auth.redirectUri)).toBeTruthy();expect(signIn).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Đăng nhập Microsoft'}));await screen.findByText('Transfer UI');expect(screen.getByText('me@example.com')).toBeTruthy();fireEvent.click(screen.getByRole('button',{name:'Đăng xuất'}));await waitFor(()=>expect(screen.queryByText('Transfer UI')).toBeNull());
});
it('shows explicit popup recovery after a pending interaction',async()=>{
 const signIn=vi.fn().mockRejectedValueOnce(Object.assign(new Error('Pending popup'),{code:'AUTH_POPUP_PENDING'})).mockResolvedValueOnce(undefined);const auth={initialize:async()=>{},getAccount:()=>null,signIn,redirectUri:'https://example.com/auth-callback.html',settings:{tenantId:'t',clientId:'c'}};
 render(<MicrosoftSignIn auth={auth as never}><div>App</div></MicrosoftSignIn>);fireEvent.click(await screen.findByRole('button',{name:'Đăng nhập Microsoft'}));fireEvent.click(await screen.findByRole('button',{name:'Hủy lượt đăng nhập cũ và thử lại'}));await waitFor(()=>expect(signIn).toHaveBeenLastCalledWith('dev',true));
});
