import {buildApp} from './app';
import {loadConfig} from './config';
import {JobStore} from './jobs/store';
import type {Worker} from './jobs/worker';
import {readLocalSecret,saveLocalSecret} from './local-secret';
// Optional hidden stdin input keeps the app secret out of command arguments and files.
if(process.argv.includes('--secret-stdin')){
 process.stdout.write('Ready for secret on stdin (input hidden).\n');
 if(process.stdin.isTTY)process.stdin.setRawMode(true);
 const secret=await new Promise<string>(resolve=>{let buffer='';const read=(chunk:Buffer)=>{const value=chunk.toString();if(value.includes('\u0003'))process.exit(0);buffer+=value;if(/[\r\n]/.test(buffer)){process.stdin.off('data',read);process.stdin.pause();resolve(buffer.split(/[\r\n]/)[0]);}};process.stdin.on('data',read);process.stdin.resume();});
 if(process.stdin.isTTY)process.stdin.setRawMode(false);process.env.MICROSOFT_CLIENT_SECRET=secret;
}
if(process.argv.includes('--save-secret')&&process.env.MICROSOFT_CLIENT_SECRET)saveLocalSecret(process.env.MICROSOFT_CLIENT_SECRET);
// Restore the current Windows user's encrypted credential on ordinary starts/reloads.
if(!process.env.MICROSOFT_CLIENT_SECRET)process.env.MICROSOFT_CLIENT_SECRET=readLocalSecret();
const config=loadConfig();const store=new JobStore(config.databasePath);const app=buildApp({config,store});
await app.listen({host:config.host,port:config.port});console.log(`PH Environment Transfer: http://${config.host}:${config.port}`);
const worker=(app as unknown as {transferWorker:Worker}).transferWorker;const interval=setInterval(()=>{void worker.tick().catch(()=>console.error('Worker tick failed; inspect job state.'));},3000);
const close=async()=>{clearInterval(interval);await app.close();store.close();process.exit(0);};process.on('SIGINT',()=>{void close()});process.on('SIGTERM',()=>{void close()});
