import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/server/config';
import { MicrosoftClient } from '../src/server/microsoft/http';

describe('configuration and Microsoft boundary', () => {
  it('does not claim connected without a secret', () => {
    expect(loadConfig({}).configured).toBe(false);
    expect(loadConfig({MICROSOFT_CLIENT_SECRET:'test'}).secret).toBe('test');
  });
  it('rejects foreign nextLink before transmitting credentials', async () => {
    const client = new MicrosoftClient(loadConfig({MICROSOFT_CLIENT_SECRET:'test'}));
    await expect(client.request('dev','https://attacker.invalid/api/data/v9.2/tables')).rejects.toMatchObject({code:'UNSAFE_URL'});
  });
  it('separates authentication failures from permission failures without leaking payload', async () => {
    const config=loadConfig({MICROSOFT_CLIENT_SECRET:'test'});
    const fetcher:typeof fetch=async input => String(input).includes('oauth2') ? new Response(JSON.stringify({access_token:'private-token',expires_in:3600})) : new Response('secret response',{status:403});
    const client=new MicrosoftClient(config,fetcher);
    await expect(client.request('dev','WhoAmI')).rejects.toMatchObject({code:'FORBIDDEN',message:expect.not.stringContaining('secret response')});
  });
  it('caches tokens independently for each environment', async () => {
    const scopes:string[]=[];
    const fetcher:typeof fetch=async (input,init) => {
      if(String(input).includes('oauth2')){scopes.push(String(init?.body));return Response.json({access_token:'token',expires_in:3600});}
      return Response.json({UserId:'user'});
    };
    const client=new MicrosoftClient(loadConfig({MICROSOFT_CLIENT_SECRET:'test'}),fetcher);
    await client.request('dev','WhoAmI');await client.request('dev','WhoAmI');await client.request('production','WhoAmI');
    expect(scopes).toHaveLength(2);expect(scopes[0]).toContain('phuochungdev');expect(scopes[1]).toContain('phuochung1');
  });
  it('honors throttling and never retries non-idempotent POST',async()=>{
    let reads=0,writes=0;const delays:number[]=[];
    const fetcher:typeof fetch=async(input,init)=>{
      if(String(input).includes('oauth2'))return Response.json({access_token:'token',expires_in:3600});
      if(init?.method==='POST'){writes++;return new Response('',{status:429,headers:{'Retry-After':'2'}});}
      return ++reads===1?new Response('',{status:429,headers:{'Retry-After':'2'}}):Response.json({value:[]});
    };
    const client=new MicrosoftClient(loadConfig({MICROSOFT_CLIENT_SECRET:'test'}),fetcher,async ms=>{delays.push(ms)});
    await client.request('dev','EntityDefinitions');expect(delays).toEqual([2000]);
    await expect(client.request('dev','ImportSolution',{method:'POST',body:{}})).rejects.toMatchObject({code:'THROTTLED'});expect(writes).toBe(1);
  });
});
