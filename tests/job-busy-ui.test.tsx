// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,waitFor,cleanup} from '@testing-library/react';
import {JobProgress} from '../src/web/components/JobProgress';
import {api} from '../src/web/api';
vi.mock('../src/web/api',()=>({api:vi.fn(async()=>({})),apiUrl:(p:string)=>p}));vi.mock('../src/web/runtime',()=>({openSolution:vi.fn()}));afterEach(()=>{cleanup();vi.clearAllMocks()});
it('continues a busy job only when the user clicks, and prevents duplicate clicks',async()=>{
 let finish:()=>void=()=>{};vi.mocked(api).mockImplementationOnce(()=>new Promise(resolve=>{finish=()=>resolve({})}));render(<JobProgress job={{id:'job',status:'awaiting-input',step:'Đang chờ tiến trình khác',error:{code:'ENVIRONMENT_BUSY',message:'busy'},counts:{},warnings:[],importId:'i',asyncId:'a'} as any} onError={()=>{}}/>);expect(api).not.toHaveBeenCalled();const button=screen.getByRole('button',{name:'Tiếp tục chuyển đổi'});fireEvent.click(button);expect(api).toHaveBeenCalledWith('/api/jobs/job/resume-import',{});expect((button as HTMLButtonElement).disabled).toBe(true);finish();await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
});
