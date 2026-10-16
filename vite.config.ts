import { defineConfig } from 'vitest/config';
import {loadEnv} from 'vite';
import {resolve} from 'node:path';
export default defineConfig(({command,mode})=>{
 const env=loadEnv(mode,process.cwd(),'VITE_');const path=(env.VITE_BASE_PATH||'/').replace(/^\/+|\/+$/g,'');
 return {base:command==='serve'||!path?'/':`/${path}/`,server:{port:5173,proxy:{'/api':'http://127.0.0.1:3100'}},build:{outDir:env.VITE_BUILD_OUT_DIR||'dist',rollupOptions:{input:{main:resolve('index.html'),callback:resolve('auth-callback.html')}}},test:{include:['tests/**/*.test.ts','tests/**/*.test.tsx']}};
});
