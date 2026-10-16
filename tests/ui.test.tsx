// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor,act} from '@testing-library/react';
import App from '../src/web/App';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
const id='11111111-1111-4111-8111-111111111111';
function stub(){vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>{const path=String(input);return Response.json(path.includes('/environments')?{configured:true,environments:[{id:'dev',connected:true},{id:'production',connected:true}]}:path==='/api/jobs'?{jobs:[]}:path.includes('shared-tables')?{items:[{id,displayName:'Bảng chung',logicalName:'ph_shared'}]}:{items:[{id,displayName:'Đơn hàng',logicalName:'ph_order',kind:'table',selectable:true,managed:false,custom:true}],total:1,eligible:1});});}
it('defaults data copy off and resets selection when switching direction',async()=>{
 stub();render(<App/>);await screen.findByText('Đơn hàng');const data=screen.getByRole('checkbox',{name:/Chuyển data/}) as HTMLInputElement;expect(data.checked).toBe(false);
 fireEvent.click(screen.getByRole('checkbox',{name:'Chọn Đơn hàng'}));expect(screen.getByText('1 đã chọn')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Đổi chiều chuyển'}));await waitFor(()=>expect(screen.getByText('0 đã chọn')).toBeTruthy());
});
it('only loads columns after choosing one shared table and supports all three pages',async()=>{
 stub();render(<App/>);fireEvent.click(screen.getByRole('button',{name:'Column'}));await screen.findByRole('combobox',{name:'Bảng cần chuyển column'});expect(screen.getByText('Chọn một bảng để xem column')).toBeTruthy();
 fireEvent.click(screen.getByRole('button',{name:'Power Automate'}));expect(screen.getByRole('heading',{name:'Chuyển đổi Cloud flow'})).toBeTruthy();
});
it('shows API failures without substituting demonstration records',async()=>{
 vi.stubGlobal('fetch',async(input:RequestInfo|URL)=>String(input).includes('catalog')?Response.json({error:{code:'FORBIDDEN',message:'Thiếu quyền đọc metadata'}},{status:403}):Response.json({configured:false,environments:[],jobs:[]}));
 render(<App/>);await screen.findByText('Thiếu quyền đọc metadata');expect(screen.queryByText('Đơn hàng')).toBeNull();expect(screen.getByRole('button',{name:'Kiểm tra chuyển đổi'}).hasAttribute('disabled')).toBe(true);
});
it('discards an old plan response after navigating to another page',async()=>{
 let finish:(value:Response)=>void=()=>{};stub();const previous=fetch;
 vi.stubGlobal('fetch',async(input:RequestInfo|URL,init?:RequestInit)=>String(input)==='/api/plans'?new Promise<Response>(resolve=>{finish=resolve}):previous(input,init));
 render(<App/>);await screen.findByText('Đơn hàng');fireEvent.click(screen.getByRole('checkbox',{name:'Chọn Đơn hàng'}));fireEvent.click(screen.getByRole('button',{name:'Kiểm tra chuyển đổi'}));
 fireEvent.click(screen.getByRole('button',{name:'Column'}));
 await act(async()=>{finish(Response.json({id:'old',hash:'h',request:{source:'dev',target:'production',kind:'table',ids:[id],includeData:false},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],blockers:[],warnings:[]}))});
 expect(screen.queryByText('Kết quả kiểm tra')).toBeNull();
});
