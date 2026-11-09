import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalHash } from '../contracts/integrity.js';
import { processAlive, processIdentity } from '../execution/attempts.js';
import { transitionWorkflow } from './machine.js';
import { transitionInvocation } from './machine.js';
import { normalizeAgentMessage, verifyNormalizedMessage } from './protocol.js';
import { createEffectIntent, reconcileEffect } from './effects.js';
import { authorizeWorkflow, checkAuthorization, createAuthorizationProof, evaluateIndependentReview, evaluateSandboxProof, type AuthorizationBinding } from './governance.js';
import { assertRuntimeBudgets, measureInvocationMs, measureWorkflowActiveMs, resolveEffectiveLimits } from './limits.js';
import type { TrustedApproval } from '../governance/approval.js';
import type { ApprovalRecord, TaskContract } from '../contracts/types.js';
import { createP2Validator } from './validation.js';
import { LEDGER_GENESIS, type AgentIdentity, type AgentInvocationRecord, type AgentMessageInput, type EffectRecord, type LedgerEvent, type NormalizedAgentMessage, type SandboxValidationRecord, type WorkflowAuthorizationRecord, type WorkflowLimits, type WorkflowRecord } from './types.js';

function safeId(value:string):string {if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))throw Error('INVALID_WORKFLOW_ID');return value;}
function readEvent(file:string):LedgerEvent {return JSON.parse(fs.readFileSync(file,'utf8')) as LedgerEvent;}
export class WorkflowLedger {
  readonly root:string;
  private readonly validator=createP2Validator();
  constructor(root:string){fs.mkdirSync(root,{recursive:true,mode:0o700});this.root=fs.realpathSync(root);}
  private dir(id:string):string{return path.join(this.root,safeId(id));}
  private eventsDir(id:string):string{return path.join(this.dir(id),'events');}
  private latestAuthorization(events:readonly LedgerEvent[],authorizationId:string):{readonly record:WorkflowAuthorizationRecord;readonly proof:import('./machine.js').AuthorizationProof}|null {
    let latest:{record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof}|null=null;
    for(const event of events){
      if(event.event_type==='AUTHORIZATION_RECORDED'){
        const payload=event.payload as {record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof};if(payload.record.authorization_id===authorizationId)latest={record:payload.record,proof:payload.proof};
      }else if(event.event_type==='AUTHORIZATION_REVOKED'){
        const payload=event.payload as {authorization_id:string;record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof};if(payload.authorization_id===authorizationId)latest={record:payload.record,proof:payload.proof};
      }
    }
    return latest;
  }
  create(workflow:WorkflowRecord):LedgerEvent {
    if(workflow.state!=='CREATED'||workflow.phase!=='NONE')throw Error('INITIAL_WORKFLOW_REQUIRED');
    if(!this.validator.validate('Workflow',workflow).valid)throw Error('INVALID_WORKFLOW');
    const dir=this.dir(workflow.workflow_id);fs.mkdirSync(dir,{recursive:false,mode:0o700});fs.mkdirSync(path.join(dir,'events'),{mode:0o700});
    return this.writeEvent(workflow.workflow_id,0,'WORKFLOW_CREATED',workflow,LEDGER_GENESIS);
  }
  private writeEvent(id:string,sequence:number,event_type:string,payload:unknown,previous_event_hash:string):LedgerEvent {
    const body={event_id:'evt-'+randomUUID(),workflow_id:id,sequence,event_type,payload,observed_at:new Date().toISOString(),previous_event_hash};
    const event={...body,event_hash:canonicalHash(body)};
    const file=path.join(this.eventsDir(id),String(sequence).padStart(8,'0')+'.json');
    const fd=fs.openSync(file,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(event)+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const dirFd=fs.openSync(this.eventsDir(id),'r');try{fs.fsyncSync(dirFd);}finally{fs.closeSync(dirFd);}
    return Object.freeze(event);
  }
  private withLock<T>(id:string,operation:(events:readonly LedgerEvent[])=>T):T {
    const dir=this.dir(id);if(!fs.existsSync(dir))throw Error('WORKFLOW_NOT_FOUND');
    const lock=path.join(dir,'.ledger-lock'),recovery=path.join(dir,'.ledger-recovery-lock');let fd:number;
    try{fd=fs.openSync(lock,'wx',0o600);}catch(error){
      if((error as NodeJS.ErrnoException).code!=='EEXIST')throw error;
      let recoveryFd:number;try{recoveryFd=fs.openSync(recovery,'wx',0o600);}catch{throw Error('LEDGER_RECOVERY_LOCKED');}
      try{
        const stat=fs.lstatSync(lock);if(!stat.isFile()||stat.isSymbolicLink())throw Error('LEDGER_LOCK_UNTRUSTED');
        const owner=JSON.parse(fs.readFileSync(lock,'utf8')) as {nonce?:unknown;identity?:import('../contracts/types.js').ProcessIdentity};
        if(typeof owner.nonce!=='string'||!owner.identity||processAlive(owner.identity))throw Error('LEDGER_LOCKED');
        const archived=lock+'.abandoned-'+owner.nonce;if(fs.existsSync(archived))throw Error('LEDGER_STALE_LOCK_ARCHIVE_EXISTS');
        fs.renameSync(lock,archived);
      }finally{fs.closeSync(recoveryFd);try{fs.unlinkSync(recovery);}catch{}}
      try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('LEDGER_LOCKED');}
    }
    try{fs.writeFileSync(fd,JSON.stringify({nonce:randomUUID(),identity:processIdentity(process.pid)}));fs.fsyncSync(fd);return operation(this.verify(id));}
    finally{try{fs.closeSync(fd!);}catch{}try{fs.unlinkSync(lock);}catch{}}
  }
  append(id:string,event_type:string,payload:unknown):LedgerEvent {
    if(['WORKFLOW_TRANSITION','INVOCATION_RESERVED','INVOCATION_CREATED','INVOCATION_TRANSITION','AGENT_MESSAGE','EFFECT_INTENT','EFFECT_TRANSITION','AUTHORIZATION_RECORDED','AUTHORIZATION_REVOKED','ARTIFACT_AUTHORED','ARTIFACT_REVIEWED'].includes(event_type))throw Error('USE_TYPED_LEDGER_API');
    return this.withLock(id,events=>{
      const last=events.at(-1)!;
      return this.writeEvent(id,last.sequence+1,event_type,payload,last.event_hash);
    });
  }
  transitionWorkflowEvent(id:string,event:string,context:NonNullable<Parameters<typeof transitionWorkflow>[2]>):LedgerEvent {
    if(event==='REVOKE')throw Error('USE_REVOCATION_API');
    return this.withLock(id,events=>{
      const prior=this.projectEvents(events);let effective=context;
      if(['AUTHORIZE','RESUME','START','ADVANCE_PHASE','REQUEST_FINAL_APPROVAL'].includes(event)){
        const proof=context.authorizationProof;if(!proof)throw Error('AUTHORIZATION_PROOF_REQUIRED');
        const stored=this.latestAuthorization(events,proof.authorization_id);
        if(!stored||stored.record.revoked_at!==null||canonicalHash(stored.proof)!==canonicalHash(proof)||stored.record.workflow_id!==prior.workflow_id||stored.record.contract_sha256!==prior.contract_sha256||Date.parse(stored.record.expires_at)<=Date.now())throw Error('AUTHORIZATION_NOT_CURRENT');
        effective={...context,authorizationValid:true,authorizationId:stored.record.authorization_id};
      }
      if(event==='REQUEST_FINAL_APPROVAL'||event==='CONFIRM_CANCEL'){
        const invocations=this.invocationsFrom(events);const pending=invocations.some(i=>!this.invocationSettled(events,i));
        if(event==='REQUEST_FINAL_APPROVAL'&&invocations.some(i=>i.state!=='SUCCEEDED'))throw Error('INVOCATIONS_NOT_SUCCESSFUL');
        const unresolved=this.effectsFrom(events).some(e=>['INTENT_RECORDED','DISPATCHED','OBSERVED','UNKNOWN','RECONCILIATION_REQUIRED','BLOCKED'].includes(e.state));
        if(pending||unresolved)throw Error('EFFECTS_OR_PROCESSES_UNRECONCILED');
      }
      if(event==='ADVANCE_PHASE'||event==='RESUME'||event==='START')this.assertNoUnresolvedEffects(events);
      if(event==='RESUME'&&this.invocationsFrom(events).some(i=>!this.invocationSettled(events,i)))throw Error('INVOCATIONS_NEED_RECONCILIATION');
      if(event==='RESUME'&&this.effectsFrom(events).some(e=>e.state!=='CONFIRMED'))throw Error('EFFECTS_NEED_RECONCILIATION');
      if(event==='AUTHORIZE'||event==='RESUME'){
        const proof=effective.authorizationProof!;if(!events.some(e=>e.event_type==='AUTHORIZATION_RECORDED'&&(e.payload as {record:WorkflowAuthorizationRecord}).record.authorization_id===proof.authorization_id))throw Error('AUTHORIZATION_NOT_PERSISTED');
      }
      const next=transitionWorkflow(prior,event,effective);const last=events.at(-1)!;
      if(event==='ADVANCE_PHASE'){
        const auth=this.latestAuthorization(events,effective.authorizationProof?.authorization_id??'');if(!auth)throw Error('AUTHORIZATION_NOT_CURRENT');
        const limits=resolveEffectiveLimits(auth.record.limits);
        if(next.revision_cycles>limits.review_cycles||next.correction_cycles>limits.correction_cycles)throw Error('CYCLE_LIMIT_EXCEEDED');
      }
      return this.writeEvent(id,last.sequence+1,'WORKFLOW_TRANSITION',{event,context:effective,next_state:next.state,next_phase:next.phase,authorization_id:next.authorization_id},last.event_hash);
    });
  }
  recordAuthorization(record:WorkflowAuthorizationRecord,approval:ApprovalRecord,contract:TaskContract,trusted:readonly TrustedApproval[],verifiedAt:string):import('./machine.js').AuthorizationProof {
    return this.withLock(record.workflow_id,events=>{
      if(!['CREATED','BLOCKED'].includes(this.projectEvents(events).state))throw Error('AUTHORIZATION_STATE_INVALID');
      const result=authorizeWorkflow(record,approval,contract,trusted);if(!result.allowed)throw Error('AUTHORIZATION_REJECTED:'+result.reasons.join(','));
      const proof=createAuthorizationProof(record,approval,contract,trusted,verifiedAt);const trust=trusted.find(t=>t.record_sha256===canonicalHash(approval)&&!t.revoked);
      if(!trust)throw Error('TRUSTED_APPROVAL_REQUIRED');
      const last=events.at(-1)!;this.writeEvent(record.workflow_id,last.sequence+1,'AUTHORIZATION_RECORDED',{record,approval,contract,trust,proof},last.event_hash);return proof;
    });
  }
  revokeAuthorization(workflowId:string,authorizationId:string,revokedAt:string):LedgerEvent {
    return this.withLock(workflowId,events=>{
      const state=this.projectEvents(events);if(state.authorization_id!==authorizationId)throw Error('AUTHORIZATION_BINDING_MISMATCH');
      if(!Number.isFinite(Date.parse(revokedAt)))throw Error('INVALID_REVOCATION_TIME');
      if(!['AUTHORIZED','ACTIVE','AWAITING_APPROVAL','BLOCKED'].includes(state.state))throw Error('REVOCATION_NOT_ALLOWED');
      const current=this.latestAuthorization(events,authorizationId);if(!current||current.record.revoked_at!==null)throw Error('AUTHORIZATION_NOT_CURRENT');
      const revoked={...current.record,revoked_at:revokedAt};let last=events.at(-1)!;
      const revocation=this.writeEvent(workflowId,last.sequence+1,'AUTHORIZATION_REVOKED',{authorization_id:authorizationId,workflow_id:workflowId,revoked_at:revokedAt,record:revoked,proof:current.proof},last.event_hash);last=revocation;
      const active=this.invocationsFrom([...events,revocation]).find(i=>['STARTING','RUNNING'].includes(i.state));
      if(active){const record=transitionInvocation(active,'CANCEL',{observedAt:revokedAt});this.writeEvent(workflowId,last.sequence+1,'INVOCATION_TRANSITION',{invocation_id:active.invocation_id,event:'CANCEL',context:{observedAt:revokedAt},record},last.event_hash);}
      return revocation;
    });
  }
  reserveInvocation(id:string,invocationId:string,limits:WorkflowLimits):LedgerEvent {
    return this.withLock(id,events=>{
      if(this.projectEvents(events).state!=='ACTIVE')throw Error('WORKFLOW_NOT_ACTIVE');
      this.assertNoUnresolvedEffects(events);
      const auth=this.latestAuthorization(events,this.projectEvents(events).authorization_id??'');if(!auth||auth.record.revoked_at!==null||canonicalHash(auth.record.limits)!==canonicalHash(limits))throw Error('AUTHORIZATION_LIMITS_MISMATCH');
      const count=events.filter(e=>e.event_type==='INVOCATION_RESERVED').length;const effective=resolveEffectiveLimits(limits);
      if(count>=effective.invocations)throw Error('INVOCATION_LIMIT_EXCEEDED');
      const last=events.at(-1)!;return this.writeEvent(id,last.sequence+1,'INVOCATION_RESERVED',{invocation_id:invocationId,reservation_number:count+1,limit:effective.invocations},last.event_hash);
    });
  }
  createEffectIntent(workflowId:string,invocationId:string,operation:string,payload:unknown,authorization:WorkflowAuthorizationRecord,binding:AuthorizationBinding,agent:AgentIdentity,targetPath?:string,sandboxProof?:SandboxValidationRecord|null,sandboxExpected?:Parameters<typeof evaluateSandboxProof>[1]):EffectRecord {
    return this.withLock(workflowId,events=>{
      if(this.projectEvents(events).state!=='ACTIVE')throw Error('WORKFLOW_NOT_ACTIVE');
      this.assertNoUnresolvedEffects(events);
      const stored=this.latestAuthorization(events,authorization.authorization_id);if(!stored||stored.record.revoked_at!==null||canonicalHash(stored.record)!==canonicalHash(authorization))throw Error('AUTHORIZATION_NOT_CURRENT');
      const auth=checkAuthorization(authorization,binding,new Date().toISOString(),operation,agent,targetPath);if(!auth.allowed)throw Error('EFFECT_UNAUTHORIZED:'+auth.reasons.join(','));
      if(['WRITE','COMMIT'].includes(operation)&&(!sandboxExpected||!evaluateSandboxProof(sandboxProof??null,sandboxExpected,new Date().toISOString()).allowed))throw Error('SANDBOX_PROOF_REQUIRED');
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation||invocation.state!=='RUNNING')throw Error('INVOCATION_NOT_RUNNING');
      const effect=createEffectIntent(workflowId,invocationId,operation,payload,new Date().toISOString());if(events.some(e=>e.event_type==='EFFECT_INTENT'&&(e.payload as EffectRecord).effect_id===effect.effect_id))throw Error('DUPLICATE_EFFECT_ID');
      const last=events.at(-1)!;this.writeEvent(workflowId,last.sequence+1,'EFFECT_INTENT',effect,last.event_hash);return effect;
    });
  }
  transitionEffect(workflowId:string,effectId:string,event:'DISPATCH'|'OBSERVED'|'UNKNOWN'|'CONFIRM'|'BLOCK',authorization:WorkflowAuthorizationRecord,binding:AuthorizationBinding,agent:AgentIdentity,targetPath?:string,sandboxProof?:SandboxValidationRecord|null,sandboxExpected?:Parameters<typeof evaluateSandboxProof>[1]):EffectRecord {
    return this.withLock(workflowId,events=>{
      const current=this.effectsFrom(events).find(e=>e.effect_id===effectId);if(!current)throw Error('EFFECT_NOT_FOUND');
      if(event==='DISPATCH'){
        if(this.projectEvents(events).state!=='ACTIVE')throw Error('WORKFLOW_NOT_ACTIVE');
        const stored=this.latestAuthorization(events,authorization.authorization_id);if(!stored||stored.record.revoked_at!==null||canonicalHash(stored.record)!==canonicalHash(authorization))throw Error('AUTHORIZATION_NOT_CURRENT');
        const auth=checkAuthorization(authorization,binding,new Date().toISOString(),current.operation,agent,targetPath);if(!auth.allowed)throw Error('EFFECT_UNAUTHORIZED:'+auth.reasons.join(','));
        if(['WRITE','COMMIT'].includes(current.operation)&&(!sandboxExpected||!evaluateSandboxProof(sandboxProof??null,sandboxExpected,new Date().toISOString()).allowed))throw Error('SANDBOX_PROOF_REQUIRED');
      }
      if(event==='DISPATCH'&&current.state!=='INTENT_RECORDED')throw Error('EFFECT_REDISPATCH_FORBIDDEN');
      const next=reconcileEffect(current,event,event==='DISPATCH'?null:new Date().toISOString());const last=events.at(-1)!;
      this.writeEvent(workflowId,last.sequence+1,'EFFECT_TRANSITION',{effect_id:effectId,event,record:next},last.event_hash);return next;
    });
  }
  markDispatchedEffectsUncertain(workflowId:string):readonly EffectRecord[] {
    return this.withLock(workflowId,events=>{
      const pending=this.effectsFrom(events).filter(e=>e.state==='DISPATCHED'||e.state==='INTENT_RECORDED');const updated:EffectRecord[]=[];let last=events.at(-1)!;
      for(const effect of pending){const next=reconcileEffect(effect,'UNKNOWN',new Date().toISOString());last=this.writeEvent(workflowId,last.sequence+1,'EFFECT_TRANSITION',{effect_id:effect.effect_id,event:'UNKNOWN',record:next},last.event_hash);updated.push(next);}
      return Object.freeze(updated);
    });
  }
  recover(workflowId:string):{readonly state:WorkflowRecord['state'];readonly pending_invocations:readonly string[];readonly pending_effects:readonly string[]} {
    let events=this.verify(workflowId);let workflow=this.projectEvents(events);
    if(['COMPLETED','FAILED','REJECTED','CANCELLED'].includes(workflow.state))return Object.freeze({state:workflow.state,pending_invocations:Object.freeze([]),pending_effects:Object.freeze([])});
    const effects=this.effectsFrom(events);if(effects.some(e=>e.state==='INTENT_RECORDED'||e.state==='DISPATCHED'))this.markDispatchedEffectsUncertain(workflowId);
    events=this.verify(workflowId);workflow=this.projectEvents(events);
    const pendingInvocations=this.invocationsFrom(events).filter(i=>!this.invocationSettled(events,i)).map(i=>i.invocation_id);
    const pendingEffects=this.effectsFrom(events).filter(e=>e.state!=='CONFIRMED').map(e=>e.effect_id);
    if((pendingInvocations.length||pendingEffects.length)&&workflow.state==='ACTIVE')this.transitionWorkflowEvent(workflowId,'BLOCK',{reason:'RECOVERY_RECONCILIATION_REQUIRED'});
    events=this.verify(workflowId);workflow=this.projectEvents(events);
    if((pendingInvocations.length||pendingEffects.length)&&!events.some(e=>e.event_type==='WORKFLOW_RECOVERY_REQUIRED'))this.append(workflowId,'WORKFLOW_RECOVERY_REQUIRED',{pending_invocation_ids:pendingInvocations,pending_effect_ids:pendingEffects,observed_at:new Date().toISOString()});
    return Object.freeze({state:workflow.state,pending_invocations:Object.freeze(pendingInvocations),pending_effects:Object.freeze(pendingEffects)});
  }
  appendInvocation(invocation:AgentInvocationRecord):LedgerEvent {
    return this.withLock(invocation.workflow_id,events=>{
      if(!this.validator.validate('AgentInvocation',invocation).valid||invocation.state!=='CREATED')throw Error('INVALID_INVOCATION');
      if(invocation.identity.status==='VERIFIED'&&(!invocation.identity.catalog_hash||!/^[a-f0-9]{64}$/.test(invocation.identity.catalog_hash)))throw Error('VERIFIED_IDENTITY_NEEDS_CATALOG_HASH');
      if(this.projectEvents(events).state!=='ACTIVE')throw Error('WORKFLOW_NOT_ACTIVE');
      const prior=this.invocationsFrom(events);
      if(prior.some(i=>i.invocation_id===invocation.invocation_id))throw Error('DUPLICATE_INVOCATION');
      if(prior.some(i=>['STARTING','RUNNING','CANCEL_REQUESTED'].includes(i.state)))throw Error('ACTIVE_INVOCATION_EXISTS');
      if(!events.some(e=>e.event_type==='INVOCATION_RESERVED'&&(e.payload as {invocation_id?:string}).invocation_id===invocation.invocation_id))throw Error('INVOCATION_NOT_RESERVED');
      const last=events.at(-1)!;return this.writeEvent(invocation.workflow_id,last.sequence+1,'INVOCATION_CREATED',invocation,last.event_hash);
    });
  }
  transitionInvocation(workflowId:string,invocationId:string,event:string,context:Parameters<typeof transitionInvocation>[2]={}):LedgerEvent {
    return this.withLock(workflowId,events=>{
      const current=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!current)throw Error('INVOCATION_NOT_FOUND');
      const workflow=this.projectEvents(events);const authorization=this.latestAuthorization(events,workflow.authorization_id??'');
      const revoked=!!authorization&&authorization.record.revoked_at!==null;
      if(revoked&&!['CONFIRM_CANCEL','RESULT_UNCERTAIN','RESULT_FAILURE','INTERRUPTED','PROCESS_STARTED'].includes(event))throw Error('AUTHORIZATION_REVOKED');
      if(revoked&&event==='PROCESS_STARTED')throw Error('LATE_PROCESS_REQUIRES_CONTAINMENT');
      const effectiveContext={...context,observedAt:context.observedAt??new Date().toISOString(),revocationPending:revoked||context.revocationPending===true};
      const next=transitionInvocation(current,event,effectiveContext);const last=events.at(-1)!;
      return this.writeEvent(workflowId,last.sequence+1,'INVOCATION_TRANSITION',{invocation_id:invocationId,event,context:effectiveContext,record:next},last.event_hash);
    });
  }
  recordArtifactAuthorship(workflowId:string,artifactHash:string,invocationId:string):LedgerEvent {
    return this.withLock(workflowId,events=>{
      if(!/^[a-f0-9]{64}$/.test(artifactHash))throw Error('INVALID_ARTIFACT_HASH');
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation||invocation.state!=='SUCCEEDED'||invocation.role!=='IMPLEMENTER')throw Error('ARTIFACT_AUTHOR_NOT_VALIDATED');
      const last=events.at(-1)!;return this.writeEvent(workflowId,last.sequence+1,'ARTIFACT_AUTHORED',{artifact_sha256:artifactHash,invocation_id:invocationId},last.event_hash);
    });
  }
  recordArtifactReview(workflowId:string,artifactHash:string,invocationId:string):LedgerEvent {
    return this.withLock(workflowId,events=>{
      if(!/^[a-f0-9]{64}$/.test(artifactHash))throw Error('INVALID_ARTIFACT_HASH');
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation||invocation.state!=='SUCCEEDED'||invocation.role!=='REVIEWER')throw Error('REVIEWER_NOT_VALIDATED');
      const last=events.at(-1)!;return this.writeEvent(workflowId,last.sequence+1,'ARTIFACT_REVIEWED',{artifact_sha256:artifactHash,invocation_id:invocationId},last.event_hash);
    });
  }
  reviewIndependence(workflowId:string,artifactHash:string,reviewerInvocationId:string):{readonly allowed:boolean;readonly reasons:readonly string[]} {
    const events=this.verify(workflowId),invocations=this.invocationsFrom(events);const reviewer=invocations.find(i=>i.invocation_id===reviewerInvocationId);
    const authors=events.filter(e=>e.event_type==='ARTIFACT_AUTHORED'&&(e.payload as {artifact_sha256:string}).artifact_sha256===artifactHash).map(e=>(e.payload as {invocation_id:string}).invocation_id);
    const reasons:string[]=[];
    if(!reviewer||reviewer.role!=='REVIEWER'||reviewer.state!=='SUCCEEDED')reasons.push('REVIEWER_NOT_VALIDATED');
    if(!events.some(e=>e.event_type==='ARTIFACT_REVIEWED'&&(e.payload as {artifact_sha256:string;invocation_id:string}).artifact_sha256===artifactHash&&(e.payload as {invocation_id:string}).invocation_id===reviewerInvocationId))reasons.push('REVIEW_NOT_RECORDED_IN_LEDGER');
    if(!authors.length)reasons.push('ARTIFACT_AUTHOR_NOT_RECORDED');
    for(const authorId of authors){const author=invocations.find(i=>i.invocation_id===authorId);if(!author||author.role!=='IMPLEMENTER'||author.state!=='SUCCEEDED'){reasons.push('ARTIFACT_AUTHOR_NOT_VALIDATED');continue;}
      if(reviewer)evaluateIndependentReview(author.identity,reviewer.identity,{reviewerInvocationId,artifactAuthorInvocationIds:authors}).reasons.forEach(r=>reasons.push(r));
    }
    return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze([...new Set(reasons)])});
  }
  acceptMessage(input:AgentMessageInput):{readonly message:NormalizedAgentMessage;readonly duplicate:boolean} {
    return this.withLock(input.workflow_id,events=>{
      if(this.projectEvents(events).state!=='ACTIVE')throw Error('WORKFLOW_NOT_ACTIVE');
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===input.invocation_id);
      if(!invocation||invocation.state!=='RUNNING')throw Error('INVOCATION_NOT_RUNNING');
      const identity=input.source_event_id!==null?'event:'+input.source_event_id:input.source_cursor!==null?'cursor:'+input.source_cursor:null;
      if(!identity)throw Error('STABLE_SOURCE_ID_REQUIRED');
      const existing=events.filter(e=>e.event_type==='AGENT_MESSAGE').map(e=>e.payload as NormalizedAgentMessage).find(m=>m.invocation_id===input.invocation_id&&(m.source_event_id!==null?'event:'+m.source_event_id:m.source_cursor!==null?'cursor:'+m.source_cursor:null)===identity);
      const payloadHash=canonicalHash(input.payload);
      if(existing){if(existing.payload_sha256!==payloadHash||existing.message_type!==input.message_type||existing.reply_to_message_id!==input.reply_to_message_id)throw Error('SOURCE_EVENT_CONFLICT');return Object.freeze({message:existing,duplicate:true});}
      if(input.reply_to_message_id!==null&&!events.some(e=>e.event_type==='AGENT_MESSAGE'&&(e.payload as NormalizedAgentMessage).message_id===input.reply_to_message_id))throw Error('REPLY_TARGET_UNKNOWN');
      const last=events.at(-1)!;const sequence=last.sequence+1;
      const message=normalizeAgentMessage(input,{sequence,previous_event_hash:last.event_hash,observed_at:new Date().toISOString(),correlation_id:'corr-'+workflowIdSafe(input.workflow_id)});
      this.writeEvent(input.workflow_id,sequence,'AGENT_MESSAGE',message,last.event_hash);
      return Object.freeze({message,duplicate:false});
    });
  }
  invocationsFrom(events:readonly LedgerEvent[]):AgentInvocationRecord[] {
    const records=new Map<string,AgentInvocationRecord>();
    for(const event of events){if(event.event_type==='INVOCATION_CREATED'){const i=event.payload as AgentInvocationRecord;records.set(i.invocation_id,i);}else if(event.event_type==='INVOCATION_TRANSITION'){const p=event.payload as {invocation_id:string;record:AgentInvocationRecord};records.set(p.invocation_id,p.record);}}
    return [...records.values()];
  }
  private invocationSettled(events:readonly LedgerEvent[],invocation:AgentInvocationRecord):boolean {
    if(['STARTING','RUNNING','CANCEL_REQUESTED'].includes(invocation.state))return false;
    if(invocation.state==='SUCCEEDED'||invocation.state==='BLOCKED')return true;
    const last=[...events].reverse().find(e=>e.event_type==='INVOCATION_TRANSITION'&&(e.payload as {invocation_id?:string}).invocation_id===invocation.invocation_id);
    if(!last)return false;const p=last.payload as {event:string;context?:{processObservedStopped?:boolean}};
    return p.event==='START_FAILED'||p.context?.processObservedStopped===true;
  }
  private assertNoUnresolvedEffects(events:readonly LedgerEvent[]):void {
    if(this.effectsFrom(events).some(e=>e.state!=='CONFIRMED'))throw Error('EFFECTS_NEED_RECONCILIATION');
  }
  effectsFrom(events:readonly LedgerEvent[]):EffectRecord[] {
    const records=new Map<string,EffectRecord>();for(const e of events){if(e.event_type==='EFFECT_INTENT'){const x=e.payload as EffectRecord;records.set(x.effect_id,x);}else if(e.event_type==='EFFECT_TRANSITION'){const x=e.payload as {effect_id:string;record:EffectRecord};records.set(x.effect_id,x.record);}}return [...records.values()];
  }
  assertBudgets(workflowId:string,now:string):{readonly workflow_active_ms:number;readonly longest_invocation_ms:number} {
    const events=this.verify(workflowId),workflow=this.projectEvents(events),authorization=this.latestAuthorization(events,workflow.authorization_id??'');if(!authorization)throw Error('AUTHORIZATION_NOT_CURRENT');
    const limits=resolveEffectiveLimits(authorization.record.limits),workflowMs=measureWorkflowActiveMs(events,now),invocationMs=measureInvocationMs(this.invocationsFrom(events),now);
    assertRuntimeBudgets(workflowMs,invocationMs,limits);return Object.freeze({workflow_active_ms:workflowMs,longest_invocation_ms:invocationMs});
  }
  verify(id:string):readonly LedgerEvent[] {
    const dir=this.eventsDir(id);if(!fs.existsSync(dir))throw Error('WORKFLOW_NOT_FOUND');
    const names=fs.readdirSync(dir).sort();if(!names.length)throw Error('LEDGER_EMPTY');
    let previous=LEDGER_GENESIS;const events:LedgerEvent[]=[];const invocationMap=new Map<string,AgentInvocationRecord>();const effectMap=new Map<string,EffectRecord>();let reservations=0;
    for(let sequence=0;sequence<names.length;sequence++){
      const name=String(sequence).padStart(8,'0')+'.json';if(names[sequence]!==name)throw Error('LEDGER_SEQUENCE');
      const event=readEvent(path.join(dir,name));const {event_hash,...body}=event;
      if(event.sequence!==sequence||event.workflow_id!==id||event.previous_event_hash!==previous||canonicalHash(body)!==event_hash)throw Error('LEDGER_INTEGRITY');
      if(sequence===0){if(event.event_type!=='WORKFLOW_CREATED'||!this.validator.validate('Workflow',event.payload).valid)throw Error('LEDGER_INITIAL_EVENT');}
      else if(event.event_type==='WORKFLOW_TRANSITION'){
        const projection=this.projectEvents(events);const data=event.payload as {event:string;context:Parameters<typeof transitionWorkflow>[2];next_state:WorkflowRecord['state'];next_phase:WorkflowRecord['phase'];authorization_id:string|null};
        if(!data.context)throw Error('LEDGER_TRANSITION_CONTEXT_MISSING');
        const p=data.context.authorizationProof;
        if(['AUTHORIZE','RESUME','START','ADVANCE_PHASE','REQUEST_FINAL_APPROVAL'].includes(data.event)){
          const stored=p?this.latestAuthorization(events,p.authorization_id):null;
          if(!stored||stored.record.revoked_at!==null||canonicalHash(stored.proof)!==canonicalHash(p)||stored.record.contract_sha256!==projection.contract_sha256||Date.parse(stored.record.expires_at)<=Date.parse(event.observed_at))throw Error('LEDGER_AUTHORIZATION_MISMATCH');
        }
        const next=transitionWorkflow(projection,data.event,data.context);
        if(next.state!==data.next_state||next.phase!==data.next_phase||next.authorization_id!==data.authorization_id)throw Error('LEDGER_PROJECTION_MISMATCH');
      } else if(event.event_type==='AUTHORIZATION_RECORDED'){
        const p=event.payload as {record:WorkflowAuthorizationRecord;approval:ApprovalRecord;contract:TaskContract;trust:TrustedApproval;proof:import('./machine.js').AuthorizationProof};
        const approvalHash=canonicalHash(p.approval),contractHash=canonicalHash(p.contract);
        if(p.record.workflow_id!==id||p.record.approval_record_sha256!==approvalHash||p.record.contract_sha256!==contractHash||p.trust.record_sha256!==approvalHash||p.trust.revoked||p.proof.authorization_id!==p.record.authorization_id||p.proof.workflow_id!==id||p.proof.contract_sha256!==contractHash||p.proof.expires_at!==p.record.expires_at||p.proof.revoked)throw Error('LEDGER_AUTHORIZATION_RECORD_INVALID');
        const decision=authorizeWorkflow(p.record,p.approval,p.contract,[p.trust]);if(!decision.allowed)throw Error('LEDGER_AUTHORIZATION_RECORD_INVALID');
      } else if(event.event_type==='INVOCATION_RESERVED'){
        const p=event.payload as {invocation_id:string;reservation_number:number;limit:number};reservations++;
        const projected=this.projectEvents(events);const authorization=this.latestAuthorization(events,projected.authorization_id??'');const expectedLimit=authorization?resolveEffectiveLimits(authorization.record.limits).invocations:0;
        if(projected.state!=='ACTIVE'||p.reservation_number!==reservations||p.limit!==expectedLimit||reservations>expectedLimit||!authorization||authorization.record.revoked_at!==null||[...invocationMap.values()].some(i=>i.invocation_id===p.invocation_id))throw Error('INVOCATION_RESERVATION_INVALID');
      } else if(event.event_type==='INVOCATION_CREATED'){
        const i=event.payload as AgentInvocationRecord;
        if(!this.validator.validate('AgentInvocation',i).valid||i.workflow_id!==id||i.state!=='CREATED'||(i.identity.status==='VERIFIED'&&(!i.identity.catalog_hash||!/^[a-f0-9]{64}$/.test(i.identity.catalog_hash)))||invocationMap.has(i.invocation_id)||!events.some(e=>e.event_type==='INVOCATION_RESERVED'&&(e.payload as {invocation_id:string}).invocation_id===i.invocation_id))throw Error('INVOCATION_JOURNAL_INVALID');
        if(this.projectEvents(events).state!=='ACTIVE'||[...invocationMap.values()].some(v=>['STARTING','RUNNING','CANCEL_REQUESTED'].includes(v.state)))throw Error('INVOCATION_CONCURRENCY_INVALID');
        invocationMap.set(i.invocation_id,i);
      } else if(event.event_type==='INVOCATION_TRANSITION'){
        const p=event.payload as {invocation_id:string;event:string;context:Parameters<typeof transitionInvocation>[2];record:AgentInvocationRecord};const current=invocationMap.get(p.invocation_id);
        if(!current)throw Error('INVOCATION_NOT_FOUND');const expected=transitionInvocation(current,p.event,p.context);
        if(canonicalHash(expected)!==canonicalHash(p.record))throw Error('INVOCATION_PROJECTION_MISMATCH');invocationMap.set(p.invocation_id,p.record);
      } else if(event.event_type==='AGENT_MESSAGE'){
        const message=event.payload as NormalizedAgentMessage;const invocation=invocationMap.get(message.invocation_id);
        if(!this.validator.validate('AgentMessage',message).valid||!verifyNormalizedMessage(message)||message.workflow_id!==id||message.sequence!==sequence||message.previous_event_hash!==event.previous_event_hash||!invocation||invocation.state!=='RUNNING')throw Error('MESSAGE_JOURNAL_INVALID');
        const idKey=message.source_event_id!==null?'event:'+message.source_event_id:'cursor:'+message.source_cursor;
        if(events.some(e=>e.event_type==='AGENT_MESSAGE'&&(e.payload as NormalizedAgentMessage).invocation_id===message.invocation_id&&((e.payload as NormalizedAgentMessage).source_event_id!==null?'event:'+((e.payload as NormalizedAgentMessage).source_event_id):'cursor:'+((e.payload as NormalizedAgentMessage).source_cursor))===idKey))throw Error('MESSAGE_REPLAY_IN_LEDGER');
      } else if(event.event_type==='EFFECT_INTENT'){
        const effect=event.payload as EffectRecord;if(!this.validator.validate('EffectRecord',effect).valid||effect.workflow_id!==id||effect.state!=='INTENT_RECORDED'||effectMap.has(effect.effect_id)||this.projectEvents(events).state!=='ACTIVE'||invocationMap.get(effect.invocation_id)?.state!=='RUNNING')throw Error('EFFECT_INTENT_INVALID');effectMap.set(effect.effect_id,effect);
      } else if(event.event_type==='EFFECT_TRANSITION'){
        const p=event.payload as {effect_id:string;event:'DISPATCH'|'OBSERVED'|'UNKNOWN'|'CONFIRM'|'BLOCK';record:EffectRecord};const current=effectMap.get(p.effect_id);if(!current)throw Error('EFFECT_NOT_FOUND');const expected=reconcileEffect(current,p.event,p.event==='DISPATCH'?null:p.record.observed_at);
        if(canonicalHash(expected)!==canonicalHash(p.record))throw Error('EFFECT_PROJECTION_MISMATCH');effectMap.set(p.effect_id,p.record);
      } else if(event.event_type==='ARTIFACT_AUTHORED'){
        const p=event.payload as {artifact_sha256:string;invocation_id:string};if(!/^[a-f0-9]{64}$/.test(p.artifact_sha256)||invocationMap.get(p.invocation_id)?.role!=='IMPLEMENTER'||invocationMap.get(p.invocation_id)?.state!=='SUCCEEDED')throw Error('ARTIFACT_AUTHOR_INVALID');
      } else if(event.event_type==='ARTIFACT_REVIEWED'){
        const p=event.payload as {artifact_sha256:string;invocation_id:string};if(!/^[a-f0-9]{64}$/.test(p.artifact_sha256)||invocationMap.get(p.invocation_id)?.role!=='REVIEWER'||invocationMap.get(p.invocation_id)?.state!=='SUCCEEDED')throw Error('ARTIFACT_REVIEW_INVALID');
      } else if(event.event_type==='AUTHORIZATION_REVOKED'){
        const p=event.payload as {authorization_id:string;workflow_id:string;revoked_at:string;record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof};const projection=this.projectEvents(events);const prior=this.latestAuthorization(events,p.authorization_id);
        if(p.workflow_id!==id||projection.authorization_id!==p.authorization_id||!Number.isFinite(Date.parse(p.revoked_at))||!['AUTHORIZED','ACTIVE','AWAITING_APPROVAL','BLOCKED'].includes(projection.state)||!prior||prior.record.revoked_at!==null||p.record.revoked_at!==p.revoked_at||canonicalHash({...p.record,revoked_at:null})!==canonicalHash(prior.record)||canonicalHash(p.proof)!==canonicalHash(prior.proof))throw Error('AUTHORIZATION_REVOCATION_INVALID');
        transitionWorkflow(projection,'REVOKE');
      }
      events.push(event);previous=event_hash;
    }
    return Object.freeze(events);
  }
  private projectEvents(events:readonly LedgerEvent[]):WorkflowRecord {
    let workflow=events[0]!.payload as WorkflowRecord;
    for(const event of events.slice(1)){
      if(event.event_type==='WORKFLOW_TRANSITION'){const p=event.payload as {event:string;context:Parameters<typeof transitionWorkflow>[2]};workflow=transitionWorkflow(workflow,p.event,p.context);}
      else if(event.event_type==='AUTHORIZATION_REVOKED')workflow=transitionWorkflow(workflow,'REVOKE');
    }
    return workflow;
  }
  project(id:string):WorkflowRecord {
    const events=this.verify(id),workflow=this.projectEvents(events);
    const active=this.invocationsFrom(events).find(i=>['STARTING','RUNNING','CANCEL_REQUESTED'].includes(i.state));
    return Object.freeze({...workflow,active_invocation_id:active?.invocation_id??null});
  }
}
function workflowIdSafe(value:string):string {return value.replace(/[^A-Za-z0-9._-]/gu,'_');}
