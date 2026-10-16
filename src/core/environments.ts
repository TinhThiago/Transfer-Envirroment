export const environments = {
  dev:{id:'dev',name:'Development',url:'https://phuochungdev.crm5.dynamics.com'},
  production:{id:'production',name:'Production',url:'https://phuochung1.crm5.dynamics.com'},
} as const;
export type EnvironmentId=keyof typeof environments;
