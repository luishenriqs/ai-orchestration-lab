import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalHash } from '../contracts/integrity.js';
import { processAlive, processIdentity } from '../execution/attempts.js';
import { transitionWorkflow, projectVerifiedFinalApproval } from './machine.js';
import { transitionInvocation } from './machine.js';
import { normalizeAgentMessage, verifyNormalizedMessage } from './protocol.js';
import { createEffectIntent, reconcileEffect } from './effects.js';
import { authorizeWorkflow, checkAuthorization, createAuthorizationProof, createGateProof, evaluateIndependentReview, evaluateSandboxProof, resolveIdentity, canonicalAgentAuthorizationId } from './governance.js';
import { assertRuntimeBudgets, assertOutputWithinLimit, measureInvocationMs, measureWorkflowActiveMs, resolveEffectiveLimits } from './limits.js';
import type { TrustedApproval } from '../governance/approval.js';
import type { ApprovalRecord, TaskContract } from '../contracts/types.js';
import { verifyApproval, trustApproval } from '../governance/approval.js';
import { createP2Validator } from './validation.js';
import { LEDGER_GENESIS, type AdapterIdentityObservation, type AgentInvocationRecord, type AgentMessageInput, type EffectRecord, type LedgerEvent, type NormalizedAgentMessage, type WorkflowAuthorizationRecord, type WorkflowLedgerOptions, type WorkflowLimits, type WorkflowRecord } from './types.js';

