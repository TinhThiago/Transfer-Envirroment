import {it,expect,vi} from 'vitest';
import {build} from 'vite';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
it('builds independent Pages assets and the MSAL callback without server modules or a backend URL',async()=>{
 const output=mkdtempSync(join(tmpdir(),'ph-pages-build-'));const modules:string[]=[];
 vi.stubEnv('VITE_RUNTIME_MODE','browser');vi.stubEnv('VITE_BASE_PATH','/Transfer-Enviroment/');vi.stubEnv('VITE_BUILD_OUT_DIR',output);vi.stubEnv('VITE_API_BASE_URL','');
 try{
  await build({logLevel:'silent',plugins:[{name:'audit-browser-graph',generateBundle(){modules.push(...this.getModuleIds());}}]});
  expect(modules.filter(id=>/[/\\]src[/\\]server[/\\]|^node:|__vite-browser-external/.test(id))).toEqual([]);
  expect(readFileSync(join(output,'index.html'),'utf8')).toContain('/Transfer-Enviroment/assets/');expect(readFileSync(join(output,'auth-callback.html'),'utf8')).toContain('/Transfer-Enviroment/assets/');
  const workflow=readFileSync('.github/workflows/pages.yml','utf8');expect(workflow).toContain('VITE_RUNTIME_MODE: browser');expect(workflow).not.toContain('Validate backend URL');expect(workflow).not.toContain('vars.VITE_API_BASE_URL');
 }finally{vi.unstubAllEnvs();rmSync(output,{recursive:true,force:true});}
},60000);
