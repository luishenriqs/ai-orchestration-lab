import { spawn } from 'node:child_process';
import type { ProcessIdentity, TerminationReason } from '../contracts/types.js';
import { processIdentity } from './attempts.js';
export interface ProcessObservation {readonly exit_code:number|null;readonly signal:NodeJS.Signals|null;readonly stdout:string;readonly stderr:string;readonly started_at:string;readonly duration_ms:number;readonly termination_reason:TerminationReason;readonly process_identity:ProcessIdentity|null;readonly truncated:boolean}
export interface ProcessOptions {readonly cwd:string;readonly timeout_ms?:number;readonly interrupt_after_ms?:number;readonly onStart?:(identity:ProcessIdentity)=>void}
export async function runProcess(executable:string,args:readonly string[],options:ProcessOptions):Promise<ProcessObservation>{
  const start=Date.now(),started_at=new Date(start).toISOString();const limit=1024*1024;
  return new Promise((resolve,reject)=>{
    let identity:ProcessIdentity|null=null;let reason:TerminationReason|null=null;let truncated=false;let stdout:Buffer=Buffer.alloc(0),stderr:Buffer=Buffer.alloc(0);let timer:NodeJS.Timeout|undefined,interrupt:NodeJS.Timeout|undefined;let startError:unknown;
    const child=spawn(executable,[...args],{cwd:options.cwd,env:{PATH:'/usr/bin:/bin',LANG:'C',LC_ALL:'C'},shell:false,detached:true,stdio:['ignore','pipe','pipe']});
    function kill():void {if(child.pid) try {process.kill(-child.pid,'SIGKILL');}catch(error){if((error as NodeJS.ErrnoException).code!=='ESRCH') startError=error;}}
    function capture(current:Buffer,chunk:Buffer):Buffer {if(current.length+chunk.length>limit) truncated=true;return Buffer.concat([current,chunk.subarray(0,Math.max(0,limit-current.length))]);}
    child.stdout.on('data',(chunk:Buffer)=>{stdout=capture(stdout,chunk);});child.stderr.on('data',(chunk:Buffer)=>{stderr=capture(stderr,chunk);});
    child.on('spawn',()=>{
      try {identity=processIdentity(child.pid!);if(!identity) throw Error('PROCESS_IDENTITY_UNAVAILABLE');options.onStart?.(identity);}catch(error){startError=error;kill();}
      timer=setTimeout(()=>{reason='TIMEOUT';kill();},options.timeout_ms??10000);
      if(options.interrupt_after_ms!==undefined) interrupt=setTimeout(()=>{reason='INTERRUPTED';kill();},options.interrupt_after_ms);
    });
    child.on('error',(error)=>{stderr=capture(stderr,Buffer.from(error.message));reason='PROCESS_FAILURE';});
    child.on('close',(code,signal)=>{
      if(timer) clearTimeout(timer);if(interrupt) clearTimeout(interrupt);
      // Kill descendants left behind even when the direct child exited normally.
      kill();
      if(startError){reject(startError);return;}
      resolve(Object.freeze({exit_code:code,signal,stdout:stdout.toString('utf8'),stderr:stderr.toString('utf8'),started_at,duration_ms:Date.now()-start,termination_reason:reason??(code===0?'NORMAL':'PROCESS_FAILURE'),process_identity:identity,truncated}));
    });
  });
}
