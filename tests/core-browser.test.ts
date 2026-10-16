import {it,expect} from 'vitest';
import {sha256,fromBase64,toBase64} from '../src/core/binary';
import {DataverseClient} from '../src/core/microsoft/client';
it('uses browser crypto and binary primitives without Buffer',async()=>{
 expect(await sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');expect(fromBase64(toBase64(new Uint8Array([0,127,255])))).toEqual(new Uint8Array([0,127,255]));
});
it('rejects foreign paging before requesting delegated credentials',async()=>{
 let tokens=0;const client=new DataverseClient(async()=>{tokens++;return 'token'});
 await expect(client.request('dev','https://foreign.invalid/api/data/v9.2/tables')).rejects.toMatchObject({code:'UNSAFE_URL'});expect(tokens).toBe(0);
});
