export async function sha256(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),b=>b.toString(16).padStart(2,'0')).join('');}
export const randomUUID=()=>crypto.randomUUID();
export function fromBase64(value:string){return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
export function toBase64(value:Uint8Array){let binary='';for(let i=0;i<value.length;i+=32768)binary+=String.fromCharCode(...value.subarray(i,i+32768));return btoa(binary);}
export function canonicalJson(value:unknown):string{if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).sort().filter(key=>(value as Record<string,unknown>)[key]!==undefined).map(key=>JSON.stringify(key)+':'+canonicalJson((value as Record<string,unknown>)[key])).join(',')+'}';return JSON.stringify(value)??'null';}
