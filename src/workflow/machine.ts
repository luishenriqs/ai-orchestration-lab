import type { AgentInvocationRecord, InvocationState, WorkflowPhase, WorkflowRecord, WorkflowState } from './types.js';

export interface AuthorizationProof {readonly authorization_id:string;readonly workflow_id:string;readonly contract_sha256:string;readonly verified:true;readonly verified_at:string;readonly expires_at:string;readonly revoked:false;readonly authority:'P1_TRUSTED_APPROVAL'|'SIMULATED_HOST';}
export interface GateProof {readonly gate:'TASK-READY'|'REVIEW-GATE'|'ValidationGate';readonly workflow_id:string;readonly contract_sha256:string;readonly allowed:true;readonly decided_at:string;readonly authority:'HOST'|'SIMULATED_HOST';}
export interface FinalApprovalProof {readonly workflow_id:string;readonly contract_sha256:string;readonly diff_sha256:string;readonly review_sha256:string;readonly evidence_sha256:string;readonly actor:string;readonly source:'HUMAN'|'SIMULATED_HUMAN';readonly verified:true;readonly approved_at:string;}
export interface WorkflowTransitionContext { readonly authorizationValid?:boolean; readonly authorizationId?:string|undefined; readonly authorizationProof?:AuthorizationProof; readonly gatesReady?:boolean; readonly gateProof?:GateProof; readonly finalApprovalProof?:FinalApprovalProof; readonly approvalValid?:boolean; readonly noPendingEffects?:boolean; readonly reconciled?:boolean; readonly reason?:string; readonly nextPhase?:WorkflowPhase|undefined; readonly phaseGatePassed?:boolean; }
function gateMatches(proof:GateProof|undefined,workflow:WorkflowRecord,expected:GateProof['gate']):boolean{return !!proof&&proof.gate===expected&&proof.allowed&&proof.workflow_id===workflow.workflow_id&&proof.contract_sha256===workflow.contract_sha256&&['HOST','SIMULATED_HOST'].includes(proof.authority)&&Number.isFinite(Date.parse(proof.decided_at));}
function authorizationMatches(proof:AuthorizationProof|undefined,workflow:WorkflowRecord):boolean{return !!proof&&proof.verified&&proof.revoked===false&&proof.workflow_id===workflow.workflow_id&&proof.contract_sha256===workflow.contract_sha256&&proof.authorization_id.length>0&&['P1_TRUSTED_APPROVAL','SIMULATED_HOST'].includes(proof.authority)&&Date.parse(proof.expires_at)>Date.parse(proof.verified_at);}
const terminal=new Set<WorkflowState>(['CANCELLED','REJECTED','FAILED','COMPLETED']);
const phaseEdges:Readonly<Record<WorkflowPhase,readonly WorkflowPhase[]>>={NONE:['PLANNING'],PLANNING:['REVIEWING'],REVIEWING:['EXECUTING','PLANNING'],EXECUTING:['VALIDATING'],VALIDATING:['EXECUTING']};
const workflowEvents:Readonly<Record<WorkflowState,readonly string[]>>={
  CREATED:['AUTHORIZE','REJECT','CANCEL'],AUTHORIZED:['START','CANCEL','REVOKE','BLOCK'],ACTIVE:['ADVANCE_PHASE','REQUEST_FINAL_APPROVAL','BLOCK','FAIL','CANCEL','REVOKE'],
  AWAITING_APPROVAL:['APPROVE','REJECT','CANCEL','REVOKE','BLOCK'],BLOCKED:['RESUME','FAIL','CANCEL','CANCEL_NO_EFFECT','REVOKE'],CANCEL_REQUESTED:['CONFIRM_CANCEL','CANCEL_UNCERTAIN'],
  CANCELLED:[],REJECTED:[],FAILED:[],COMPLETED:[],
};
export function transitionWorkflow(current:WorkflowRecord,event:string,ctx:WorkflowTransitionContext={}):WorkflowRecord {
  // Final approval is a ledger operation. This pure state helper is public and
  // therefore must never turn caller-supplied proof-shaped data into authority.
  if(event==='APPROVE') throw Error('USE_FINAL_APPROVAL_API');
  if(!workflowEvents[current.state].includes(event)) throw Error('INVALID_WORKFLOW_TRANSITION');
  let state:WorkflowState=current.state,phase=current.phase,authorizationId=current.authorization_id;
  let revisionCycles=current.revision_cycles,correctionCycles=current.correction_cycles;
  switch(event){
    case 'AUTHORIZE': if(!authorizationMatches(ctx.authorizationProof,current)) throw Error('AUTHORIZATION_REQUIRED'); state='AUTHORIZED';authorizationId=ctx.authorizationProof!.authorization_id;break;
    case 'REJECT': state='REJECTED';break;
    case 'CANCEL': if(current.state==='CREATED'||current.state==='AUTHORIZED'||current.state==='AWAITING_APPROVAL'){if(ctx.noPendingEffects!==true) throw Error('CANCEL_RECONCILIATION_REQUIRED');state='CANCELLED';}else state='CANCEL_REQUESTED';break;
    case 'START': if(!ctx.gatesReady||!gateMatches(ctx.gateProof,current,'TASK-READY')||!authorizationMatches(ctx.authorizationProof,current)) throw Error('INITIAL_GATES_REQUIRED');state='ACTIVE';phase='PLANNING';break;
    case 'ADVANCE_PHASE': {const expected=current.phase==='EXECUTING'||current.phase==='VALIDATING'?'ValidationGate':'REVIEW-GATE';if(!ctx.phaseGatePassed||!gateMatches(ctx.gateProof,current,expected)||!ctx.nextPhase||!phaseEdges[current.phase].includes(ctx.nextPhase)) throw Error('PHASE_GATE_OR_EDGE_INVALID');phase=ctx.nextPhase;if(current.phase==='REVIEWING')revisionCycles++;if((current.phase==='REVIEWING'&&ctx.nextPhase==='PLANNING')||(current.phase==='VALIDATING'&&ctx.nextPhase==='EXECUTING'))correctionCycles++;break;}
    case 'REQUEST_FINAL_APPROVAL': if(current.phase!=='VALIDATING'||!ctx.gatesReady||!gateMatches(ctx.gateProof,current,'ValidationGate')) throw Error('FINAL_VALIDATION_REQUIRED');state='AWAITING_APPROVAL';break;
    case 'APPROVE': throw Error('USE_FINAL_APPROVAL_API');
    case 'BLOCK': state='BLOCKED';break;
    case 'FAIL': state='FAILED';break;
    case 'REVOKE': state=current.state==='ACTIVE'?'CANCEL_REQUESTED':'BLOCKED';break;
    case 'RESUME': if(!authorizationMatches(ctx.authorizationProof,current)) throw Error('AUTHORIZATION_REQUIRED');state='ACTIVE';authorizationId=ctx.authorizationProof!.authorization_id;break;
    case 'CANCEL_NO_EFFECT': if(ctx.noPendingEffects!==true) throw Error('CANCEL_RECONCILIATION_REQUIRED');state='CANCELLED';break;
    case 'CONFIRM_CANCEL': if(ctx.reconciled!==true) throw Error('CANCEL_RECONCILIATION_REQUIRED');state='CANCELLED';break;
    case 'CANCEL_UNCERTAIN': state='BLOCKED';break;
  }
  if(terminal.has(current.state)) throw Error('TERMINAL_WORKFLOW');
  return Object.freeze({...current,state,phase,authorization_id:authorizationId,active_invocation_id:state==='ACTIVE'?current.active_invocation_id:null,revision_cycles:revisionCycles,correction_cycles:correctionCycles});
}
/** Internal projection used only after WorkflowLedger verifies a trusted P1 approval. */
export function projectVerifiedFinalApproval(current:WorkflowRecord):WorkflowRecord {
  if(current.state!=='AWAITING_APPROVAL'||current.phase!=='VALIDATING') throw Error('FINAL_APPROVAL_STATE_INVALID');
  return Object.freeze({...current,state:'COMPLETED',active_invocation_id:null});
}
export function isWorkflowTerminal(state:WorkflowState):boolean{return terminal.has(state);}
export function classifyLateProcessStart(current:AgentInvocationRecord):{readonly action:'CONTAIN_AND_RECONCILE';readonly invocation_id:string} {
  if(current.state!=='CANCEL_REQUESTED')throw Error('LATE_PROCESS_NOT_APPLICABLE');
  return Object.freeze({action:'CONTAIN_AND_RECONCILE',invocation_id:current.invocation_id});
}
const invocationEvents:Readonly<Record<InvocationState,readonly string[]>>={CREATED:['START','BLOCK'],STARTING:['PROCESS_STARTED','START_FAILED','INTERRUPTED','CANCEL'],RUNNING:['RESULT_SUCCESS','RESULT_FAILURE','INTERRUPTED','CANCEL'],CANCEL_REQUESTED:['CONFIRM_CANCEL','RESULT_UNCERTAIN','RESULT_FAILURE','PROCESS_STARTED'],SUCCEEDED:[],FAILED:[],INTERRUPTED:[],CANCELLED:[],BLOCKED:[]};
export interface InvocationTransitionContext {readonly terminalResultValid?:boolean;readonly processObservedStopped?:boolean;readonly identityValid?:boolean;readonly protocolValid?:boolean;readonly evidenceObserved?:boolean;readonly revocationPending?:boolean;readonly observedAt?:string;}
export function transitionInvocation(current:AgentInvocationRecord,event:string,ctx:InvocationTransitionContext={}):AgentInvocationRecord {
  if(!invocationEvents[current.state].includes(event)) throw Error('INVALID_INVOCATION_TRANSITION');
  let state:InvocationState=current.state;
  switch(event){case 'START':state='STARTING';break;case 'PROCESS_STARTED':if(current.state==='CANCEL_REQUESTED')throw Error('LATE_PROCESS_REQUIRES_CONTAINMENT');state='RUNNING';break;case 'START_FAILED':state='FAILED';break;case 'RESULT_FAILURE':if(!ctx.processObservedStopped)throw Error('PROCESS_RECONCILIATION_REQUIRED');state='FAILED';break;case 'INTERRUPTED':case 'RESULT_UNCERTAIN':if(!ctx.processObservedStopped)throw Error('PROCESS_RECONCILIATION_REQUIRED');state='INTERRUPTED';break;case 'CANCEL':state='CANCEL_REQUESTED';break;case 'CONFIRM_CANCEL':if(!ctx.processObservedStopped)throw Error('PROCESS_RECONCILIATION_REQUIRED');state='CANCELLED';break;case 'BLOCK':state='BLOCKED';break;case 'RESULT_SUCCESS':if(!ctx.terminalResultValid||!ctx.processObservedStopped||!ctx.identityValid||!ctx.protocolValid||!ctx.evidenceObserved||ctx.revocationPending)throw Error('INVOCATION_SUCCESS_UNPROVEN');state='SUCCEEDED';break;}
  const terminalState=['SUCCEEDED','FAILED','INTERRUPTED','CANCELLED','BLOCKED'].includes(state),at=ctx.observedAt??new Date().toISOString();
  return Object.freeze({...current,state,started_at:state==='STARTING'||state==='RUNNING'?(current.started_at??at):current.started_at,finished_at:terminalState?at:null});
}
