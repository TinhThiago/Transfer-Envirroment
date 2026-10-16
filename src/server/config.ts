export const environments = {
  dev:{id:'dev',name:'Development',url:'https://phuochungdev.crm5.dynamics.com'},
  production:{id:'production',name:'Production',url:'https://phuochung1.crm5.dynamics.com'},
} as const;
export type EnvironmentId=keyof typeof environments;
export function loadConfig(env:NodeJS.ProcessEnv=process.env){
  const list=(value:string|undefined)=>(value||'').split(',').map(s=>s.trim()).filter(Boolean);const port=Number(env.PORT||3100);
  return {tenant:env.MICROSOFT_TENANT_ID||'6ab8e229-ae5c-482e-b463-5b926f94e34c',clientId:env.MICROSOFT_CLIENT_ID||'960d5154-a132-48f9-b26c-dcf97ee1eeff',secret:env.MICROSOFT_CLIENT_SECRET||'',configured:!!env.MICROSOFT_CLIENT_SECRET,port,host:env.HOST||'127.0.0.1',databasePath:env.DATABASE_PATH||'.runtime/transfer.db',allowedHosts:['localhost','127.0.0.1','[::1]',...list(env.ALLOWED_HOSTS)],corsOrigins:[`http://127.0.0.1:${port}`,`http://localhost:${port}`,'http://127.0.0.1:5173','http://localhost:5173',...list(env.CORS_ORIGINS)]};
}
export type Config=ReturnType<typeof loadConfig>;
