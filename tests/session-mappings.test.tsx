// @vitest-environment jsdom
import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup,waitFor} from '@testing-library/react';
import {SessionMappings} from '../src/web/components/SessionMappings';
import {api} from '../src/web/api';
vi.mock('../src/web/api',()=>({api:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('reenters approved mappings in session without automatically retrying the transfer',async()=>{
 vi.mocked(api).mockResolvedValueOnce({flowPreflight:{connections:[{logicalName:'ref',displayName:'Dataverse'}],variables:[{logicalName:'url',displayName:'Endpoint'}]}}).mockResolvedValueOnce({restored:true});
 const saved=vi.fn();render(<SessionMappings job={{id:'job',planId:'plan'} as never} onClose={()=>{}} onSaved={saved}/>);
 fireEvent.change(await screen.findByLabelText('Dataverse'),{target:{value:'connection-id'}});fireEvent.change(screen.getByLabelText('Endpoint'),{target:{value:'https://target.example'}});fireEvent.click(screen.getByRole('button',{name:'Khôi phục cấu hình'}));
 await waitFor(()=>expect(saved).toHaveBeenCalledOnce());expect(api).toHaveBeenLastCalledWith('/api/jobs/job/session-mappings',{connections:{ref:'connection-id'},variables:{url:'https://target.example'}});expect(api).toHaveBeenCalledTimes(2);
});
