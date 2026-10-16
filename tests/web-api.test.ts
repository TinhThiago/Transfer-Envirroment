import {it,expect,vi,afterEach} from 'vitest';
import {api,apiUrl} from '../src/web/api';
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals()});
it('keeps local API paths at the root and uses the remote backend for Pages',async()=>{
 vi.stubEnv('VITE_API_BASE_URL','');expect(apiUrl('/api/jobs')).toBe('/api/jobs');
 vi.stubEnv('VITE_API_BASE_URL','https://backend.example.com/');expect(apiUrl('/api/jobs/id/solution')).toBe('https://backend.example.com/api/jobs/id/solution');
 const fetcher=vi.fn(async(_input:RequestInfo|URL,_init?:RequestInit)=>Response.json({jobs:[]}));vi.stubGlobal('fetch',fetcher);await api('/api/jobs');expect(fetcher.mock.calls[0][0]).toBe('https://backend.example.com/api/jobs');
});
