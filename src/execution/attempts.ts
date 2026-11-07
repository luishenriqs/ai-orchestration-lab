import fs from 'node:fs';
import path from 'node:path';
import { canonicalHash } from '../contracts/integrity.js';
import { validateExecutionAttempt } from '../contracts/validator.js';
import type { ExecutionAttempt, ExecutionAttemptState, ProcessIdentity, TerminationReason } from '../contracts/types.js';
import { identifier, safePath, writeNew, atomicJson, readJson } from './host.js';
interface Event {sequence:number;previous:string|null;attempt:ExecutionAttempt;sha256:string}
const transitions: Record<ExecutionAttemptState,readonly ExecutionAttemptState[]>={CREATED:['RUNNING','BLOCKED'],RUNNING:['COMPLETED','FAILED','INTERRUPTED'],COMPLETED:[],FAILED:[],INTERRUPTED:[],BLOCKED:[]};
export function assertAttemptConsistent(a: ExecutionAttempt): void {
  if(!validateExecutionAttempt(a).valid) throw Error('INVALID_ATTEMPT');
  const terminal=!['CREATED','RUNNING'].includes(a.state);
  if(terminal !== (a.finished_at!==null && a.termination_reason!==null)) throw Error('INCONSISTENT_TERMINATION');
  if(!terminal && (a.finished_at!==null || a.termination_reason!==null)) throw Error('PREMATURE_TERMINATION');
  if((a.state==='CREATED'||a.state==='BLOCKED') && (a.started_at!==null||a.process_identity!==null)) throw Error('PREMATURE_START');
  if(a.state!=='CREATED' && a.state!=='BLOCKED' && (!a.started_at||!a.process_identity)) throw Error('MISSING_PROCESS');
  if(a.state==='COMPLETED' && a.termination_reason!=='NORMAL') throw Error('INVALID_NORMAL_EXIT');
  if(a.state==='FAILED' && ['NORMAL','INTERRUPTED'].includes(a.termination_reason!)) throw Error('INVALID_FAILURE_REASON');
  if(a.state==='INTERRUPTED' && a.termination_reason!=='INTERRUPTED') throw Error('INVALID_INTERRUPTION_REASON');
  if(a.finished_at && a.started_at && Date.parse(a.finished_at)<Date.parse(a.started_at)) throw Error('INVALID_TIME_ORDER');
}
export class AttemptStore {
  readonly root: string;
  constructor(root: string) {fs.mkdirSync(root,{recursive:true});this.root=fs.realpathSync(root);}
  private dir(execution:string,attempt:string):string {return safePath(this.root,`${identifier(execution)}/attempts/${identifier(attempt)}`,false);}
  create(attempt:ExecutionAttempt):void {
    assertAttemptConsistent(attempt);if(attempt.state!=='CREATED') throw Error('INITIAL_STATE_REQUIRED');
    const dir=this.dir(attempt.execution_id,attempt.attempt_id);fs.mkdirSync(path.dirname(dir),{recursive:true});fs.mkdirSync(dir);
    fs.mkdirSync(path.join(dir,'events'));this.append(dir,attempt,0,null);
  }
  private append(dir:string,attempt:ExecutionAttempt,sequence:number,previous:string|null):void {
    const body={sequence,previous,attempt};writeNew(path.join(dir,'events',String(sequence).padStart(6,'0')+'.json'),{...body,sha256:canonicalHash(body)});
    atomicJson(path.join(dir,'attempt.json'),attempt);
  }
  private events(execution:string,attempt:string):Event[] {
    const dir=this.dir(execution,attempt);const entries=fs.readdirSync(safePath(dir,'events')).sort();
    if(!entries.length) throw Error('EMPTY_JOURNAL');
    let previous:string|null=null;let prior:ExecutionAttempt|null=null;
    return entries.map((name,sequence)=>{
      if(name!==String(sequence).padStart(6,'0')+'.json') throw Error('JOURNAL_SEQUENCE');
      const event=readJson(safePath(dir,'events/'+name)) as Event;
      if(event.sequence!==sequence||event.previous!==previous||event.sha256!==canonicalHash({sequence:event.sequence,previous:event.previous,attempt:event.attempt})) throw Error('JOURNAL_INTEGRITY');
      assertAttemptConsistent(event.attempt);
      if(event.attempt.execution_id!==execution||event.attempt.attempt_id!==attempt) throw Error('JOURNAL_IDENTITY');
      if(!prior && event.attempt.state!=='CREATED') throw Error('INITIAL_STATE_REQUIRED');
      if(prior) {
        if(!transitions[prior.state].includes(event.attempt.state)) throw Error('JOURNAL_TRANSITION');
        for(const key of ['execution_id','attempt_id','approval_id','approved_contract_sha256','executor','base_commit','workspace_root'] as const) if(prior[key]!==event.attempt[key]) throw Error('JOURNAL_BINDING');
      }
      previous=event.sha256;prior=event.attempt;return event;
    });
  }
  load(execution:string,attempt:string):ExecutionAttempt {
    const events=this.events(execution,attempt);const result=events[events.length-1]!.attempt;
    atomicJson(path.join(this.dir(execution,attempt),'attempt.json'),result);return result;
  }
  transition(execution:string,attempt:string,state:ExecutionAttemptState,reason:TerminationReason|null=null,process:ProcessIdentity|null=null):ExecutionAttempt {
    const dir=this.dir(execution,attempt);const lock=path.join(dir,'.transition-lock');const fd=fs.openSync(lock,'wx');
    try {
      const events=this.events(execution,attempt),last=events[events.length-1]!;const a=last.attempt;
      if(!transitions[a.state].includes(state)) throw Error('INVALID_TRANSITION');
      const now=new Date().toISOString();
      const next:ExecutionAttempt={...a,state,started_at:state==='RUNNING'?now:a.started_at,process_identity:state==='RUNNING'?process:a.process_identity,finished_at:state==='RUNNING'?null:now,termination_reason:reason};
      assertAttemptConsistent(next);this.append(dir,next,events.length,last.sha256);return next;
    } finally {fs.closeSync(fd);fs.unlinkSync(lock);}
  }
  reconcile(execution:string,attempt:string):ExecutionAttempt {
    const a=this.load(execution,attempt);
    if(a.state==='RUNNING' && (!a.process_identity||!processAlive(a.process_identity))) return this.transition(execution,attempt,'INTERRUPTED','INTERRUPTED');
    return a;
  }
}
export function processIdentity(pid:number):ProcessIdentity|null {
  if(!Number.isInteger(pid)||pid<1) throw Error('INVALID_PID');
  try {
    const stat=fs.readFileSync(`/proc/${pid}/stat`,'utf8');const fields=stat.slice(stat.lastIndexOf(')')+2).split(' ');
    if(fields[0]==='Z'||fields[0]==='X') return null;
    const boot=fs.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();
    return {pid,process_start_token:boot+':'+fields[19]!,executable:fs.readlinkSync(`/proc/${pid}/exe`)};
  } catch(error) {if(['ENOENT','ESRCH'].includes((error as NodeJS.ErrnoException).code??'')) return null;throw error;}
}
export function processAlive(identity:ProcessIdentity):boolean {
  const actual=processIdentity(identity.pid);return actual!==null && actual.process_start_token===identity.process_start_token && (!identity.executable||identity.executable===actual.executable);
}