function safeId(value:string):string {if(!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value))throw Error('INVALID_WORKFLOW_ID');return value;}
function verifyApprovalForExecution(contract:TaskContract,approval:ApprovalRecord,trusted:readonly TrustedApproval[]):boolean{return verifyApproval(contract,approval,{scope:'EXECUTION',trusted}).allowed;}
export class WorkflowLedgerError extends Error {constructor(readonly code:string,message=code){super(message);this.name='WorkflowLedgerError';}}
function readEvent(file:string):LedgerEvent {try{return JSON.parse(fs.readFileSync(file,'utf8')) as LedgerEvent;}catch{throw new WorkflowLedgerError('LEDGER_EVENT_INVALID');}}
function freezeTree<T>(value:T):T {if(value&&typeof value==='object'){for(const child of Object.values(value as Record<string,unknown>))freezeTree(child);Object.freeze(value);}return value;}
function compareDecimalCursor(a:string,b:string):number {const left=a.replace(/^0+(?=\d)/u,'');const right=b.replace(/^0+(?=\d)/u,'');return left.length===right.length?(left<right?-1:left>right?1:0):left.length-right.length;}
export class WorkflowLedger {
  readonly root:string;
  private readonly validator=createP2Validator();
  private readonly options:WorkflowLedgerOptions;
  constructor(root:string,options:WorkflowLedgerOptions={}){fs.mkdirSync(root,{recursive:true,mode:0o700});this.root=fs.realpathSync(root);const snapshot:WorkflowLedgerOptions={...options,...(options.trusted_approvals?{trusted_approvals:freezeTree(structuredClone(options.trusted_approvals))}:{}),...(options.model_catalog?{model_catalog:freezeTree(structuredClone(options.model_catalog))}:{}),...(options.sandbox_profiles?{sandbox_profiles:freezeTree(structuredClone(options.sandbox_profiles))}:{}),...(options.sandbox_validations?{sandbox_validations:freezeTree(structuredClone(options.sandbox_validations))}:{})};this.options=Object.freeze(snapshot);}
  private now():number{return (this.options.clock??Date.now)();}
  private nowIso():string{return new Date(this.now()).toISOString();}
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
  private currentAuthorization(events:readonly LedgerEvent[]):{readonly record:WorkflowAuthorizationRecord;readonly proof:import('./machine.js').AuthorizationProof;readonly approval:ApprovalRecord;readonly contract:TaskContract;readonly trust:TrustedApproval}|null {
    const workflow=this.projectEvents(events);if(!workflow.authorization_id)return null;
    const event=[...events].reverse().find(e=>e.event_type==='AUTHORIZATION_RECORDED'&&(e.payload as {record:WorkflowAuthorizationRecord}).record.authorization_id===workflow.authorization_id);
    if(!event)return null;const payload=event.payload as {record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof;approval:ApprovalRecord;contract:TaskContract;trust:TrustedApproval};
    const latest=this.latestAuthorization(events,workflow.authorization_id);if(!latest||latest.record.revoked_at!==null)return null;
    return {...payload,record:latest.record};
  }
  private latestAvailableAuthorization(events:readonly LedgerEvent[]):NonNullable<ReturnType<WorkflowLedger['currentAuthorization']>> {
    const event=[...events].reverse().find(e=>e.event_type==='AUTHORIZATION_RECORDED');if(!event)throw new WorkflowLedgerError('AUTHORIZATION_NOT_CURRENT');
    const p=event.payload as {record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof;approval:ApprovalRecord;contract:TaskContract;trust:TrustedApproval};
    const latest=this.latestAuthorization(events,p.record.authorization_id);if(!latest||latest.record.revoked_at!==null||Date.parse(latest.record.expires_at)<=this.now())throw new WorkflowLedgerError('AUTHORIZATION_NOT_CURRENT');
    const trusted=this.options.trusted_approvals??[];if(!trusted.some(t=>canonicalHash(t)===canonicalHash(p.trust)&&!t.revoked)||!verifyApprovalForExecution(p.contract,p.approval,trusted))throw new WorkflowLedgerError('TRUSTED_APPROVAL_REQUIRED');
    return {...p,record:latest.record};
  }
  private assertCurrentAuthorization(events:readonly LedgerEvent[],requestedId?:string):NonNullable<ReturnType<WorkflowLedger['currentAuthorization']>> {
    const auth=this.currentAuthorization(events);if(!auth||requestedId!==undefined&&requestedId!==auth.record.authorization_id)throw new WorkflowLedgerError('AUTHORIZATION_NOT_CURRENT');
    if(Date.parse(auth.record.expires_at)<=this.now())throw new WorkflowLedgerError('AUTHORIZATION_EXPIRED');
    const configured=this.options.trusted_approvals??[];const trust=configured.find(t=>canonicalHash(t)===canonicalHash(auth.trust)&&!t.revoked);
    if(!trust||!verifyApprovalForExecution(auth.contract,auth.approval,configured))throw new WorkflowLedgerError('TRUSTED_APPROVAL_REQUIRED');
    return auth;
  }
  private blockExpiredWorkflow(events:readonly LedgerEvent[]):void {
    const workflow=this.projectEvents(events);if(!['AUTHORIZED','ACTIVE','AWAITING_APPROVAL'].includes(workflow.state))return;
    const last=events.at(-1)!;const next=transitionWorkflow(workflow,'BLOCK',{reason:'AUTHORIZATION_EXPIRED'});
    const event=this.writeEvent(workflow.workflow_id,last.sequence+1,'WORKFLOW_TRANSITION',{event:'BLOCK',context:{reason:'AUTHORIZATION_EXPIRED'},next_state:next.state,next_phase:next.phase,authorization_id:next.authorization_id},last.event_hash);
    this.cancelActiveInvocation([...events,event],workflow.workflow_id,event);
  }
  private blockWorkflow(events:readonly LedgerEvent[],reason:string):void {
    const workflow=this.projectEvents(events);if(!['AUTHORIZED','ACTIVE','AWAITING_APPROVAL'].includes(workflow.state))return;
    const last=events.at(-1)!;const next=transitionWorkflow(workflow,'BLOCK',{reason});
    const event=this.writeEvent(workflow.workflow_id,last.sequence+1,'WORKFLOW_TRANSITION',{event:'BLOCK',context:{reason},next_state:next.state,next_phase:next.phase,authorization_id:next.authorization_id},last.event_hash);
    this.cancelActiveInvocation([...events,event],workflow.workflow_id,event);
  }
  private assertProgress(events:readonly LedgerEvent[],allowContainment=false):NonNullable<ReturnType<WorkflowLedger['currentAuthorization']>> {
    const workflow=this.projectEvents(events);if(workflow.state!=='ACTIVE'&&!(allowContainment&&workflow.state==='CANCEL_REQUESTED'))throw new WorkflowLedgerError('WORKFLOW_NOT_ACTIVE');
    let auth:NonNullable<ReturnType<WorkflowLedger['currentAuthorization']>>;
    try{auth=this.assertCurrentAuthorization(events);}catch(error){
      if(error instanceof WorkflowLedgerError&&error.code==='AUTHORIZATION_EXPIRED')this.blockExpiredWorkflow(events);
      throw error;
    }
    const limits=resolveEffectiveLimits(auth.record.limits);const now=this.nowIso();const workflowMs=measureWorkflowActiveMs(events,now),invocationMs=measureInvocationMs(this.invocationsFrom(events),now);
    if(invocationMs>=limits.invocation_ms)this.blockWorkflow(events,'INVOCATION_DURATION_LIMIT_EXCEEDED');else if(workflowMs>=limits.workflow_active_ms)this.blockWorkflow(events,'WORKFLOW_DURATION_LIMIT_EXCEEDED');
    try{assertRuntimeBudgets(workflowMs,invocationMs,limits);}catch(error){throw error;}return auth;
  }
  private latestGate(events:readonly LedgerEvent[],gate:string):{readonly authorization_id:string;readonly proof:NonNullable<Parameters<typeof transitionWorkflow>[2]>['gateProof']}|null {
    const event=[...events].reverse().find(e=>e.event_type==='GATE_DECISION'&&(e.payload as {gate?:string}).gate===gate);if(!event)return null;
    const p=event.payload as {gate:string;authorization_id:string;proof:NonNullable<Parameters<typeof transitionWorkflow>[2]>['gateProof'];allowed:boolean};return p.allowed?p:null;
  }
  private phaseEntrySequence(events:readonly LedgerEvent[],phase:WorkflowRecord['phase']):number {
    let sequence=-1;
    for(const event of events){
      if(event.event_type==='WORKFLOW_TRANSITION'){
        const p=event.payload as {event?:string;next_phase?:WorkflowRecord['phase']};
        if(p.next_phase===phase)sequence=event.sequence;
      }
    }
    return sequence;
  }
  private currentArtifact(events:readonly LedgerEvent[]):{readonly artifact_sha256:string;readonly diff_sha256:string;readonly fixture_id:string;readonly phase:WorkflowRecord['phase'];readonly latest_authorship_sequence:number;readonly author_ids:readonly string[]}|null {
    const authored=[...events].reverse().find(e=>e.event_type==='ARTIFACT_AUTHORED');if(!authored)return null;
    const p=authored.payload as {artifact_sha256:string;diff_sha256:string;invocation_id:string;fixture_id:string;phase?:WorkflowRecord['phase']};
    if(!p.phase||authored.sequence<=this.phaseEntrySequence(events,p.phase))return null;
    const authorIds=events.filter(e=>e.event_type==='ARTIFACT_AUTHORED').map(e=>e.payload as {artifact_sha256:string;diff_sha256:string;invocation_id:string;fixture_id:string;phase?:WorkflowRecord['phase']}).filter(a=>a.artifact_sha256===p.artifact_sha256&&a.diff_sha256===p.diff_sha256&&a.fixture_id===p.fixture_id&&a.phase===p.phase).map(a=>a.invocation_id);
    return Object.freeze({artifact_sha256:p.artifact_sha256,diff_sha256:p.diff_sha256,fixture_id:p.fixture_id,phase:p.phase,latest_authorship_sequence:authored.sequence,author_ids:Object.freeze([...new Set(authorIds)])});
  }
  private reviewOriginPhase(events:readonly LedgerEvent[]):WorkflowRecord['phase']|null {
    const transitions=events.filter(e=>e.event_type==='WORKFLOW_TRANSITION').map(e=>({event:e.payload as {event:string;next_phase?:WorkflowRecord['phase']},sequence:e.sequence}));
    const last=transitions.filter(x=>x.event.event==='ADVANCE_PHASE'&&x.event.next_phase==='REVIEWING').at(-1);if(!last)return null;
    const prior=[...transitions].reverse().find(x=>x.sequence<last.sequence);return prior?.event.next_phase??(events[0]!.payload as WorkflowRecord).phase;
  }
  private currentReview(events:readonly LedgerEvent[],artifact:NonNullable<ReturnType<WorkflowLedger['currentArtifact']>>):LedgerEvent|null {
    return [...events].reverse().find(e=>e.event_type==='ARTIFACT_REVIEWED'&&e.sequence>artifact.latest_authorship_sequence&&(()=>{const p=e.payload as {artifact_sha256:string;diff_sha256:string;fixture_id:string};return p.artifact_sha256===artifact.artifact_sha256&&p.diff_sha256===artifact.diff_sha256&&p.fixture_id===artifact.fixture_id;})())??null;
  }
  private reviewIndependent(events:readonly LedgerEvent[],artifact:NonNullable<ReturnType<WorkflowLedger['currentArtifact']>>,review:LedgerEvent):boolean {
    const p=review.payload as {invocation_id:string;outcome:'APPROVED'|'CHANGES_REQUESTED';identity_sha256:string};const invocations=this.invocationsFrom(events);const reviewer=invocations.find(i=>i.invocation_id===p.invocation_id);
    if(p.outcome!=='APPROVED'||!reviewer||reviewer.role!=='REVIEWER'||reviewer.state!=='SUCCEEDED'||p.identity_sha256!==canonicalHash(reviewer.identity)||artifact.author_ids.length===0||artifact.author_ids.includes(p.invocation_id))return false;
    return artifact.author_ids.every(id=>{const author=invocations.find(i=>i.invocation_id===id);return !!author&&author.state==='SUCCEEDED'&&evaluateIndependentReview(author.identity,reviewer.identity,{reviewerInvocationId:p.invocation_id,artifactAuthorInvocationIds:artifact.author_ids}).allowed;});
  }
  private currentValidation(events:readonly LedgerEvent[],artifact:NonNullable<ReturnType<WorkflowLedger['currentArtifact']>>,reviewEvent:LedgerEvent|null):LedgerEvent|null {
    if(!reviewEvent)return null;
    return [...events].reverse().find(e=>e.event_type==='HOST_EVIDENCE'&&e.sequence>reviewEvent.sequence&&(()=>{const p=e.payload as {kind:string;artifact_sha256?:string;diff_sha256?:string;fixture_id:string};return p.kind==='VALIDATION'&&p.artifact_sha256===artifact.artifact_sha256&&p.diff_sha256===artifact.diff_sha256&&p.fixture_id===artifact.fixture_id;})())??null;
  }
  private gateBasis(events:readonly LedgerEvent[],gate:'REVIEW-GATE'|'ValidationGate'):string {
    const artifact=this.currentArtifact(events);if(!artifact)return canonicalHash({artifact:null,review:null,validation:null});
    const review=this.currentReview(events,artifact);const validation=this.currentValidation(events,artifact,review);
    return canonicalHash({gate,artifact,review:review?.payload??null,validation:gate==='ValidationGate'?validation?.payload??null:null});
  }
  private gateEvidence(events:readonly LedgerEvent[],gate:'REVIEW-GATE'|'ValidationGate',fixtureId:string):string[] {
    const artifact=this.currentArtifact(events);if(!artifact||artifact.fixture_id!==fixtureId)return [];
    const workflow=this.projectEvents(events);const reviewOrigin=this.reviewOriginPhase(events);
    if(gate==='REVIEW-GATE'&&(workflow.phase!=='REVIEWING'||!reviewOrigin||artifact.phase!==reviewOrigin))return [];
    if(gate==='ValidationGate'&&(workflow.phase!=='VALIDATING'||artifact.phase!=='EXECUTING'))return [];
    const review=this.currentReview(events,artifact);if(!review||!this.reviewIndependent(events,artifact,review))return [];
    if(gate==='REVIEW-GATE')return [canonicalHash({artifact_sha256:artifact.artifact_sha256,diff_sha256:artifact.diff_sha256,authorship_sequence:artifact.latest_authorship_sequence,author_ids:artifact.author_ids,review_sequence:review.sequence,review_sha256:(review.payload as {review_sha256:string}).review_sha256})];
    const validation=this.currentValidation(events,artifact,review);if(!validation)return [];
    const p=validation.payload as {result:'PASS'|'FAIL';invocation_id:string;evidence_sha256:string};const validator=this.invocationsFrom(events).find(i=>i.invocation_id===p.invocation_id);
    if(p.result!=='PASS'||!validator||validator.state!=='SUCCEEDED'||validator.role!=='VALIDATOR')return [];
    return [canonicalHash({artifact_sha256:artifact.artifact_sha256,diff_sha256:artifact.diff_sha256,review_sha256:(review.payload as {review_sha256:string}).review_sha256,validation_sha256:p.evidence_sha256,validation_invocation_id:validator.invocation_id})];
  }
  private gateIsCurrent(events:readonly LedgerEvent[],gate:NonNullable<ReturnType<WorkflowLedger['latestGate']>>,workflow:WorkflowRecord,name:string):boolean {
    const record=[...events].reverse().find(e=>e.event_type==='GATE_DECISION'&&(e.payload as {gate?:string}).gate===name);if(!record)return false;
    const p=record.payload as {phase?:string;revision_cycles?:number;correction_cycles?:number;basis_sha256?:string;evidence_sha256?:string;fixture_id?:string;authorization_id:string};
    const fixture=p.fixture_id??'';
    return p.authorization_id===workflow.authorization_id&&p.phase===workflow.phase&&p.revision_cycles===workflow.revision_cycles&&p.correction_cycles===workflow.correction_cycles&&p.basis_sha256===this.gateBasis(events,name as 'REVIEW-GATE'|'ValidationGate')&&p.evidence_sha256===canonicalHash(this.gateEvidence(events,name as 'REVIEW-GATE'|'ValidationGate',fixture))&&!!gate.proof;
  }
  private hasCurrentSuccessfulEvidence(events:readonly LedgerEvent[]):boolean {
    const artifact=this.currentArtifact(events);if(!artifact||artifact.fixture_id!==this.options.fixture_id||artifact.phase!=='EXECUTING')return false;
    const invocations=this.invocationsFrom(events);if(!artifact.author_ids.some(id=>invocations.find(i=>i.invocation_id===id)?.role==='IMPLEMENTER'))return false;
    const review=this.currentReview(events,artifact);if(!review||!this.reviewIndependent(events,artifact,review))return false;
    const validation=this.currentValidation(events,artifact,review);if(!validation)return false;
    const p=validation.payload as {result:'PASS'|'FAIL';invocation_id:string};const validator=invocations.find(i=>i.invocation_id===p.invocation_id);
    return p.result==='PASS'&&!!validator&&validator.state==='SUCCEEDED'&&validator.role==='VALIDATOR';
  }
  private cancelActiveInvocation(events:readonly LedgerEvent[],workflowId:string,last:LedgerEvent,reason?:string):void {
    let seq=last.sequence+1,hash=last.event_hash;
    for(const invocation of this.invocationsFrom(events).filter(i=>['CREATED','STARTING','RUNNING'].includes(i.state))){
      const context={observedAt:this.nowIso(),duration_limit_exceeded:reason==='INVOCATION_DURATION_LIMIT_EXCEEDED'};const record=transitionInvocation(invocation,'CANCEL',context);
      const event=this.writeEvent(workflowId,seq++,'INVOCATION_TRANSITION',{invocation_id:invocation.invocation_id,event:'CANCEL',context,record},hash);hash=event.event_hash;
    }
  }
  create(workflow:WorkflowRecord):LedgerEvent {
    if(workflow.state!=='CREATED'||workflow.phase!=='NONE')throw Error('INITIAL_WORKFLOW_REQUIRED');
    if(!this.validator.validate('Workflow',workflow).valid)throw Error('INVALID_WORKFLOW');
    const dir=this.dir(workflow.workflow_id);fs.mkdirSync(dir,{recursive:false,mode:0o700});fs.mkdirSync(path.join(dir,'events'),{mode:0o700});
    return this.writeEvent(workflow.workflow_id,0,'WORKFLOW_CREATED',workflow,LEDGER_GENESIS);
  }
  private writeEvent(id:string,sequence:number,event_type:string,payload:unknown,previous_event_hash:string):LedgerEvent {
    const body={event_id:'evt-'+randomUUID(),workflow_id:id,sequence,event_type,payload,observed_at:this.nowIso(),previous_event_hash};
    const event={...body,event_hash:canonicalHash(body)};
    const file=path.join(this.eventsDir(id),String(sequence).padStart(8,'0')+'.json');
    const temp=path.join(this.eventsDir(id),'.pending-'+randomUUID()+'.tmp');let fd:number|undefined;
    try{fd=fs.openSync(temp,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(event)+'\n');fs.fsyncSync(fd);fs.closeSync(fd);fd=undefined;fs.linkSync(temp,file);}catch(error){throw new WorkflowLedgerError('LEDGER_APPEND_FAILED',error instanceof Error?error.message:'Ledger append failed');}finally{if(fd!==undefined)try{fs.closeSync(fd);}catch{}try{fs.unlinkSync(temp);}catch{}}
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
        let owner:{nonce?:unknown;identity?:import('../contracts/types.js').ProcessIdentity};try{owner=JSON.parse(fs.readFileSync(lock,'utf8')) as typeof owner;}catch{throw new WorkflowLedgerError('LEDGER_LOCK_MALFORMED');}
        if(typeof owner.nonce!=='string'||!owner.nonce||!owner.identity||!Number.isSafeInteger(owner.identity.pid)||owner.identity.pid<1||typeof owner.identity.process_start_token!=='string'||!owner.identity.process_start_token||(owner.identity.executable!==undefined&&typeof owner.identity.executable!=='string'))throw new WorkflowLedgerError('LEDGER_LOCK_MALFORMED');
        if(processAlive(owner.identity))throw Error('LEDGER_LOCKED');
        const archived=lock+'.abandoned-'+owner.nonce;if(fs.existsSync(archived))throw Error('LEDGER_STALE_LOCK_ARCHIVE_EXISTS');
        fs.renameSync(lock,archived);
      }finally{fs.closeSync(recoveryFd);try{fs.unlinkSync(recovery);}catch{}}
      try{fd=fs.openSync(lock,'wx',0o600);}catch{throw Error('LEDGER_LOCKED');}
    }
    try{fs.writeFileSync(fd,JSON.stringify({nonce:randomUUID(),identity:processIdentity(process.pid)}));fs.fsyncSync(fd);this.removeAbandonedTemps(id);return operation(this.verify(id));}
    finally{try{fs.closeSync(fd!);}catch{}try{fs.unlinkSync(lock);}catch{}}
  }
  private removeAbandonedTemps(id:string):void {for(const name of fs.readdirSync(this.eventsDir(id)).filter(n=>n.startsWith('.pending-')&&n.endsWith('.tmp'))){const file=path.join(this.eventsDir(id),name);const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw new WorkflowLedgerError('LEDGER_TEMP_UNTRUSTED');fs.unlinkSync(file);}}
  append(id:string,event_type:string,payload:unknown):LedgerEvent {
    if(['WORKFLOW_TRANSITION','INVOCATION_RESERVED','INVOCATION_CREATED','INVOCATION_TRANSITION','AGENT_MESSAGE','EFFECT_INTENT','EFFECT_TRANSITION','AUTHORIZATION_RECORDED','AUTHORIZATION_REVOKED','AUTHORIZATION_SELECTED','ARTIFACT_AUTHORED','ARTIFACT_REVIEWED','GATE_DECISION','HOST_EVIDENCE','INVOCATION_OBSERVATION','FINAL_APPROVAL_RECORDED','P1_PR_GATE_VERIFIED'].includes(event_type))throw Error('USE_TYPED_LEDGER_API');
    return this.withLock(id,events=>{
      const last=events.at(-1)!;
      return this.writeEvent(id,last.sequence+1,event_type,payload,last.event_hash);
    });
  }
  transitionWorkflowEvent(id:string,event:string,context:NonNullable<Parameters<typeof transitionWorkflow>[2]>):LedgerEvent {
    if(event==='REVOKE')throw Error('USE_REVOCATION_API');
    if(event==='APPROVE')throw new WorkflowLedgerError('USE_FINAL_APPROVAL_API');
    return this.withLock(id,events=>{
      const prior=this.projectEvents(events);let effective={...context};
      if(['START','ADVANCE_PHASE','RETURN_FOR_CORRECTION','REQUEST_FINAL_APPROVAL'].includes(event)){
        if(event==='START')try{this.assertCurrentAuthorization(events);}catch(error){if(error instanceof WorkflowLedgerError&&error.code==='AUTHORIZATION_EXPIRED')this.blockExpiredWorkflow(events);throw error;}
        else this.assertProgress(events);
      }
      if(event==='RESUME')this.assertCurrentAuthorization(events);
      if(['AUTHORIZE','RESUME','START','ADVANCE_PHASE','RETURN_FOR_CORRECTION','REQUEST_FINAL_APPROVAL'].includes(event)){
        const auth=event==='AUTHORIZE'?this.latestAvailableAuthorization(events):this.assertCurrentAuthorization(events);const proof=auth.proof;
        effective={...effective,authorizationProof:proof,authorizationValid:true,authorizationId:auth.record.authorization_id};
      }
      const nextPhase=event==='ADVANCE_PHASE'||event==='RETURN_FOR_CORRECTION'?context.nextPhase:null;
      const reviewOrigin=this.reviewOriginPhase(events);
      const requiredGate=event==='START'?'TASK-READY':event==='ADVANCE_PHASE'&&prior.phase==='REVIEWING'&&['EXECUTING','VALIDATING'].includes(nextPhase??'')?'REVIEW-GATE':event==='REQUEST_FINAL_APPROVAL'?'ValidationGate':null;
      if(requiredGate){const gate=this.latestGate(events,requiredGate);if(!gate?.proof||gate.authorization_id!==this.assertCurrentAuthorization(events).record.authorization_id||(requiredGate!=='TASK-READY'&&!this.gateIsCurrent(events,gate,prior,requiredGate)))throw new WorkflowLedgerError('HOST_GATE_REQUIRED:'+requiredGate);effective={...effective,gatesReady:true,phaseGatePassed:true,gateProof:gate.proof};}
      if(event==='ADVANCE_PHASE'&&prior.phase==='REVIEWING'&&((reviewOrigin==='PLANNING'&&nextPhase!=='EXECUTING')||(reviewOrigin==='EXECUTING'&&nextPhase!=='VALIDATING')||!['PLANNING','EXECUTING'].includes(reviewOrigin??'')))throw new WorkflowLedgerError('REVIEW_PHASE_ORIGIN_INVALID');
      if(event==='RETURN_FOR_CORRECTION'){
        const artifact=this.currentArtifact(events);const review=artifact&&this.currentReview(events,artifact);const validation=artifact&&review&&this.currentValidation(events,artifact,review);
        const validReviewReturn=prior.phase==='REVIEWING'&&reviewOrigin!==null&&nextPhase===reviewOrigin&&!!review&&review.sequence===events.filter(e=>e.event_type==='ARTIFACT_REVIEWED').at(-1)?.sequence&&(review.payload as {outcome:string}).outcome==='CHANGES_REQUESTED';
        const validValidationReturn=prior.phase==='VALIDATING'&&nextPhase==='EXECUTING'&&!!validation&&(validation.payload as {result:string}).result==='FAIL';
        if(!validReviewReturn&&!validValidationReturn)throw new WorkflowLedgerError('CORRECTION_NOT_REQUESTED_BY_GATE');
      }
      if(event==='REQUEST_FINAL_APPROVAL'||event==='CONFIRM_CANCEL'){
        const invocations=this.invocationsFrom(events);const pending=invocations.some(i=>!this.invocationSettled(events,i));
        if(event==='REQUEST_FINAL_APPROVAL'&&!this.hasCurrentSuccessfulEvidence(events))throw Error('CURRENT_SUCCESSFUL_EVIDENCE_REQUIRED');
        const unresolved=this.effectsFrom(events).some(e=>['INTENT_RECORDED','DISPATCHED','OBSERVED','UNKNOWN','RECONCILIATION_REQUIRED'].includes(e.state));
        if(pending||unresolved)throw Error('EFFECTS_OR_PROCESSES_UNRECONCILED');
      }
      const pendingEffects=this.effectsFrom(events).some(e=>['INTENT_RECORDED','DISPATCHED','OBSERVED','UNKNOWN','RECONCILIATION_REQUIRED'].includes(e.state));const pendingProcesses=this.invocationsFrom(events).some(i=>!this.invocationSettled(events,i));
      if(event==='CANCEL'||event==='CANCEL_NO_EFFECT')effective={...effective,noPendingEffects:!pendingEffects&&!pendingProcesses};
      if(event==='CONFIRM_CANCEL')effective={...effective,reconciled:!pendingEffects&&!pendingProcesses};
      if(event==='ADVANCE_PHASE'||event==='RESUME'||event==='START')this.assertNoUnresolvedEffects(events);
      if(event==='RESUME'&&this.invocationsFrom(events).some(i=>!this.invocationSettled(events,i)))throw Error('INVOCATIONS_NEED_RECONCILIATION');
      if(event==='RESUME'&&this.effectsFrom(events).some(e=>e.state!=='CONFIRMED'))throw Error('EFFECTS_NEED_RECONCILIATION');
      if(event==='AUTHORIZE'||event==='RESUME'){
        const proof=effective.authorizationProof!;if(!events.some(e=>e.event_type==='AUTHORIZATION_RECORDED'&&(e.payload as {record:WorkflowAuthorizationRecord}).record.authorization_id===proof.authorization_id))throw Error('AUTHORIZATION_NOT_PERSISTED');
      }
      if(event==='AUTHORIZE'&&!this.latestGate(events,'TASK-READY'))throw new WorkflowLedgerError('TASK_READY_REQUIRED');
      if(event==='RESUME'){
        const taskReady=this.latestGate(events,'TASK-READY');if(!taskReady||taskReady.authorization_id!==this.assertCurrentAuthorization(events).record.authorization_id)throw new WorkflowLedgerError('TASK_READY_REQUIRED');
      }
      if(event==='CONFIRM_FAIL'){
        if(this.invocationsFrom(events).some(i=>!this.invocationSettled(events,i))||this.effectsFrom(events).some(e=>['INTENT_RECORDED','DISPATCHED','OBSERVED','UNKNOWN','RECONCILIATION_REQUIRED'].includes(e.state)))throw Error('FAIL_RECONCILIATION_REQUIRED');
        effective={...effective,reconciled:true};
      }
      const next=transitionWorkflow(prior,event,effective);let last=events.at(-1)!;
      if(event==='ADVANCE_PHASE'||event==='RETURN_FOR_CORRECTION'){
        const auth=this.latestAuthorization(events,effective.authorizationProof?.authorization_id??'');if(!auth)throw Error('AUTHORIZATION_NOT_CURRENT');
        const limits=resolveEffectiveLimits(auth.record.limits);
        if(next.revision_cycles>limits.review_cycles||next.correction_cycles>limits.correction_cycles)throw Error('CYCLE_LIMIT_EXCEEDED');
      }
      let persistedEvent=event;
      if(event==='FAIL'&&(this.invocationsFrom(events).some(i=>!this.invocationSettled(events,i))||this.effectsFrom(events).some(e=>['INTENT_RECORDED','DISPATCHED','OBSERVED','UNKNOWN','RECONCILIATION_REQUIRED'].includes(e.state)))){persistedEvent='FAIL_PENDING';effective={...effective,reason:'FAILURE_RECONCILIATION_REQUIRED'};}
      const persistedNext=persistedEvent===event?next:transitionWorkflow(prior,persistedEvent,effective);
      const transition=this.writeEvent(id,last.sequence+1,'WORKFLOW_TRANSITION',{event:persistedEvent,context:effective,next_state:persistedNext.state,next_phase:persistedNext.phase,authorization_id:persistedNext.authorization_id},last.event_hash);last=transition;
      if(['BLOCK','CANCEL','FAIL_PENDING','REVOKE'].includes(event)||persistedEvent==='FAIL_PENDING')this.cancelActiveInvocation([...events,transition], id, last,context.reason);
      return transition;
    });
  }
  recordAuthorization(record:WorkflowAuthorizationRecord,approval:ApprovalRecord,contract:TaskContract,_callerTimestamp?:string):import('./machine.js').AuthorizationProof {
    return this.withLock(record.workflow_id,events=>{
      const state=this.projectEvents(events).state;if(!['CREATED','BLOCKED'].includes(state))throw Error('AUTHORIZATION_STATE_INVALID');
      const initial=events[0]?.payload as WorkflowRecord|undefined;if(!initial||initial.contract_sha256!==record.contract_sha256||initial.repository!==record.repository||initial.baseline_git!==record.baseline_git||initial.worktree!==record.worktree)throw new WorkflowLedgerError('WORKFLOW_AUTHORIZATION_BINDING_MISMATCH');
      if(events.some(e=>e.event_type==='AUTHORIZATION_RECORDED'&&(e.payload as {record:WorkflowAuthorizationRecord}).record.authorization_id===record.authorization_id))throw Error('AUTHORIZATION_ID_REUSED');
      const trusted=this.options.trusted_approvals??[];
      const old=this.currentAuthorization(events);if(old&&old.record.authorization_id!==record.authorization_id&&old.record.revoked_at===null&&Date.parse(old.record.expires_at)>this.now())throw new WorkflowLedgerError('AUTHORIZATION_REPLACEMENT_REQUIRES_REVOCATION');
      const result=authorizeWorkflow(record,approval,contract,trusted);if(!result.allowed)throw Error('AUTHORIZATION_REJECTED:'+result.reasons.join(','));
      const verifiedAt=this.nowIso();const proof=createAuthorizationProof(record,approval,contract,trusted,verifiedAt);const trust=trusted.find(t=>t.record_sha256===canonicalHash(approval)&&!t.revoked);
      if(!trust)throw Error('TRUSTED_APPROVAL_REQUIRED');
      let last=events.at(-1)!;last=this.writeEvent(record.workflow_id,last.sequence+1,'AUTHORIZATION_RECORDED',{record,approval,contract,trust,proof},last.event_hash);
      const taskReady=createGateProof('TASK-READY',record.workflow_id,record.contract_sha256,{allowed:true,contract_sha256:record.contract_sha256},verifiedAt,'HOST');
      last=this.writeEvent(record.workflow_id,last.sequence+1,'GATE_DECISION',{gate:'TASK-READY',authorization_id:record.authorization_id,allowed:true,proof:taskReady,evidence_sha256:canonicalHash({approval:record.approval_record_sha256,contract:record.contract_sha256,baseline:record.baseline_git})},last.event_hash);
      if(state==='BLOCKED')this.writeEvent(record.workflow_id,last.sequence+1,'AUTHORIZATION_SELECTED',{authorization_id:record.authorization_id,workflow_id:record.workflow_id},last.event_hash);
      return proof;
    });
  }
  revokeAuthorization(workflowId:string,authorizationId:string,_untrustedTimestamp?:string):LedgerEvent {
    return this.withLock(workflowId,events=>{
      const state=this.projectEvents(events);if(state.authorization_id!==authorizationId)throw Error('AUTHORIZATION_BINDING_MISMATCH');
      const revokedAt=this.nowIso();
      if(!['AUTHORIZED','ACTIVE','AWAITING_APPROVAL','BLOCKED'].includes(state.state))throw Error('REVOCATION_NOT_ALLOWED');
      const current=this.latestAuthorization(events,authorizationId);if(!current||current.record.revoked_at!==null)throw Error('AUTHORIZATION_NOT_CURRENT');
      const revoked={...current.record,revoked_at:revokedAt};let last=events.at(-1)!;
      const revocation=this.writeEvent(workflowId,last.sequence+1,'AUTHORIZATION_REVOKED',{authorization_id:authorizationId,workflow_id:workflowId,revoked_at:revokedAt,record:revoked,proof:current.proof},last.event_hash);last=revocation;
      transitionWorkflow(state,'REVOKE');
      this.cancelActiveInvocation([...events,revocation],workflowId,revocation);
      return revocation;
    });
  }
  reserveInvocation(id:string,invocationId:string,limits:WorkflowLimits):LedgerEvent {
    return this.withLock(id,events=>{
      const auth=this.assertProgress(events);
      this.assertNoUnresolvedEffects(events);
      if(canonicalHash(auth.record.limits)!==canonicalHash(limits))throw Error('AUTHORIZATION_LIMITS_MISMATCH');
      const existing=events.find(e=>e.event_type==='INVOCATION_RESERVED'&&(e.payload as {invocation_id?:string}).invocation_id===invocationId);if(existing)return existing;
      const count=events.filter(e=>e.event_type==='INVOCATION_RESERVED').length;const effective=resolveEffectiveLimits(limits);
      if(count>=effective.invocations)throw Error('INVOCATION_LIMIT_EXCEEDED');
      const last=events.at(-1)!;return this.writeEvent(id,last.sequence+1,'INVOCATION_RESERVED',{invocation_id:invocationId,reservation_number:count+1,limit:effective.invocations},last.event_hash);
    });
  }
  createEffectIntent(workflowId:string,invocationId:string,operation:string,payload:unknown,targetPath?:string):EffectRecord {
    return this.withLock(workflowId,events=>{
      const current=this.assertProgress(events);
      this.assertNoUnresolvedEffects(events);
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation||invocation.state!=='RUNNING'||invocation.identity.status!=='VERIFIED')throw Error('INVOCATION_NOT_RUNNING_OR_VERIFIED');
      if(!['READ','WRITE','TEST','LOCAL_COMMIT'].includes(operation))throw Error('OPERATION_NOT_IN_P2_POLICY');
      const forbidden=current.contract.scope.forbidden_changes;
      const allowed=checkAuthorization(current.record,{workflow_id:workflowId,contract_sha256:current.record.contract_sha256,repository:current.record.repository,baseline_git:current.record.baseline_git,worktree:current.record.worktree},this.nowIso(),operation,invocation.identity,targetPath,forbidden);
      if(!allowed.allowed)throw new WorkflowLedgerError('EFFECT_UNAUTHORIZED:'+allowed.reasons.join(','));
      let sandboxBinding:string|null=null;
      if(['WRITE','LOCAL_COMMIT'].includes(operation)){
        const key=canonicalAgentAuthorizationId(invocation.identity),profile=this.options.sandbox_profiles?.[key];
        if(!profile)throw new WorkflowLedgerError('SANDBOX_PROFILE_NOT_CONFIGURED');
        const expected={provider_id:invocation.identity.provider_id,product:invocation.identity.product,version:invocation.identity.version??'',...profile};
        const candidate=(this.options.sandbox_validations??[]).find(p=>canonicalHash({provider_id:p.provider_id,product:p.product,version:p.version,configuration_hash:p.configuration_hash,profile_hash:p.profile_hash,permissions_hash:p.permissions_hash,evidence_hash:p.evidence_hash})===canonicalHash(expected));
        if(!candidate||!evaluateSandboxProof(candidate,expected,this.nowIso()).allowed)throw new WorkflowLedgerError('SANDBOX_PROOF_REQUIRED');sandboxBinding=canonicalHash(candidate);
      }
      const effect=createEffectIntent(workflowId,invocationId,current.record.authorization_id,operation,targetPath??null,sandboxBinding,payload,this.nowIso());if(events.some(e=>e.event_type==='EFFECT_INTENT'&&(e.payload as EffectRecord).effect_id===effect.effect_id))throw Error('DUPLICATE_EFFECT_ID');
      const last=events.at(-1)!;this.writeEvent(workflowId,last.sequence+1,'EFFECT_INTENT',effect,last.event_hash);return effect;
    });
  }
  transitionEffect(workflowId:string,effectId:string,event:'DISPATCH'|'OBSERVED'|'UNKNOWN'|'CONFIRM'|'BLOCK'):EffectRecord {
    return this.withLock(workflowId,events=>{
      const current=this.effectsFrom(events).find(e=>e.effect_id===effectId);if(!current)throw Error('EFFECT_NOT_FOUND');
      if(event==='DISPATCH'){
        const auth=this.assertProgress(events);
        if(auth.record.authorization_id!==current.authorization_id)throw new WorkflowLedgerError('AUTHORIZATION_NOT_CURRENT');
        const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===current.invocation_id);if(!invocation||invocation.state!=='RUNNING')throw Error('INVOCATION_NOT_RUNNING');
        const allowed=checkAuthorization(auth.record,{workflow_id:workflowId,contract_sha256:auth.record.contract_sha256,repository:auth.record.repository,baseline_git:auth.record.baseline_git,worktree:auth.record.worktree},this.nowIso(),current.operation,invocation.identity,current.target_path??undefined,auth.contract.scope.forbidden_changes);
        if(!allowed.allowed)throw new WorkflowLedgerError('EFFECT_UNAUTHORIZED:'+allowed.reasons.join(','));
        if(['WRITE','LOCAL_COMMIT'].includes(current.operation)){
          const key=canonicalAgentAuthorizationId(invocation.identity),profile=this.options.sandbox_profiles?.[key],proof=(this.options.sandbox_validations??[]).find(p=>canonicalHash(p)===current.sandbox_binding_sha256);
          if(!profile||!proof||!evaluateSandboxProof(proof,{provider_id:invocation.identity.provider_id,product:invocation.identity.product,version:invocation.identity.version??'',...profile},this.nowIso()).allowed)throw new WorkflowLedgerError('SANDBOX_PROOF_REQUIRED');
        }
      }
      if(event==='DISPATCH'&&current.state!=='INTENT_RECORDED')throw Error('EFFECT_REDISPATCH_FORBIDDEN');
      const next=reconcileEffect(current,event,event==='DISPATCH'?null:this.nowIso());const last=events.at(-1)!;
      this.writeEvent(workflowId,last.sequence+1,'EFFECT_TRANSITION',{effect_id:effectId,event,record:next},last.event_hash);return next;
    });
  }
  markDispatchedEffectsUncertain(workflowId:string):readonly EffectRecord[] {
    return this.withLock(workflowId,events=>{
      const pending=this.effectsFrom(events).filter(e=>e.state==='DISPATCHED'||e.state==='INTENT_RECORDED');const updated:EffectRecord[]=[];let last=events.at(-1)!;
      for(const effect of pending){const next=reconcileEffect(effect,'UNKNOWN',this.nowIso());last=this.writeEvent(workflowId,last.sequence+1,'EFFECT_TRANSITION',{effect_id:effect.effect_id,event:'UNKNOWN',record:next},last.event_hash);updated.push(next);}
      return Object.freeze(updated);
    });
  }
  recover(workflowId:string):{readonly state:WorkflowRecord['state'];readonly pending_invocations:readonly string[];readonly pending_effects:readonly string[]} {
    let events=this.verify(workflowId);let workflow=this.projectEvents(events);
    const terminal=['COMPLETED','FAILED','REJECTED','CANCELLED'].includes(workflow.state);
    const effects=this.effectsFrom(events);if(!terminal&&effects.some(e=>e.state==='INTENT_RECORDED'||e.state==='DISPATCHED'))this.markDispatchedEffectsUncertain(workflowId);
    events=this.verify(workflowId);workflow=this.projectEvents(events);
    const pendingInvocations=this.invocationsFrom(events).filter(i=>!this.invocationSettled(events,i)).map(i=>i.invocation_id);
    const pendingEffects=this.effectsFrom(events).filter(e=>e.state!=='CONFIRMED').map(e=>e.effect_id);
    if((pendingInvocations.length||pendingEffects.length)&&!terminal&&workflow.state==='ACTIVE')this.transitionWorkflowEvent(workflowId,'BLOCK',{reason:'RECOVERY_RECONCILIATION_REQUIRED'});
    events=this.verify(workflowId);workflow=this.projectEvents(events);
    if((pendingInvocations.length||pendingEffects.length)&&!events.some(e=>e.event_type==='WORKFLOW_RECOVERY_REQUIRED'))this.append(workflowId,'WORKFLOW_RECOVERY_REQUIRED',{pending_invocation_ids:pendingInvocations,pending_effect_ids:pendingEffects,terminal_state:terminal?workflow.state:null,observed_at:this.nowIso()});
    return Object.freeze({state:workflow.state,pending_invocations:Object.freeze(pendingInvocations),pending_effects:Object.freeze(pendingEffects)});
  }
  appendInvocation(invocation:AgentInvocationRecord,observation?:AdapterIdentityObservation):LedgerEvent {
    return this.withLock(invocation.workflow_id,events=>{
      if(!this.validator.validate('AgentInvocation',invocation).valid||invocation.state!=='CREATED')throw Error('INVALID_INVOCATION');
      const auth=this.assertProgress(events);const catalog=this.options.model_catalog;if(!catalog||!observation)throw new WorkflowLedgerError('HOST_IDENTITY_OBSERVATION_REQUIRED');
      if(!this.options.fixture_id)throw new WorkflowLedgerError('REAL_ADAPTER_NOT_ENABLED_IN_P2_001');
      const {catalog_hash:_claimedHash,...declared}=invocation.identity;
      const resolved=resolveIdentity({...declared,status:'DECLARED'},catalog,observation);
      if(resolved.status!=='VERIFIED'||resolved.catalog_hash!==catalog.catalog_hash)throw new WorkflowLedgerError('AGENT_IDENTITY_NOT_VERIFIED');
      if(!auth.record.allowed_agents.includes(canonicalAgentAuthorizationId(resolved)))throw new WorkflowLedgerError('AGENT_NOT_AUTHORIZED');
      const hostInvocation={...invocation,identity:resolved};
      const prior=this.invocationsFrom(events);
      if(prior.some(i=>i.invocation_id===invocation.invocation_id))throw Error('DUPLICATE_INVOCATION');
      if(prior.some(i=>['STARTING','RUNNING','CANCEL_REQUESTED'].includes(i.state)))throw Error('ACTIVE_INVOCATION_EXISTS');
      if(!events.some(e=>e.event_type==='INVOCATION_RESERVED'&&(e.payload as {invocation_id?:string}).invocation_id===invocation.invocation_id))throw Error('INVOCATION_NOT_RESERVED');
      const last=events.at(-1)!;return this.writeEvent(invocation.workflow_id,last.sequence+1,'INVOCATION_CREATED',hostInvocation,last.event_hash);
    });
  }
  recordFixtureInvocationObservation(workflowId:string,invocationId:string,kind:'PROCESS_STARTED'|'PROCESS_STOPPED'|'TERMINAL_RESULT',evidenceSha256:string,fixtureId:string):LedgerEvent {
    if(!this.options.fixture_id||fixtureId!==this.options.fixture_id)throw new WorkflowLedgerError('FIXTURE_AUTHORITY_REQUIRED');
    if(!/^[a-f0-9]{64}$/.test(evidenceSha256))throw new WorkflowLedgerError('OBSERVATION_EVIDENCE_REQUIRED');
    return this.withLock(workflowId,events=>{
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation)throw new WorkflowLedgerError('INVOCATION_NOT_FOUND');
      if(kind==='PROCESS_STOPPED'||kind==='PROCESS_STARTED'||kind==='TERMINAL_RESULT'){
        const workflow=this.projectEvents(events);if(workflow.state!=='ACTIVE'&&(!['CANCEL_REQUESTED','BLOCKED','CANCELLED','FAILED','REJECTED','COMPLETED'].includes(workflow.state)||!['CANCEL_REQUESTED','RUNNING','STARTING'].includes(invocation.state)))throw new WorkflowLedgerError('CONTAINMENT_NOT_ALLOWED');
      }else this.assertProgress(events);
      const last=events.at(-1)!;return this.writeEvent(workflowId,last.sequence+1,'INVOCATION_OBSERVATION',{invocation_id:invocationId,kind,evidence_sha256:evidenceSha256,fixture_id:fixtureId,observed_at:this.nowIso()},last.event_hash);
    });
  }
  transitionInvocation(workflowId:string,invocationId:string,event:string,_untrustedContext:Parameters<typeof transitionInvocation>[2]={}):LedgerEvent {
    return this.withLock(workflowId,events=>{
      const current=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!current)throw Error('INVOCATION_NOT_FOUND');
      void _untrustedContext;
      const workflow=this.projectEvents(events);const authorization=this.latestAuthorization(events,workflow.authorization_id??'');
      const revoked=!!authorization&&authorization.record.revoked_at!==null;const containment=['PROCESS_STARTED','CONFIRM_CANCEL','RESULT_UNCERTAIN','RESULT_FAILURE','INTERRUPTED'].includes(event);
      if(revoked&&!containment)throw new WorkflowLedgerError('AUTHORIZATION_REVOKED');
      if(workflow.state!=='ACTIVE'&&!containment)throw new WorkflowLedgerError('WORKFLOW_NOT_ACTIVE');
      if(['START','RESULT_SUCCESS'].includes(event)||(event==='PROCESS_STARTED'&&workflow.state==='ACTIVE'))this.assertProgress(events);
      if(event==='START'&&!this.options.fixture_id)throw new WorkflowLedgerError('REAL_ADAPTER_NOT_ENABLED_IN_P2_001');
      const observations=events.filter(e=>e.event_type==='INVOCATION_OBSERVATION'&&(e.payload as {invocation_id:string}).invocation_id===invocationId).map(e=>e.payload as {kind:string;evidence_sha256:string;fixture_id:string});
      const processStarted=observations.some(o=>o.kind==='PROCESS_STARTED'&&o.fixture_id===this.options.fixture_id);
      const processStopped=observations.some(o=>o.kind==='PROCESS_STOPPED'&&o.fixture_id===this.options.fixture_id);
      const terminalResult=observations.some(o=>o.kind==='TERMINAL_RESULT'&&o.fixture_id===this.options.fixture_id);
      if(event==='PROCESS_STARTED'&&!processStarted)throw new WorkflowLedgerError('HOST_PROCESS_OBSERVATION_REQUIRED');
      if(['CONFIRM_CANCEL','RESULT_UNCERTAIN','RESULT_FAILURE','INTERRUPTED'].includes(event)&&!processStopped)throw new WorkflowLedgerError('PROCESS_RECONCILIATION_REQUIRED');
      if(event==='RESULT_SUCCESS'&&(!processStopped||!terminalResult))throw new WorkflowLedgerError('HOST_RESULT_EVIDENCE_REQUIRED');
      if(event==='BLOCK'&&current.state!=='CREATED'&&!processStopped)throw new WorkflowLedgerError('PROCESS_RECONCILIATION_REQUIRED');
      const effectiveContext={observedAt:this.nowIso(),processObservedStopped:processStopped,processNeverStarted:event==='BLOCK'&&current.state==='CREATED',terminalResultValid:terminalResult,identityValid:current.identity.status==='VERIFIED',protocolValid:terminalResult,evidenceObserved:observations.some(o=>o.kind==='TERMINAL_RESULT'),revocationPending:revoked};
      const next=transitionInvocation(current,event,effectiveContext);const last=events.at(-1)!;
      return this.writeEvent(workflowId,last.sequence+1,'INVOCATION_TRANSITION',{invocation_id:invocationId,event,context:effectiveContext,record:next},last.event_hash);
    });
  }
  recordArtifactAuthorship(workflowId:string,artifactHash:string,invocationId:string,artifactPath:string,fixtureId:string,diffSha256=artifactHash):LedgerEvent {
    return this.withLock(workflowId,events=>{
      if(!this.options.fixture_id||fixtureId!==this.options.fixture_id)throw new WorkflowLedgerError('FIXTURE_AUTHORITY_REQUIRED');
      const auth=this.assertProgress(events);if(!/^[a-f0-9]{64}$/.test(artifactHash)||!/^[a-f0-9]{64}$/.test(diffSha256))throw Error('INVALID_ARTIFACT_HASH');
      const workflow=this.projectEvents(events);const expectedRole=workflow.phase==='PLANNING'?'PLANNER':workflow.phase==='EXECUTING'?'IMPLEMENTER':null;
      const phaseEntry=this.phaseEntrySequence(events,workflow.phase);
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!expectedRole||!invocation||invocation.state!=='SUCCEEDED'||invocation.role!==expectedRole||invocation.identity.status!=='VERIFIED')throw Error('ARTIFACT_AUTHOR_NOT_VALIDATED');
      const invocationCreated=events.find(e=>e.event_type==='INVOCATION_CREATED'&&(e.payload as AgentInvocationRecord).invocation_id===invocationId);
      if(!invocationCreated||invocationCreated.sequence<=phaseEntry||events.some(e=>e.event_type==='INVOCATION_TRANSITION'&&(e.payload as {invocation_id:string;event:string}).invocation_id===invocationId&&(e.payload as {event:string}).event==='START'&&e.sequence<=phaseEntry))throw new WorkflowLedgerError('ARTIFACT_AUTHOR_PHASE_INVALID');
      const check=checkAuthorization(auth.record,{workflow_id:workflowId,contract_sha256:auth.record.contract_sha256,repository:auth.record.repository,baseline_git:auth.record.baseline_git,worktree:auth.record.worktree},this.nowIso(),'WRITE',invocation.identity,artifactPath,auth.contract.scope.forbidden_changes);if(!check.allowed)throw new WorkflowLedgerError('ARTIFACT_PATH_UNAUTHORIZED:'+check.reasons.join(','));
      const last=events.at(-1)!;return this.writeEvent(workflowId,last.sequence+1,'ARTIFACT_AUTHORED',{artifact_sha256:artifactHash,diff_sha256:diffSha256,artifact_path:artifactPath,invocation_id:invocationId,fixture_id:fixtureId,phase:workflow.phase,phase_entry_sequence:phaseEntry},last.event_hash);
    });
  }
  recordArtifactReview(workflowId:string,artifactHash:string,invocationId:string,fixtureId:string,reviewSha256=artifactHash,outcome:'APPROVED'|'CHANGES_REQUESTED'='APPROVED'):LedgerEvent {
    return this.withLock(workflowId,events=>{
      if(!this.options.fixture_id||fixtureId!==this.options.fixture_id)throw new WorkflowLedgerError('FIXTURE_AUTHORITY_REQUIRED');
      this.assertProgress(events);
      const workflow=this.projectEvents(events);const origin=this.reviewOriginPhase(events);
      if(workflow.phase!=='REVIEWING'||!origin)throw new WorkflowLedgerError('REVIEW_PHASE_REQUIRED');
      if(!/^[a-f0-9]{64}$/.test(artifactHash)||!/^[a-f0-9]{64}$/.test(reviewSha256))throw Error('INVALID_ARTIFACT_HASH');
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation||invocation.state!=='SUCCEEDED'||invocation.role!=='REVIEWER'||invocation.identity.status!=='VERIFIED')throw Error('REVIEWER_NOT_VALIDATED');
      const artifact=this.currentArtifact(events);if(!artifact||artifact.artifact_sha256!==artifactHash||artifact.fixture_id!==fixtureId||artifact.phase!==origin)throw new WorkflowLedgerError('ARTIFACT_NOT_CURRENT');
      const reviewInvocationCreated=events.find(e=>e.event_type==='INVOCATION_CREATED'&&(e.payload as AgentInvocationRecord).invocation_id===invocationId);if(!reviewInvocationCreated||reviewInvocationCreated.sequence<=artifact.latest_authorship_sequence||reviewInvocationCreated.sequence<=this.phaseEntrySequence(events,'REVIEWING'))throw new WorkflowLedgerError('REVIEW_NOT_AFTER_AUTHORSHIP');
      const authors=[...artifact.author_ids];if(!authors.length||authors.includes(invocationId))throw new WorkflowLedgerError('REVIEW_NOT_INDEPENDENT');
      for(const id of authors){const author=this.invocationsFrom(events).find(i=>i.invocation_id===id);if(!author||!evaluateIndependentReview(author.identity,invocation.identity,{reviewerInvocationId:invocationId,artifactAuthorInvocationIds:authors}).allowed)throw new WorkflowLedgerError('REVIEW_NOT_INDEPENDENT');}
      const last=events.at(-1)!;return this.writeEvent(workflowId,last.sequence+1,'ARTIFACT_REVIEWED',{artifact_sha256:artifact.artifact_sha256,diff_sha256:artifact.diff_sha256,review_sha256:reviewSha256,invocation_id:invocationId,fixture_id:fixtureId,identity_sha256:canonicalHash(invocation.identity),outcome},last.event_hash);
    });
  }
  recordFixtureEvidence(workflowId:string,kind:'VALIDATION'|'FINAL',invocationId:string,evidenceSha256:string,fixtureId:string,result:'PASS'|'FAIL'='PASS'):LedgerEvent {
    if(!this.options.fixture_id||fixtureId!==this.options.fixture_id)throw new WorkflowLedgerError('FIXTURE_AUTHORITY_REQUIRED');
    return this.withLock(workflowId,events=>{this.assertProgress(events);const workflow=this.projectEvents(events);if(workflow.phase!=='VALIDATING')throw new WorkflowLedgerError('EVIDENCE_PHASE_INVALID');if(!/^[a-f0-9]{64}$/.test(evidenceSha256)||!['PASS','FAIL'].includes(result))throw new WorkflowLedgerError('INVALID_EVIDENCE_HASH');const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===invocationId);if(!invocation||invocation.state!=='SUCCEEDED'||invocation.identity.status!=='VERIFIED')throw new WorkflowLedgerError('EVIDENCE_INVOCATION_UNVERIFIED');if(invocation.role!=='VALIDATOR')throw new WorkflowLedgerError('VALIDATION_ROLE_REQUIRED');const invocationCreated=events.find(e=>e.event_type==='INVOCATION_CREATED'&&(e.payload as AgentInvocationRecord).invocation_id===invocationId);if(!invocationCreated||invocationCreated.sequence<=this.phaseEntrySequence(events,'VALIDATING'))throw new WorkflowLedgerError('VALIDATOR_PHASE_INVALID');if(kind==='FINAL'&&result!=='PASS')throw new WorkflowLedgerError('FINAL_EVIDENCE_MUST_PASS');const artifact=this.currentArtifact(events);if(!artifact||artifact.fixture_id!==fixtureId||artifact.phase!=='EXECUTING')throw new WorkflowLedgerError('EVIDENCE_ARTIFACT_REQUIRED');const review=this.currentReview(events,artifact);if(!review||!this.reviewIndependent(events,artifact,review))throw new WorkflowLedgerError('CURRENT_REVIEW_REQUIRED');const validation=kind==='FINAL'?this.currentValidation(events,artifact,review):null;if(kind==='FINAL'&&(!validation||(validation.payload as {result:string}).result!=='PASS'))throw new WorkflowLedgerError('CURRENT_VALIDATION_REQUIRED');const last=events.at(-1)!;return this.writeEvent(workflowId,last.sequence+1,'HOST_EVIDENCE',{kind,workflow_id:workflowId,invocation_id:invocationId,evidence_sha256:evidenceSha256,artifact_sha256:artifact.artifact_sha256,diff_sha256:artifact.diff_sha256,review_sha256:(review.payload as {review_sha256:string}).review_sha256,...(validation?{validation_sha256:(validation.payload as {evidence_sha256:string}).evidence_sha256}:{}),result,fixture_id:fixtureId},last.event_hash);});
  }
  evaluateGate(workflowId:string,gate:'REVIEW-GATE'|'ValidationGate',fixtureId:string):LedgerEvent {
    if(!this.options.fixture_id||fixtureId!==this.options.fixture_id)throw new WorkflowLedgerError('FIXTURE_AUTHORITY_REQUIRED');
    return this.withLock(workflowId,events=>{
      const auth=this.assertProgress(events);const workflow=this.projectEvents(events);
      if((gate==='REVIEW-GATE'&&workflow.phase!=='REVIEWING')||(gate==='ValidationGate'&&workflow.phase!=='VALIDATING'))throw new WorkflowLedgerError('GATE_PHASE_INVALID');const evidence=this.gateEvidence(events,gate,fixtureId);
      if(!evidence.length)throw new WorkflowLedgerError('GATE_EVIDENCE_INCOMPLETE:'+gate);
      const proof=createGateProof(gate,workflowId,auth.record.contract_sha256,{allowed:true,contract_sha256:auth.record.contract_sha256},this.nowIso(),'SIMULATED_HOST');const last=events.at(-1)!;
      return this.writeEvent(workflowId,last.sequence+1,'GATE_DECISION',{gate,authorization_id:auth.record.authorization_id,allowed:true,proof,evidence_sha256:canonicalHash(evidence),basis_sha256:this.gateBasis(events,gate),phase:workflow.phase,revision_cycles:workflow.revision_cycles,correction_cycles:workflow.correction_cycles,fixture_id:fixtureId},last.event_hash);
    });
  }
  recordFinalApproval(workflowId:string,approval:ApprovalRecord,attemptId:string,reviewId:string,diffSha256:string,reviewSha256:string,evidenceSha256:string,fixtureId?:string):LedgerEvent {
    return this.withLock(workflowId,events=>{
      const workflow=this.projectEvents(events);if(workflow.state!=='AWAITING_APPROVAL')throw new WorkflowLedgerError('FINAL_APPROVAL_STATE_INVALID');
      let auth:NonNullable<ReturnType<WorkflowLedger['currentAuthorization']>>;try{auth=this.assertCurrentAuthorization(events);}catch(error){if(error instanceof WorkflowLedgerError&&error.code==='AUTHORIZATION_EXPIRED')this.blockExpiredWorkflow(events);throw error;}const trusted=this.options.trusted_approvals??[];
      const artifact=this.currentArtifact(events);const reviewed=artifact&&this.currentReview(events,artifact);const validation=artifact&&reviewed&&this.currentValidation(events,artifact,reviewed);
      const evidenceEvent=[...events].reverse().find(e=>e.event_type==='HOST_EVIDENCE'&&(()=>{const p=e.payload as {kind:string;evidence_sha256:string;artifact_sha256?:string;diff_sha256?:string;review_sha256?:string;validation_sha256?:string;result?:string};return p.kind==='FINAL'&&p.evidence_sha256===evidenceSha256&&p.artifact_sha256===artifact?.artifact_sha256&&p.diff_sha256===artifact?.diff_sha256&&p.review_sha256===(reviewed?.payload as {review_sha256:string}|undefined)?.review_sha256&&p.validation_sha256===(validation?.payload as {evidence_sha256:string}|undefined)?.evidence_sha256&&p.result==='PASS';})());
      if(!artifact||artifact.fixture_id!==(fixtureId??this.options.fixture_id)||artifact.diff_sha256!==diffSha256||!reviewed||!this.reviewIndependent(events,artifact,reviewed)||(reviewed.payload as {review_sha256:string}).review_sha256!==reviewSha256||!validation||(validation.payload as {result:string}).result!=='PASS'||!evidenceEvent||!this.hasCurrentSuccessfulEvidence(events))throw new WorkflowLedgerError('FINAL_EVIDENCE_NOT_REGISTERED');
      const authorInvocation=this.invocationsFrom(events).find(i=>artifact.author_ids.includes(i.invocation_id)&&i.role==='IMPLEMENTER'&&i.state==='SUCCEEDED');if(!authorInvocation)throw new WorkflowLedgerError('CURRENT_IMPLEMENTATION_REQUIRED');
      const finalPayload=evidenceEvent.payload as {invocation_id:string};const finalInvocation=this.invocationsFrom(events).find(i=>i.invocation_id===finalPayload.invocation_id);if(!finalInvocation||finalInvocation.state!=='SUCCEEDED'||finalInvocation.identity.status!=='VERIFIED')throw new WorkflowLedgerError('FINAL_EVIDENCE_NOT_REGISTERED');
      const p1=this.options.p1_pr_gate_verifier?.({workflow_id:workflowId,contract_sha256:auth.record.contract_sha256,attempt_id:attemptId,diff_sha256:diffSha256,review_sha256:reviewSha256,evidence_sha256:evidenceSha256,review_id:reviewId});
      if(!p1||!p1.allowed||p1.gate!=='PR-GATE'||p1.execution_id!==workflowId||p1.attempt_id!==attemptId||p1.contract_sha256!==auth.record.contract_sha256)throw new WorkflowLedgerError('P1_PR_GATE_REQUIRED');
      const merge=verifyApproval(auth.contract,approval,{scope:'MERGE',trusted,attempt_id:attemptId,diff_sha256:diffSha256,review_id:reviewId});if(!merge.allowed)throw new WorkflowLedgerError('FINAL_APPROVAL_REJECTED:'+merge.reasons.join(','));
      const simulated=approval.approval_source==='P2_TEST_FIXTURE';if(simulated&&(!this.options.fixture_id||fixtureId!==this.options.fixture_id))throw new WorkflowLedgerError('FIXTURE_AUTHORITY_REQUIRED');if(!simulated&&fixtureId!==undefined)throw new WorkflowLedgerError('FIXTURE_SCOPE_INVALID');
      if(!trusted.some(t=>t.record_sha256===canonicalHash(approval)&&t.authorized_by===approval.authorized_by&&t.approval_source===approval.approval_source&&!t.revoked))throw new WorkflowLedgerError('TRUSTED_APPROVAL_REQUIRED');
      const proof={workflow_id:workflowId,contract_sha256:auth.record.contract_sha256,diff_sha256:diffSha256,review_sha256:reviewSha256,evidence_sha256:evidenceSha256,actor:approval.authorized_by,source:simulated?'SIMULATED_HUMAN' as const:'HUMAN' as const,verified:true as const,approved_at:this.nowIso()};
      const next=projectVerifiedFinalApproval(workflow);let last=events.at(-1)!;
      last=this.writeEvent(workflowId,last.sequence+1,'P1_PR_GATE_VERIFIED',{gate:p1,bindings:{workflow_id:workflowId,contract_sha256:auth.record.contract_sha256,attempt_id:attemptId,diff_sha256:diffSha256,review_sha256:reviewSha256,evidence_sha256:evidenceSha256,review_id:reviewId}},last.event_hash);
      const trust=trusted.find(t=>t.record_sha256===canonicalHash(approval)&&t.authorized_by===approval.authorized_by&&t.approval_source===approval.approval_source&&!t.revoked);
      if(!trust)throw new WorkflowLedgerError('TRUSTED_APPROVAL_REQUIRED');
      last=this.writeEvent(workflowId,last.sequence+1,'FINAL_APPROVAL_RECORDED',{approval,trust,approval_sha256:canonicalHash(approval),proof,fixture_id:simulated?fixtureId:null},last.event_hash);
      return this.writeEvent(workflowId,last.sequence+1,'WORKFLOW_TRANSITION',{event:'APPROVE',context:{approvalValid:true,finalApprovalProof:proof},next_state:next.state,next_phase:next.phase,authorization_id:next.authorization_id},last.event_hash);
    });
  }
  reviewIndependence(workflowId:string,artifactHash:string,reviewerInvocationId:string):{readonly allowed:boolean;readonly reasons:readonly string[]} {
    const events=this.verify(workflowId),invocations=this.invocationsFrom(events);const reviewer=invocations.find(i=>i.invocation_id===reviewerInvocationId);
    const artifact=this.currentArtifact(events);const authors=artifact?.artifact_sha256===artifactHash?artifact.author_ids:[];const expectedAuthorRole=artifact?.phase==='PLANNING'?'PLANNER':artifact?.phase==='EXECUTING'?'IMPLEMENTER':null;
    const reasons:string[]=[];
    if(!reviewer||reviewer.role!=='REVIEWER'||reviewer.state!=='SUCCEEDED')reasons.push('REVIEWER_NOT_VALIDATED');
    if(!events.some(e=>e.event_type==='ARTIFACT_REVIEWED'&&(e.payload as {artifact_sha256:string;invocation_id:string}).artifact_sha256===artifactHash&&(e.payload as {invocation_id:string}).invocation_id===reviewerInvocationId))reasons.push('REVIEW_NOT_RECORDED_IN_LEDGER');
    if(!authors.length)reasons.push('ARTIFACT_AUTHOR_NOT_RECORDED');
    for(const authorId of authors){const author=invocations.find(i=>i.invocation_id===authorId);if(!author||author.role!==expectedAuthorRole||author.state!=='SUCCEEDED'){reasons.push('ARTIFACT_AUTHOR_NOT_VALIDATED');continue;}
      if(reviewer)evaluateIndependentReview(author.identity,reviewer.identity,{reviewerInvocationId,artifactAuthorInvocationIds:authors}).reasons.forEach(r=>reasons.push(r));
    }
    return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze([...new Set(reasons)])});
  }
  acceptMessage(input:AgentMessageInput):{readonly message:NormalizedAgentMessage;readonly duplicate:boolean} {
    return this.withLock(input.workflow_id,events=>{
      const auth=this.assertProgress(events);
      const invocation=this.invocationsFrom(events).find(i=>i.invocation_id===input.invocation_id);
      if(!invocation||invocation.state!=='RUNNING')throw Error('INVOCATION_NOT_RUNNING');
      if(input.message_type==='CONTROL_EVENT')throw new WorkflowLedgerError('CONTROL_EVENT_HOST_ONLY');
      if(Buffer.byteLength(JSON.stringify(input),'utf8')>resolveEffectiveLimits(auth.record.limits).message_bytes)throw new WorkflowLedgerError('MESSAGE_TOO_LARGE');
      if(input.source_cursor!==null&&!/^(0|[1-9][0-9]*)$/u.test(input.source_cursor))throw new WorkflowLedgerError('SOURCE_CURSOR_INVALID');
      const identity=input.source_event_id!==null?'event:'+input.source_event_id:input.source_cursor!==null?'cursor:'+input.source_cursor:null;
      if(!identity)throw Error('STABLE_SOURCE_ID_REQUIRED');
      const existing=events.filter(e=>e.event_type==='AGENT_MESSAGE').map(e=>e.payload as NormalizedAgentMessage).find(m=>m.invocation_id===input.invocation_id&&(m.source_event_id!==null?'event:'+m.source_event_id:m.source_cursor!==null?'cursor:'+m.source_cursor:null)===identity);
      const payloadHash=canonicalHash(input.payload);
      if(existing){if(existing.payload_sha256!==payloadHash||existing.message_type!==input.message_type||existing.reply_to_message_id!==input.reply_to_message_id||existing.source_cursor!==input.source_cursor)throw Error('SOURCE_EVENT_CONFLICT');return Object.freeze({message:existing,duplicate:true});}
      if(input.source_cursor!==null){const cursors=events.filter(e=>e.event_type==='AGENT_MESSAGE'&&(e.payload as NormalizedAgentMessage).invocation_id===input.invocation_id).map(e=>(e.payload as NormalizedAgentMessage).source_cursor).filter((cursor):cursor is string=>cursor!==null);if(cursors.some(cursor=>compareDecimalCursor(input.source_cursor!,cursor)<=0))throw new WorkflowLedgerError('SOURCE_CURSOR_REWIND');}
      if(input.reply_to_message_id!==null&&!events.some(e=>e.event_type==='AGENT_MESSAGE'&&(e.payload as NormalizedAgentMessage).message_id===input.reply_to_message_id))throw Error('REPLY_TARGET_UNKNOWN');
      const last=events.at(-1)!;const sequence=last.sequence+1;
      const message=normalizeAgentMessage(input,{sequence,previous_event_hash:last.event_hash,observed_at:this.nowIso(),correlation_id:'corr-'+workflowIdSafe(input.workflow_id)});
      if(Buffer.byteLength(JSON.stringify(message),'utf8')>resolveEffectiveLimits(auth.record.limits).message_bytes)throw new WorkflowLedgerError('MESSAGE_TOO_LARGE');
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
    if(invocation.state==='SUCCEEDED')return true;
    const last=[...events].reverse().find(e=>e.event_type==='INVOCATION_TRANSITION'&&(e.payload as {invocation_id?:string}).invocation_id===invocation.invocation_id);
    if(!last)return false;const p=last.payload as {event:string;context?:{processObservedStopped?:boolean;processNeverStarted?:boolean}};
    return p.event==='START_FAILED'||p.context?.processObservedStopped===true||p.context?.processNeverStarted===true||(invocation.state==='CANCELLED'&&p.event==='CANCEL');
  }
  private assertNoUnresolvedEffects(events:readonly LedgerEvent[]):void {
    if(this.effectsFrom(events).some(e=>e.state!=='CONFIRMED'))throw Error('EFFECTS_NEED_RECONCILIATION');
  }
  effectsFrom(events:readonly LedgerEvent[]):EffectRecord[] {
    const records=new Map<string,EffectRecord>();for(const e of events){if(e.event_type==='EFFECT_INTENT'){const x=e.payload as EffectRecord;records.set(x.effect_id,x);}else if(e.event_type==='EFFECT_TRANSITION'){const x=e.payload as {effect_id:string;record:EffectRecord};records.set(x.effect_id,x.record);}}return [...records.values()];
  }
  assertBudgets(workflowId:string):{readonly workflow_active_ms:number;readonly longest_invocation_ms:number} {
    return this.withLock(workflowId,events=>{const authorization=this.assertCurrentAuthorization(events),now=this.nowIso();
      const limits=resolveEffectiveLimits(authorization.record.limits),workflowMs=measureWorkflowActiveMs(events,now),invocationMs=measureInvocationMs(this.invocationsFrom(events),now);
      if(invocationMs>=limits.invocation_ms)this.blockWorkflow(events,'INVOCATION_DURATION_LIMIT_EXCEEDED');else if(workflowMs>=limits.workflow_active_ms)this.blockWorkflow(events,'WORKFLOW_DURATION_LIMIT_EXCEEDED');
      assertRuntimeBudgets(workflowMs,invocationMs,limits);return Object.freeze({workflow_active_ms:workflowMs,longest_invocation_ms:invocationMs});});
  }
  assertOutputLimit(workflowId:string,streamBytes:number):void {this.withLock(workflowId,events=>{const auth=this.assertProgress(events);try{assertOutputWithinLimit(streamBytes,resolveEffectiveLimits(auth.record.limits));}catch(error){this.blockWorkflow(events,'OUTPUT_LIMIT_EXCEEDED');throw error;}});}
  verify(id:string):readonly LedgerEvent[] {
    const dir=this.eventsDir(id);if(!fs.existsSync(dir))throw Error('WORKFLOW_NOT_FOUND');
    const entries=fs.readdirSync(dir);for(const entry of entries){if(entry.startsWith('.pending-')&&entry.endsWith('.tmp'))continue;if(!/^\d{8}\.json$/u.test(entry))throw new WorkflowLedgerError('LEDGER_UNEXPECTED_ENTRY');const stat=fs.lstatSync(path.join(dir,entry));if(!stat.isFile()||stat.isSymbolicLink())throw new WorkflowLedgerError('LEDGER_EVENT_UNTRUSTED');}
    const names=entries.filter(n=>/^\d{8}\.json$/u.test(n)).sort();if(!names.length)throw Error('LEDGER_EMPTY');
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
        if(['AUTHORIZE','RESUME','START','ADVANCE_PHASE','RETURN_FOR_CORRECTION','REQUEST_FINAL_APPROVAL'].includes(data.event)){
          const stored=p?this.latestAuthorization(events,p.authorization_id):null;
          if(!stored||stored.record.revoked_at!==null||canonicalHash(stored.proof)!==canonicalHash(p)||stored.record.contract_sha256!==projection.contract_sha256||Date.parse(stored.record.expires_at)<=Date.parse(event.observed_at))throw Error('LEDGER_AUTHORIZATION_MISMATCH');
        }
        const nextPhase=data.event==='ADVANCE_PHASE'||data.event==='RETURN_FOR_CORRECTION'?data.context.nextPhase:null;
        const gateName=data.event==='START'?'TASK-READY':data.event==='ADVANCE_PHASE'&&projection.phase==='REVIEWING'&&['EXECUTING','VALIDATING'].includes(nextPhase??'')?'REVIEW-GATE':data.event==='REQUEST_FINAL_APPROVAL'?'ValidationGate':null;
        if(gateName){const gate=this.latestGate(events,gateName);const authId=data.context.authorizationProof?.authorization_id;
          if(!gate||gate.authorization_id!==authId||canonicalHash(gate.proof)!==canonicalHash(data.context.gateProof)||(gateName!=='TASK-READY'&&!this.gateIsCurrent(events,gate,projection,gateName)))throw new WorkflowLedgerError('LEDGER_TRANSITION_GATE_MISMATCH');}
        if(data.event==='RESUME'){const gate=this.latestGate(events,'TASK-READY');if(!gate||gate.authorization_id!==data.context.authorizationProof?.authorization_id)throw new WorkflowLedgerError('LEDGER_RESUME_GATE_MISMATCH');}
        const finalRecorded=events.some(e=>e.event_type==='FINAL_APPROVAL_RECORDED');
        const prGateRecorded=events.some(e=>e.event_type==='P1_PR_GATE_VERIFIED');
        if(data.event==='ADVANCE_PHASE'&&projection.phase==='REVIEWING'){
          const origin=this.reviewOriginPhase(events);if((origin==='PLANNING'&&nextPhase!=='EXECUTING')||(origin==='EXECUTING'&&nextPhase!=='VALIDATING')||!['PLANNING','EXECUTING'].includes(origin??''))throw new WorkflowLedgerError('LEDGER_REVIEW_PHASE_ORIGIN_INVALID');
        }
        if(data.event==='RETURN_FOR_CORRECTION'){
          const artifact=this.currentArtifact(events);const review=artifact&&this.currentReview(events,artifact);const validation=artifact&&review&&this.currentValidation(events,artifact,review);const origin=this.reviewOriginPhase(events);
          const reviewReturn=projection.phase==='REVIEWING'&&nextPhase===origin&&!!review&&(review.payload as {outcome:string}).outcome==='CHANGES_REQUESTED';const validationReturn=projection.phase==='VALIDATING'&&nextPhase==='EXECUTING'&&!!validation&&(validation.payload as {result:string}).result==='FAIL';if(!reviewReturn&&!validationReturn)throw new WorkflowLedgerError('LEDGER_CORRECTION_TRANSITION_INVALID');
        }
        if(data.event==='REQUEST_FINAL_APPROVAL'){
          const pending=this.invocationsFrom(events).some(i=>!this.invocationSettled(events,i));const unresolved=this.effectsFrom(events).some(e=>['INTENT_RECORDED','DISPATCHED','OBSERVED','UNKNOWN','RECONCILIATION_REQUIRED'].includes(e.state));
          if(pending||unresolved||!this.hasCurrentSuccessfulEvidence(events))throw new WorkflowLedgerError('LEDGER_FINAL_READINESS_INVALID');
        }
        const next=data.event==='APPROVE'&&finalRecorded&&prGateRecorded?projectVerifiedFinalApproval(projection):transitionWorkflow(projection,data.event,data.context);
        if(data.event==='ADVANCE_PHASE'||data.event==='RETURN_FOR_CORRECTION'){
          const authId=data.context.authorizationProof?.authorization_id;const authorization=authId?this.latestAuthorization(events,authId):null;if(!authorization)throw new WorkflowLedgerError('LEDGER_CYCLE_AUTHORIZATION_MISSING');const limits=resolveEffectiveLimits(authorization.record.limits);if(next.revision_cycles>limits.review_cycles||next.correction_cycles>limits.correction_cycles)throw new WorkflowLedgerError('LEDGER_CYCLE_LIMIT_EXCEEDED');
        }
        if(next.state!==data.next_state||next.phase!==data.next_phase||next.authorization_id!==data.authorization_id)throw Error('LEDGER_PROJECTION_MISMATCH');
      } else if(event.event_type==='AUTHORIZATION_RECORDED'){
        const p=event.payload as {record:WorkflowAuthorizationRecord;approval:ApprovalRecord;contract:TaskContract;trust:TrustedApproval;proof:import('./machine.js').AuthorizationProof};
        const approvalHash=canonicalHash(p.approval),contractHash=canonicalHash(p.contract);
        if(p.record.workflow_id!==id||p.record.approval_record_sha256!==approvalHash||p.record.contract_sha256!==contractHash||p.trust.record_sha256!==approvalHash||p.trust.revoked||p.proof.authorization_id!==p.record.authorization_id||p.proof.workflow_id!==id||p.proof.contract_sha256!==contractHash||p.proof.expires_at!==p.record.expires_at||p.proof.revoked)throw Error('LEDGER_AUTHORIZATION_RECORD_INVALID');
        const configured=this.options.trusted_approvals??[];if(!configured.some(t=>t.record_sha256===p.trust.record_sha256&&t.authorized_by===p.trust.authorized_by&&t.approval_source===p.trust.approval_source))throw Error('LEDGER_AUTHORITY_CONFIG_MISMATCH');
        const decision=authorizeWorkflow(p.record,p.approval,p.contract,[p.trust]);if(!decision.allowed)throw Error('LEDGER_AUTHORIZATION_RECORD_INVALID');
      } else if(event.event_type==='GATE_DECISION'){
        const p=event.payload as {gate:string;authorization_id:string;allowed:boolean;proof:NonNullable<Parameters<typeof transitionWorkflow>[2]>['gateProof'];evidence_sha256:string;basis_sha256?:string;phase?:string;revision_cycles?:number;correction_cycles?:number;fixture_id?:string};
        const authorization=this.latestAuthorization(events,p.authorization_id),projection=this.projectEvents(events);
        if(!p.allowed||!authorization||authorization.record.revoked_at!==null||p.proof?.workflow_id!==id||p.proof.contract_sha256!==authorization.record.contract_sha256||p.proof.gate!==p.gate||!p.proof.allowed||!Number.isFinite(Date.parse(p.proof.decided_at))||!['HOST','SIMULATED_HOST'].includes(p.proof.authority)||!/^[a-f0-9]{64}$/.test(p.evidence_sha256))throw new WorkflowLedgerError('LEDGER_GATE_DECISION_INVALID');
        if(p.gate==='TASK-READY'){
          if(p.proof.authority!=='HOST'||p.evidence_sha256!==canonicalHash({approval:authorization.record.approval_record_sha256,contract:authorization.record.contract_sha256,baseline:authorization.record.baseline_git}))throw new WorkflowLedgerError('LEDGER_TASK_READY_INVALID');
        }else{
          if(!this.options.fixture_id||p.fixture_id!==this.options.fixture_id||p.proof.authority!=='SIMULATED_HOST'||p.phase!==projection.phase||p.revision_cycles!==projection.revision_cycles||p.correction_cycles!==projection.correction_cycles||p.basis_sha256!==this.gateBasis(events,p.gate as 'REVIEW-GATE'|'ValidationGate')||p.evidence_sha256!==canonicalHash(this.gateEvidence(events,p.gate as 'REVIEW-GATE'|'ValidationGate',p.fixture_id))||!['REVIEW-GATE','ValidationGate'].includes(p.gate))throw new WorkflowLedgerError('LEDGER_GATE_BASIS_INVALID');
          if((p.gate==='REVIEW-GATE'&&projection.phase!=='REVIEWING')||(p.gate==='ValidationGate'&&projection.phase!=='VALIDATING'))throw new WorkflowLedgerError('LEDGER_GATE_PHASE_INVALID');
        }
      } else if(event.event_type==='P1_PR_GATE_VERIFIED'){
        const p=event.payload as {gate:{gate?:string;allowed?:boolean;execution_id?:string;attempt_id?:string;contract_sha256?:string};bindings:{workflow_id:string;contract_sha256:string;attempt_id:string;diff_sha256:string;review_sha256:string;evidence_sha256:string;review_id:string}};
        const b=p.bindings;if(!p.gate?.allowed||p.gate.gate!=='PR-GATE'||p.gate.execution_id!==id||p.gate.attempt_id!==b.attempt_id||p.gate.contract_sha256!==b.contract_sha256||b.workflow_id!==id||![b.contract_sha256,b.diff_sha256,b.review_sha256,b.evidence_sha256].every(x=>/^[a-f0-9]{64}$/.test(x))||!b.attempt_id||!b.review_id)throw new WorkflowLedgerError('LEDGER_P1_PR_GATE_INVALID');
      } else if(event.event_type==='FINAL_APPROVAL_RECORDED'){
        const p=event.payload as {approval:ApprovalRecord;trust:TrustedApproval;approval_sha256:string;proof:import('./machine.js').FinalApprovalProof;fixture_id:string|null};
        const approval=p.approval,auth=this.currentAuthorization(events),trust=trustApproval(approval);
        const pr=[...events].reverse().find(e=>e.event_type==='P1_PR_GATE_VERIFIED')?.payload as {gate:unknown;bindings:{workflow_id:string;contract_sha256:string;attempt_id:string;diff_sha256:string;review_sha256:string;evidence_sha256:string;review_id:string}}|undefined;
        const b=pr?.bindings;const priorWorkflow=this.projectEvents(events);
        const configured=this.options.trusted_approvals??[];const trustedHost=configured.some(t=>t.record_sha256===p.trust.record_sha256&&t.authorized_by===p.trust.authorized_by&&t.approval_source===p.trust.approval_source);
        if(!auth||!b||priorWorkflow.state!=='AWAITING_APPROVAL'||p.approval_sha256!==canonicalHash(approval)||canonicalHash(p.trust)!==canonicalHash(trust)||p.trust.revoked||!trustedHost||Date.parse(auth.record.expires_at)<=Date.parse(event.observed_at)||!verifyApproval(auth.contract,approval,{scope:'MERGE',trusted:[p.trust],attempt_id:b.attempt_id,diff_sha256:b.diff_sha256,review_id:b.review_id}).allowed||b.workflow_id!==id||b.contract_sha256!==auth.record.contract_sha256)throw new WorkflowLedgerError('LEDGER_FINAL_APPROVAL_INVALID');
        const artifact=this.currentArtifact(events);const review=artifact&&this.currentReview(events,artifact);const validation=artifact&&review&&this.currentValidation(events,artifact,review);const final=events.find(e=>e.event_type==='HOST_EVIDENCE'&&(()=>{const x=e.payload as {kind:string;evidence_sha256:string;artifact_sha256?:string;diff_sha256?:string;review_sha256?:string;validation_sha256?:string;result?:string};return x.kind==='FINAL'&&x.evidence_sha256===b.evidence_sha256&&x.artifact_sha256===artifact?.artifact_sha256&&x.diff_sha256===artifact?.diff_sha256&&x.review_sha256===(review?.payload as {review_sha256:string}|undefined)?.review_sha256&&x.validation_sha256===(validation?.payload as {evidence_sha256:string}|undefined)?.evidence_sha256&&x.result==='PASS';})());
        const authored=!!artifact&&artifact.diff_sha256===b.diff_sha256&&artifact.fixture_id===(p.fixture_id??this.options.fixture_id),reviewed=!!artifact&&!!review&&this.reviewIndependent(events,artifact,review)&&(review.payload as {review_sha256:string}).review_sha256===b.review_sha256,evidence=!!final&&!!validation&&(validation.payload as {result:string}).result==='PASS'&&this.hasCurrentSuccessfulEvidence(events);
        const f=p.proof;if(!authored||!reviewed||!evidence||!f||f.workflow_id!==id||f.contract_sha256!==auth.record.contract_sha256||f.diff_sha256!==b.diff_sha256||f.review_sha256!==b.review_sha256||f.evidence_sha256!==b.evidence_sha256||f.actor!==approval.authorized_by||f.source!==(p.fixture_id?'SIMULATED_HUMAN':'HUMAN')||f.verified!==true||!Number.isFinite(Date.parse(f.approved_at))||(p.fixture_id!==null&&p.fixture_id!==this.options.fixture_id))throw new WorkflowLedgerError('LEDGER_FINAL_APPROVAL_BINDING_INVALID');
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
        if(!current)throw Error('INVOCATION_NOT_FOUND');const workflowState=this.projectEvents(events).state;
        if(p.context?.duration_limit_exceeded){const limit=events.some(e=>e.event_type==='WORKFLOW_TRANSITION'&&(e.payload as {event:string;context?:{reason?:string}}).event==='BLOCK'&&(e.payload as {context?:{reason?:string}}).context?.reason==='INVOCATION_DURATION_LIMIT_EXCEEDED');if(p.event!=='CANCEL'||!limit)throw new WorkflowLedgerError('INVOCATION_TIMEOUT_PROVENANCE_INVALID');}
        if(p.event==='START'&&workflowState!=='ACTIVE'||p.event==='RESULT_SUCCESS'&&workflowState!=='ACTIVE')throw Error('INVOCATION_WORKFLOW_STATE_INVALID');
        if(p.event==='PROCESS_STARTED'&&workflowState!=='ACTIVE'&&!(workflowState==='CANCEL_REQUESTED'&&current.state==='CANCEL_REQUESTED'))throw Error('INVOCATION_WORKFLOW_STATE_INVALID');
        if(p.event==='BLOCK'&&(current.state==='CREATED'?p.context?.processNeverStarted!==true:!p.context?.processObservedStopped))throw Error('INVOCATION_BLOCK_UNRECONCILED');
        const expected=transitionInvocation(current,p.event,p.context);
        if(canonicalHash(expected)!==canonicalHash(p.record))throw Error('INVOCATION_PROJECTION_MISMATCH');invocationMap.set(p.invocation_id,p.record);
      } else if(event.event_type==='AGENT_MESSAGE'){
        const message=event.payload as NormalizedAgentMessage;const invocation=invocationMap.get(message.invocation_id);
        if(!this.validator.validate('AgentMessage',message).valid||!verifyNormalizedMessage(message)||message.message_type==='CONTROL_EVENT'||message.workflow_id!==id||message.sequence!==sequence||message.previous_event_hash!==event.previous_event_hash||!invocation||invocation.state!=='RUNNING')throw Error('MESSAGE_JOURNAL_INVALID');
        const idKey=message.source_event_id!==null?'event:'+message.source_event_id:'cursor:'+message.source_cursor;
        if(events.some(e=>e.event_type==='AGENT_MESSAGE'&&(e.payload as NormalizedAgentMessage).invocation_id===message.invocation_id&&((e.payload as NormalizedAgentMessage).source_event_id!==null?'event:'+((e.payload as NormalizedAgentMessage).source_event_id):'cursor:'+((e.payload as NormalizedAgentMessage).source_cursor))===idKey))throw Error('MESSAGE_REPLAY_IN_LEDGER');
        if(message.source_cursor!==null){const cursors=events.filter(e=>e.event_type==='AGENT_MESSAGE'&&(e.payload as NormalizedAgentMessage).invocation_id===message.invocation_id).map(e=>(e.payload as NormalizedAgentMessage).source_cursor).filter((cursor):cursor is string=>cursor!==null);if(cursors.some(cursor=>compareDecimalCursor(message.source_cursor!,cursor)<=0))throw new WorkflowLedgerError('MESSAGE_CURSOR_SEQUENCE_INVALID');}
      } else if(event.event_type==='EFFECT_INTENT'){
        const effect=event.payload as EffectRecord;if(!this.validator.validate('EffectRecord',effect).valid||effect.workflow_id!==id||effect.state!=='INTENT_RECORDED'||effectMap.has(effect.effect_id)||this.projectEvents(events).state!=='ACTIVE'||invocationMap.get(effect.invocation_id)?.state!=='RUNNING')throw Error('EFFECT_INTENT_INVALID');effectMap.set(effect.effect_id,effect);
      } else if(event.event_type==='EFFECT_TRANSITION'){
        const p=event.payload as {effect_id:string;event:'DISPATCH'|'OBSERVED'|'UNKNOWN'|'CONFIRM'|'BLOCK';record:EffectRecord};const current=effectMap.get(p.effect_id);if(!current)throw Error('EFFECT_NOT_FOUND');const expected=reconcileEffect(current,p.event,p.event==='DISPATCH'?null:p.record.observed_at);
        if(canonicalHash(expected)!==canonicalHash(p.record))throw Error('EFFECT_PROJECTION_MISMATCH');effectMap.set(p.effect_id,p.record);
      } else if(event.event_type==='ARTIFACT_AUTHORED'){
        const p=event.payload as {artifact_sha256:string;diff_sha256:string;invocation_id:string;fixture_id:string;phase?:WorkflowRecord['phase'];phase_entry_sequence?:number};const projection=this.projectEvents(events);const expectedRole=projection.phase==='PLANNING'?'PLANNER':projection.phase==='EXECUTING'?'IMPLEMENTER':null;const invocation=invocationMap.get(p.invocation_id);const phaseEntry=this.phaseEntrySequence(events,projection.phase);const created=events.find(e=>e.event_type==='INVOCATION_CREATED'&&(e.payload as AgentInvocationRecord).invocation_id===p.invocation_id);if(!/^[a-f0-9]{64}$/.test(p.artifact_sha256)||!/^[a-f0-9]{64}$/.test(p.diff_sha256)||p.fixture_id!==this.options.fixture_id||p.phase!==projection.phase||p.phase_entry_sequence!==phaseEntry||!expectedRole||invocation?.role!==expectedRole||invocation.state!=='SUCCEEDED'||!created||created.sequence<=phaseEntry)throw new WorkflowLedgerError('LEDGER_ARTIFACT_AUTHOR_INVALID');
      } else if(event.event_type==='ARTIFACT_REVIEWED'){
        const p=event.payload as {artifact_sha256:string;review_sha256:string;diff_sha256?:string;invocation_id:string;fixture_id:string;identity_sha256:string};const reviewer=invocationMap.get(p.invocation_id);const artifact=this.currentArtifact(events);const origin=this.reviewOriginPhase(events);const authors=artifact?.artifact_sha256===p.artifact_sha256&&artifact.diff_sha256===p.diff_sha256&&artifact.phase===origin?artifact.author_ids:[];const reviewerCreated=events.find(e=>e.event_type==='INVOCATION_CREATED'&&(e.payload as AgentInvocationRecord).invocation_id===p.invocation_id);
        if(this.projectEvents(events).phase!=='REVIEWING'||!artifact||!reviewerCreated||reviewerCreated.sequence<=artifact.latest_authorship_sequence||reviewerCreated.sequence<=this.phaseEntrySequence(events,'REVIEWING')||artifact.artifact_sha256!==p.artifact_sha256||artifact.diff_sha256!==p.diff_sha256||artifact.fixture_id!==p.fixture_id||artifact.phase!==origin||event.sequence<=artifact.latest_authorship_sequence||!/^[a-f0-9]{64}$/.test(p.artifact_sha256)||!/^[a-f0-9]{64}$/.test(p.review_sha256)||!reviewer||reviewer.role!=='REVIEWER'||reviewer.state!=='SUCCEEDED'||p.fixture_id!==this.options.fixture_id||p.identity_sha256!==canonicalHash(reviewer.identity)||!authors.length||authors.includes(p.invocation_id)||authors.some(authorId=>{const author=invocationMap.get(authorId);return !author||!evaluateIndependentReview(author.identity,reviewer.identity,{reviewerInvocationId:p.invocation_id,artifactAuthorInvocationIds:authors}).allowed;}))throw new WorkflowLedgerError('LEDGER_ARTIFACT_REVIEW_INVALID');
      } else if(event.event_type==='HOST_EVIDENCE'){
        const p=event.payload as {kind:string;workflow_id:string;invocation_id:string;evidence_sha256:string;artifact_sha256?:string;diff_sha256?:string;review_sha256?:string;validation_sha256?:string;result?:string;fixture_id:string};const i=invocationMap.get(p.invocation_id);const artifact=this.currentArtifact(events);const review=artifact&&this.currentReview(events,artifact);
        const linked=!!artifact&&p.artifact_sha256===artifact.artifact_sha256&&p.diff_sha256===artifact.diff_sha256&&p.fixture_id===artifact.fixture_id&&!!review&&p.review_sha256===(review.payload as {review_sha256:string}).review_sha256&&this.reviewIndependent(events,artifact,review);
        const priorValidation=artifact&&review&&this.currentValidation(events,artifact,review);
        const validatorCreated=events.find(e=>e.event_type==='INVOCATION_CREATED'&&(e.payload as AgentInvocationRecord).invocation_id===p.invocation_id);
        if(this.projectEvents(events).phase!=='VALIDATING'||!artifact||artifact.phase!=='EXECUTING'||!validatorCreated||validatorCreated.sequence<=this.phaseEntrySequence(events,'VALIDATING')||!this.options.fixture_id||p.fixture_id!==this.options.fixture_id||p.workflow_id!==id||!i||i.state!=='SUCCEEDED'||i.identity.status!=='VERIFIED'||!['FINAL','VALIDATION'].includes(p.kind)||!/^[a-f0-9]{64}$/.test(p.evidence_sha256)||!linked||!['PASS','FAIL'].includes(p.result??'')||(p.kind==='VALIDATION'&&(i.role!=='VALIDATOR'||event.sequence<=review!.sequence))||(p.kind==='FINAL'&&(p.result!=='PASS'||i.role!=='VALIDATOR'||!priorValidation||p.validation_sha256!==(priorValidation.payload as {evidence_sha256:string}).evidence_sha256||(priorValidation.payload as {result:string}).result!=='PASS')))throw new WorkflowLedgerError('LEDGER_HOST_EVIDENCE_INVALID');
      } else if(event.event_type==='AUTHORIZATION_REVOKED'){
        const p=event.payload as {authorization_id:string;workflow_id:string;revoked_at:string;record:WorkflowAuthorizationRecord;proof:import('./machine.js').AuthorizationProof};const projection=this.projectEvents(events);const prior=this.latestAuthorization(events,p.authorization_id);
        if(p.workflow_id!==id||projection.authorization_id!==p.authorization_id||!Number.isFinite(Date.parse(p.revoked_at))||!['AUTHORIZED','ACTIVE','AWAITING_APPROVAL','BLOCKED'].includes(projection.state)||!prior||prior.record.revoked_at!==null||p.record.revoked_at!==p.revoked_at||canonicalHash({...p.record,revoked_at:null})!==canonicalHash(prior.record)||canonicalHash(p.proof)!==canonicalHash(prior.proof))throw Error('AUTHORIZATION_REVOCATION_INVALID');
        transitionWorkflow(projection,'REVOKE');
      } else if(event.event_type==='AUTHORIZATION_SELECTED'){
        const p=event.payload as {authorization_id:string;workflow_id:string};if(p.workflow_id!==id||!events.some(e=>e.event_type==='AUTHORIZATION_RECORDED'&&(e.payload as {record:WorkflowAuthorizationRecord}).record.authorization_id===p.authorization_id)||this.projectEvents(events).state!=='BLOCKED')throw Error('AUTHORIZATION_SELECTION_INVALID');
      } else if(event.event_type==='INVOCATION_OBSERVATION'){
        const p=event.payload as {invocation_id:string;kind:string;evidence_sha256:string;fixture_id:string};if(!this.options.fixture_id||p.fixture_id!==this.options.fixture_id||!invocationMap.has(p.invocation_id)||!['PROCESS_STARTED','PROCESS_STOPPED','TERMINAL_RESULT'].includes(p.kind)||!/^[a-f0-9]{64}$/.test(p.evidence_sha256))throw Error('INVOCATION_OBSERVATION_INVALID');
      }
      events.push(event);previous=event_hash;
    }
    return Object.freeze(events);
  }
  private projectEvents(events:readonly LedgerEvent[]):WorkflowRecord {
    let workflow=events[0]!.payload as WorkflowRecord;
    for(const event of events.slice(1)){
      if(event.event_type==='WORKFLOW_TRANSITION'){const p=event.payload as {event:string;context:Parameters<typeof transitionWorkflow>[2]};workflow=p.event==='APPROVE'?projectVerifiedFinalApproval(workflow):transitionWorkflow(workflow,p.event,p.context);}
      else if(event.event_type==='AUTHORIZATION_REVOKED')workflow=transitionWorkflow(workflow,'REVOKE');
      else if(event.event_type==='AUTHORIZATION_SELECTED'){const p=event.payload as {authorization_id:string};workflow=Object.freeze({...workflow,authorization_id:p.authorization_id});}
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
