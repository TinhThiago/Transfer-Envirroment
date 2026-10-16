import {it,expect} from 'vitest';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {readLocalSecret,saveLocalSecret} from '../src/server/local-secret';
it.skipIf(process.platform!=='win32')('restores a secret after restart without storing plaintext',()=>{
 const directory=mkdtempSync(join(tmpdir(),'ph-secret-'));const path=join(directory,'secret.dpapi');
 try{expect(readLocalSecret(path)).toBe('');saveLocalSecret('fixture-only-secret',path);expect(readFileSync(path,'utf8')).not.toContain('fixture-only-secret');expect(readLocalSecret(path)).toBe('fixture-only-secret');}finally{rmSync(directory,{recursive:true,force:true});}
},20000);
