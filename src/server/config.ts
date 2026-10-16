export const environments = {
  dev:{id:'dev',name:'Development',url:'https://phuochungdev.crm5.dynamics.com'},
  production:{id:'production',name:'Production',url:'https://phuochung1.crm5.dynamics.com'},
} as const;
export type EnvironmentId=keyof typeof environments;
export function loadConfig(env:NodeJS.ProcessEnv=process.env){
  return {tenant:env.MICROSOFT_TENANT_ID||'6ab8e229-ae5c-482e-b463-5b926f94e34c',clientId:env.MICROSOFT_CLIENT_ID||'960d5154-a132-48f9-b26c-dcf97ee1eeff',secret:env.MICROSOFT_CLIENT_SECRET||'',configured:!!env.MICROSOFT_CLIENT_SECRET,port:Number(env.PORT||3100)};
}
export type Config=ReturnType<typeof loadConfig>;
