import type { WorkflowLimits } from './types.js';
import type { LedgerEvent, WorkflowRecord, AgentInvocationRecord } from './types.js';
export const P2_GLOBAL_LIMITS:WorkflowLimits=Object.freeze({workflow_active_ms:7_200_000,invocation_ms:1_200_000,invocations:30,review_cycles:5,correction_cycles:5,output_bytes_per_stream:10*1024*1024,message_bytes:1024*1024,operational_retries:0});
const fields=(Object.keys(P2_GLOBAL_LIMITS) as (keyof WorkflowLimits)[]);
export function resolveEffectiveLimits(task:WorkflowLimits,global:WorkflowLimits=P2_GLOBAL_LIMITS):WorkflowLimits {
  for(const key of fields){const t=task[key],g=global[key];if(!Number.isSafeInteger(t)||t<0||!Number.isSafeInteger(g)||g<0)throw Error('INVALID_LIMIT:'+key);}
  if(task.operational_retries!==0||global.operational_retries!==0)throw Error('INVALID_LIMIT:operational_retries');
  for(const key of ['workflow_active_ms','invocation_ms','invocations','output_bytes_per_stream','message_bytes'] as const)if(task[key]===0||global[key]===0)throw Error('INVALID_LIMIT:'+key);
  return Object.freeze({workflow_active_ms:Math.min(task.workflow_active_ms,global.workflow_active_ms),invocation_ms:Math.min(task.invocation_ms,global.invocation_ms),invocations:Math.min(task.invocations,global.invocations),review_cycles:Math.min(task.review_cycles,global.review_cycles),correction_cycles:Math.min(task.correction_cycles,global.correction_cycles),output_bytes_per_stream:Math.min(task.output_bytes_per_stream,global.output_bytes_per_stream),message_bytes:Math.min(task.message_bytes,global.message_bytes),operational_retries:0});
}
export function pauseAwareElapsed(startedAt:number,now:number,approvalWaitMs:number):number {if(!Number.isFinite(startedAt)||!Number.isFinite(now)||!Number.isFinite(approvalWaitMs)||now<startedAt||approvalWaitMs<0)throw Error('INVALID_CLOCK_VALUE');return Math.max(0,now-startedAt-approvalWaitMs);}
export function measureWorkflowActiveMs(events:readonly LedgerEvent[],now:string):number {
  let state:WorkflowRecord['state']='CREATED',startedAt:number|null=null,total=0;const end=Date.parse(now);if(!Number.isFinite(end))throw Error('INVALID_CLOCK_VALUE');
  for(const event of events){const at=Date.parse(event.observed_at);if(!Number.isFinite(at))throw Error('INVALID_CLOCK_VALUE');let next:WorkflowRecord['state']=state;
    if(event.event_type==='WORKFLOW_TRANSITION')next=(event.payload as {next_state:WorkflowRecord['state']}).next_state;
    else if(event.event_type==='AUTHORIZATION_REVOKED')next=state==='ACTIVE'?'CANCEL_REQUESTED':'BLOCKED';
    if(next!==state){if(state==='ACTIVE'||state==='BLOCKED'||state==='CANCEL_REQUESTED'){if(startedAt!==null)total+=Math.max(0,at-startedAt);startedAt=null;}
      state=next;if(state==='ACTIVE'||state==='BLOCKED'||state==='CANCEL_REQUESTED')startedAt=at;
    }
  }
  if(startedAt!==null)total+=Math.max(0,end-startedAt);
  return Math.floor(total);
}
export function measureInvocationMs(invocations:readonly AgentInvocationRecord[],now:string):number {
  const end=Date.parse(now);if(!Number.isFinite(end))throw Error('INVALID_CLOCK_VALUE');let max=0;
  for(const invocation of invocations){if(invocation.started_at&&invocation.finished_at===null){const started=Date.parse(invocation.started_at);if(!Number.isFinite(started)||end<started)throw Error('INVALID_INVOCATION_TIME');max=Math.max(max,end-started);}}
  return Math.floor(max);
}
export function assertRuntimeBudgets(workflowMs:number,invocationMs:number,limits:WorkflowLimits):void {assertWithinDuration(workflowMs,limits.workflow_active_ms);assertWithinDuration(invocationMs,limits.invocation_ms);}
export function assertWithinDuration(elapsedMs:number,limitMs:number):void {if(!Number.isSafeInteger(elapsedMs)||!Number.isSafeInteger(limitMs)||elapsedMs<0||limitMs<1)throw Error('INVALID_DURATION');if(elapsedMs>=limitMs)throw Error('DURATION_LIMIT_EXCEEDED');}
export function assertOutputWithinLimit(bytes:number,limits:WorkflowLimits):void {if(!Number.isSafeInteger(bytes)||bytes<0||bytes>limits.output_bytes_per_stream)throw Error('OUTPUT_LIMIT_EXCEEDED');}
export type UsageValue={readonly status:'KNOWN';readonly value:number}|{readonly status:'UNKNOWN'};
export function normalizeUsage(value:number|null|undefined):UsageValue{return Number.isFinite(value)&&value!>=0?Object.freeze({status:'KNOWN',value:value!}):Object.freeze({status:'UNKNOWN'});}
