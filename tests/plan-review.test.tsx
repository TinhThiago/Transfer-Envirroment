// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {PlanReview} from '../src/web/components/PlanReview';
afterEach(()=>{cleanup();vi.unstubAllGlobals()});
it('saves configure-later without requiring connection input and shows the pending items',async()=>{
 const plan={id:'p',request:{source:'dev',target:'production',kind:'flow'},components:[],dependencies:[],acceptedIds:[],rejectedIds:[],warnings:[],blockers:['Điền đủ connection và environment variable cho môi trường đích.'],flowPreflight:{connections:[{id:'c',logicalName:'ph_ref',displayName:'Dataverse'}],variables:[{id:'v',logicalName:'ph_url',displayName:'URL'}]}} as never;
 const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>Response.json(plan));vi.stubGlobal('fetch',fetcher);const update=vi.fn();render(<PlanReview plan={plan} busy={false} onUpdate={update} onTransfer={()=>{}}/>);
 fireEvent.click(screen.getByRole('checkbox',{name:'Cấu hình connection sau'}));fireEvent.click(screen.getByRole('button',{name:'Lưu và kiểm tra cấu hình'}));await waitFor(()=>expect(update).toHaveBeenCalled());expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({configureLater:true,connections:{},variables:{}});expect(screen.getByText(/Flow được chuyển ở chế độ Off/)).toBeTruthy();
});
