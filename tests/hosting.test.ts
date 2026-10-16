import {it,expect} from 'vitest';
import {buildApp} from '../src/server/app';
import {loadConfig} from '../src/server/config';
import {JobStore} from '../src/server/jobs/store';
it('allows only configured Pages origins and backend hosts, including JSON preflight',async()=>{
 const store=new JobStore(':memory:');const app=buildApp({config:loadConfig({ALLOWED_HOSTS:'api.example.com',CORS_ORIGINS:'https://someone.github.io'}),store});
 const headers={host:'api.example.com',origin:'https://someone.github.io'};
 const preflight=await app.inject({method:'OPTIONS',url:'/api/jobs',headers:{...headers,'access-control-request-method':'POST','access-control-request-headers':'content-type'}});
 expect(preflight.statusCode).toBe(204);expect(preflight.headers['access-control-allow-origin']).toBe(headers.origin);
 const response=await app.inject({url:'/api/jobs',headers});expect(response.statusCode).toBe(200);expect(response.headers['access-control-allow-origin']).toBe(headers.origin);
 expect((await app.inject({url:'/api/jobs',headers:{...headers,origin:'https://other.github.io'}})).statusCode).toBe(403);
 expect((await app.inject({url:'/api/jobs',headers:{...headers,host:'unexpected.example.com'}})).statusCode).toBe(403);await app.close();store.close();
});
