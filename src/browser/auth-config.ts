export function authSettings(origin=window.location.origin,base=import.meta.env.BASE_URL){
 return {tenantId:import.meta.env.VITE_MICROSOFT_TENANT_ID||'6ab8e229-ae5c-482e-b463-5b926f94e34c',clientId:import.meta.env.VITE_MICROSOFT_CLIENT_ID||'7c279345-da37-45cc-ab63-70dba694349e',redirectUri:new URL(`${base}auth-callback.html`,origin).href};
}
