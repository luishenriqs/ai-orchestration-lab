import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  P2_CONTRACT_TYPES,
  createP2Validator,
  transitionWorkflow,
  transitionInvocation,
  WorkflowLedger,
  normalizeAgentMessage,
  evaluateIndependentReview,
  resolveEffectiveLimits,
  createEffectIntent,
  reconcileEffect,
  evaluateSandboxProof,
  parseCompleteUtf8JsonlLine,
  createAuthorizationProof,
  measureWorkflowActiveMs,
  createModelCatalog,
  resolveIdentity,
  authorizeWorkflow,
  checkAuthorization,
  classifyLateProcessStart,
} from '../../src/workflow/index.js';
import type { WorkflowRecord, AgentInvocationRecord, AgentMessageInput, AgentIdentity, WorkflowLimits } from '../../src/workflow/types.js';
import type { AuthorizationProof, FinalApprovalProof, GateProof } from '../../src/workflow/machine.js';
import { canonicalHash } from '../../src/contracts/integrity.js';
import { trustApproval } from '../../src/governance/approval.js';
import { task as createTask, approval as createApproval } from '../helpers/contracts.js';
import { processIdentity } from '../../src/execution/attempts.js';

const now = '2026-11-09T12:00:00.000Z';
const p1contract={...createTask('/tmp/wf-1','b'.repeat(40)),identity:{...createTask('/tmp/wf-1','b'.repeat(40)).identity,execution_id:'wf-1',repository:'ai-orchestration-lab'}};
const p1approval=createApproval(canonicalHash(p1contract),{execution_id:'wf-1',authorized_by:'test-human',approval_source:'P2_TEST_FIXTURE'});
const trusted=[trustApproval(p1approval)];
const limits:WorkflowLimits={workflow_active_ms:7_200_000,invocation_ms:1_200_000,invocations:1,review_cycles:5,correction_cycles:5,output_bytes_per_stream:10*1024*1024,message_bytes:1024*1024,operational_retries:0};
const authorization={schema_version:'2.0-p2' as const,authorization_id:'auth-1',workflow_id:'wf-1',approval_record_sha256:canonicalHash(p1approval),contract_sha256:canonicalHash(p1contract),repository:'ai-orchestration-lab',baseline_git:'b'.repeat(40),worktree:'/tmp/wf-1',allowed_paths:['src/sum.cjs'],allowed_operations:['WRITE'],allowed_agents:['openai/codex/gpt-x/1'],limits,network_policy:'DENY' as const,expires_at:'2027-01-01T00:00:00.000Z',revoked_at:null};
const authorizationProof:AuthorizationProof=createAuthorizationProof(authorization,p1approval,p1contract,trusted,now);
const taskReadyProof:GateProof={gate:'TASK-READY',workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),allowed:true,decided_at:now,authority:'SIMULATED_HOST'};
const modelCatalog=createModelCatalog('fixture-v1','P2 test fixture',[{provider_id:'openai',product:'codex',canonical_model_id:'gpt-x',aliases:['gpt-x-latest'],version:'1'}]);
const verifiedIdentity=resolveIdentity({provider_id:'openai',product:'codex',canonical_model_id:'gpt-x-latest',version:'1',source:'host-config+observed-provider-metadata',status:'DECLARED'},modelCatalog,{provider_id:'openai',product:'codex',model:'gpt-x',version:'1'});
const workflow: WorkflowRecord = {
  schema_version: '2.0-p2', workflow_id: 'wf-1', contract_sha256: canonicalHash(p1contract),
  repository: 'ai-orchestration-lab', baseline_git: 'b'.repeat(40), worktree: '/tmp/wf-1',
  state: 'CREATED', phase: 'NONE', authorization_id: null, created_at: now,
  active_invocation_id: null, revision_cycles: 0, correction_cycles: 0,
};
function setupActiveLedger(ledger:WorkflowLedger):void {
  ledger.create(workflow);ledger.recordAuthorization(authorization,p1approval,p1contract,trusted,now);
  ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{authorizationProof});
  ledger.transitionWorkflowEvent('wf-1','START',{gatesReady:true,authorizationProof,gateProof:taskReadyProof});
}
const invocation: AgentInvocationRecord = {
  schema_version: '2.0-p2', invocation_id: 'inv-1', workflow_id: 'wf-1', role: 'PLANNER',
  identity: verifiedIdentity,
  state: 'CREATED', execution_attempt_id: null, native_session_id: null, started_at: null, finished_at: null,
};

test('P2 schemas validate closed versioned contracts without altering P1 registry', () => {
  assert.equal(P2_CONTRACT_TYPES.length, 7);
  const validator = createP2Validator();
  assert.equal(validator.validate('Workflow', workflow).valid, true);
  assert.equal(validator.validate('Workflow', { ...workflow, surprise: true }).valid, false);
  assert.equal(validator.validate('AgentInvocation', invocation).valid, true);
});

test('workflow and invocation state machines reject invalid edges and enforce gates', () => {
  assert.throws(() => transitionWorkflow(workflow, 'START', { gatesReady: true }), /INVALID_WORKFLOW_TRANSITION/);
  const authorized = transitionWorkflow(workflow, 'AUTHORIZE', { authorizationProof });
  const active = transitionWorkflow(authorized, 'START', { gatesReady: true, authorizationProof, gateProof:taskReadyProof });
  assert.equal(active.state, 'ACTIVE');
  assert.throws(() => transitionInvocation(invocation, 'RESULT_SUCCESS'), /INVALID_INVOCATION_TRANSITION/);
  const starting = transitionInvocation(invocation, 'START');
  const running = transitionInvocation(starting, 'PROCESS_STARTED');
  assert.equal(running.state, 'RUNNING');
  const cancelling=transitionInvocation(starting,'CANCEL');
  assert.deepEqual(classifyLateProcessStart(cancelling),{action:'CONTAIN_AND_RECONCILE',invocation_id:'inv-1'});
  assert.throws(()=>transitionInvocation(cancelling,'PROCESS_STARTED'),/LATE_PROCESS_REQUIRES_CONTAINMENT/);
  assert.throws(()=>transitionInvocation(cancelling,'RESULT_UNCERTAIN'),/PROCESS_RECONCILIATION_REQUIRED/);
  assert.equal(transitionInvocation(cancelling,'RESULT_UNCERTAIN',{processObservedStopped:true}).state,'INTERRUPTED');
});

test('message normalization uses host identities, validates framing and rejects replay conflicts', () => {
  const input: AgentMessageInput = {
    workflow_id: 'wf-1', invocation_id: 'inv-1', correlation_id: 'corr-1', reply_to_message_id: null,
    source_event_id: 'provider-1', source_cursor: null, message_type: 'PLAN_RESULT', payload: { answer: 'ok' },
  };
  const normalized = normalizeAgentMessage(input, { sequence: 1, previous_event_hash: 'P2-LEDGER-GENESIS-v1', observed_at: now, correlation_id:'host-correlation', message_id: 'host-msg-1' });
  assert.equal(normalized.message_id, 'host-msg-1');
  assert.equal(normalized.correlation_id,'host-correlation');
  assert.match(normalized.payload_sha256, /^[a-f0-9]{64}$/);
  assert.throws(() => normalizeAgentMessage({ ...input, payload: 'x'.repeat(1_100_000) }, { sequence: 2, previous_event_hash: normalized.event_hash, observed_at: now, correlation_id:'host-correlation', message_id: 'host-msg-2' }), /MESSAGE_TOO_LARGE/);
  assert.deepEqual(parseCompleteUtf8JsonlLine(Buffer.from('{"ok":true}\n')),{ok:true});
  assert.throws(()=>parseCompleteUtf8JsonlLine(Buffer.from('{"ok":true}')),/INCOMPLETE/);
  assert.throws(()=>parseCompleteUtf8JsonlLine(Buffer.from([0xff,0x0a])),/INVALID_UTF8/);
});

test('ledger is append-only, hash chained, reconstructs projection and detects tampering', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'p2-ledger-'));
  try {
    const ledger = new WorkflowLedger(root);
    setupActiveLedger(ledger);
    assert.equal(ledger.project('wf-1').state, 'ACTIVE');
    const eventPath = path.join(root, 'wf-1', 'events', '00000001.json');
    const item = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as Record<string, unknown>;
    item.payload = { event: 'REJECT' };
    fs.writeFileSync(eventPath, JSON.stringify(item));
    assert.throws(() => ledger.verify('wf-1'), /LEDGER_INTEGRITY/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('ledger reconciles an abandoned lock only after owner process identity is stale',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-lock-'));
  try{
    const ledger=new WorkflowLedger(root);ledger.create(workflow);
    const lock=path.join(root,'wf-1','.ledger-lock');fs.writeFileSync(lock,JSON.stringify({nonce:'dead-owner',identity:{pid:process.pid,process_start_token:'stale-token',executable:'/stale'}}),{mode:0o600});
    ledger.append('wf-1','HOST_NOTE',{observed:'recovered'});
    assert.equal(ledger.verify('wf-1').length,2);
    assert.equal(fs.existsSync(lock+'.abandoned-dead-owner'),true);
    fs.writeFileSync(lock,JSON.stringify({nonce:'live-owner',identity:processIdentity(process.pid)}),{mode:0o600});
    assert.throws(()=>ledger.append('wf-1','HOST_NOTE',{observed:'must-not-run'}),/LEDGER_LOCKED/);
    assert.equal(fs.existsSync(lock),true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('ledger serializes invocation reservations and deduplicates replay across persisted events', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-replay-'));
  try {
    const ledger=new WorkflowLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);ledger.appendInvocation(invocation);
    assert.throws(()=>ledger.reserveInvocation('wf-1','inv-2',limits),/INVOCATION_LIMIT_EXCEEDED/);
    ledger.transitionInvocation('wf-1','inv-1','START');ledger.transitionInvocation('wf-1','inv-1','PROCESS_STARTED');
    assert.equal(ledger.project('wf-1').active_invocation_id,'inv-1');
    const msg:AgentMessageInput={workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'corr-1',reply_to_message_id:null,source_event_id:'evt-upstream-1',source_cursor:null,message_type:'PLAN_RESULT',payload:{plan:'ok'}};
    assert.equal(ledger.acceptMessage(msg).duplicate,false);
    assert.equal(ledger.acceptMessage(msg).duplicate,true);
    assert.throws(()=>ledger.acceptMessage({...msg,payload:{plan:'changed'}}),/SOURCE_EVENT_CONFLICT/);
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='AGENT_MESSAGE').length,1);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('ledger persists effect intent and blocks uncertain redispatch and path escapes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-effects-'));
  try{
    const ledger=new WorkflowLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);ledger.appendInvocation(invocation);ledger.transitionInvocation('wf-1','inv-1','START');ledger.transitionInvocation('wf-1','inv-1','PROCESS_STARTED');
    const auth=authorization;
    const binding={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),repository:'ai-orchestration-lab',baseline_git:'b'.repeat(40),worktree:'/tmp/wf-1'};
    const expected={provider_id:'mock',product:'sim-adapter',version:'1',configuration_hash:'1'.repeat(64),profile_hash:'2'.repeat(64),permissions_hash:'3'.repeat(64),evidence_hash:'4'.repeat(64)};
    const proof={schema_version:'2.0-p2' as const,...expected,validated_at:now,valid_until:'2027-01-01T00:00:00.000Z',status:'VALID' as const};
    assert.throws(()=>ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/sum.cjs'},auth,binding,invocation.identity,'src/sum.cjs'),/SANDBOX_PROOF_REQUIRED/);
    assert.throws(()=>ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/../secret'},auth,binding,invocation.identity,'src/../secret'),/EFFECT_UNAUTHORIZED/);
    const effect=ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/sum.cjs'},auth,binding,invocation.identity,'src/sum.cjs',proof,expected);
    ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH',auth,binding,invocation.identity,'src/sum.cjs',proof,expected);
    assert.equal(ledger.markDispatchedEffectsUncertain('wf-1').length,1);
    assert.throws(()=>ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH',auth,binding,invocation.identity,'src/sum.cjs',proof,expected),/EFFECT_REDISPATCH_FORBIDDEN/);
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='EFFECT_INTENT').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('simulated workflow requires matching gates and explicit final human approval',()=>{
  let current=transitionWorkflow(workflow,'AUTHORIZE',{authorizationProof});
  current=transitionWorkflow(current,'START',{gatesReady:true,authorizationProof,gateProof:taskReadyProof});
  assert.throws(()=>transitionWorkflow(current,'REQUEST_FINAL_APPROVAL',{gatesReady:true}),/FINAL_VALIDATION_REQUIRED/);
  current=transitionWorkflow(current,'ADVANCE_PHASE',{phaseGatePassed:true,nextPhase:'REVIEWING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
  current=transitionWorkflow(current,'ADVANCE_PHASE',{phaseGatePassed:true,nextPhase:'EXECUTING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
  current=transitionWorkflow(current,'ADVANCE_PHASE',{phaseGatePassed:true,nextPhase:'VALIDATING',gateProof:{...taskReadyProof,gate:'ValidationGate'}});
  current=transitionWorkflow(current,'REQUEST_FINAL_APPROVAL',{gatesReady:true,gateProof:{...taskReadyProof,gate:'ValidationGate'}});
  assert.throws(()=>transitionWorkflow(current,'APPROVE',{approvalValid:true}),/FINAL_APPROVAL_REQUIRED/);
  const approval:FinalApprovalProof={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),diff_sha256:'b'.repeat(64),review_sha256:'c'.repeat(64),evidence_sha256:'d'.repeat(64),actor:'human-1',source:'SIMULATED_HUMAN',verified:true,approved_at:now};
  current=transitionWorkflow(current,'APPROVE',{approvalValid:true,finalApprovalProof:approval});
  assert.equal(current.state,'COMPLETED');
});

test('G5 end-to-end ledger reaches COMPLETED only through phase gates and simulated human proof',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-e2e-'));
  try{
    const ledger=new WorkflowLedger(root);setupActiveLedger(ledger);
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{authorizationProof,phaseGatePassed:true,nextPhase:'REVIEWING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{authorizationProof,phaseGatePassed:true,nextPhase:'EXECUTING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{authorizationProof,phaseGatePassed:true,nextPhase:'VALIDATING',gateProof:{...taskReadyProof,gate:'ValidationGate'}});
    ledger.transitionWorkflowEvent('wf-1','REQUEST_FINAL_APPROVAL',{authorizationProof,gatesReady:true,gateProof:{...taskReadyProof,gate:'ValidationGate'}});
    const finalProof:FinalApprovalProof={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),diff_sha256:'b'.repeat(64),review_sha256:'c'.repeat(64),evidence_sha256:'d'.repeat(64),actor:'test-human',source:'SIMULATED_HUMAN',verified:true,approved_at:now};
    assert.throws(()=>ledger.transitionWorkflowEvent('wf-1','APPROVE',{approvalValid:true}),/FINAL_APPROVAL_REQUIRED/);
    ledger.transitionWorkflowEvent('wf-1','APPROVE',{approvalValid:true,finalApprovalProof:finalProof});
    assert.equal(ledger.project('wf-1').state,'COMPLETED');
    assert.equal(ledger.verify('wf-1').length,9);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('workflow duration excludes approval wait and counts active intervals',()=>{
  const t=Date.parse('2026-11-09T12:00:00.000Z');
  const events=[
    {observed_at:new Date(t).toISOString(),event_type:'WORKFLOW_CREATED'},
    {observed_at:new Date(t+1000).toISOString(),event_type:'WORKFLOW_TRANSITION',payload:{next_state:'AUTHORIZED'}},
    {observed_at:new Date(t+2000).toISOString(),event_type:'WORKFLOW_TRANSITION',payload:{next_state:'ACTIVE'}},
    {observed_at:new Date(t+60_000).toISOString(),event_type:'WORKFLOW_TRANSITION',payload:{next_state:'AWAITING_APPROVAL'}},
    {observed_at:new Date(t+3_660_000).toISOString(),event_type:'WORKFLOW_TRANSITION',payload:{next_state:'COMPLETED'}},
  ];
  assert.equal(measureWorkflowActiveMs(events as never,new Date(t+3_661_000).toISOString()),58_000);
});

test('revocation is persisted, blocks progress and puts active work into containment state',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-revoke-'));
  try{
    const ledger=new WorkflowLedger(root);setupActiveLedger(ledger);
    ledger.revokeAuthorization('wf-1','auth-1','2026-11-09T12:01:00.000Z');
    assert.equal(ledger.project('wf-1').state,'CANCEL_REQUESTED');
    assert.throws(()=>ledger.reserveInvocation('wf-1','inv-new',{workflow_active_ms:7_200_000,invocation_ms:1_200_000,invocations:1,review_cycles:5,correction_cycles:5,output_bytes_per_stream:10*1024*1024,message_bytes:1024*1024,operational_retries:0}),/WORKFLOW_NOT_ACTIVE/);
    ledger.transitionWorkflowEvent('wf-1','CONFIRM_CANCEL',{reconciled:true});
    assert.equal(ledger.project('wf-1').state,'CANCELLED');
    assert.throws(()=>ledger.transitionWorkflowEvent('wf-1','START',{gatesReady:true,authorizationProof,gateProof:taskReadyProof}),/AUTHORIZATION_NOT_CURRENT|INVALID_WORKFLOW_TRANSITION/);
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='AUTHORIZATION_REVOKED').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('revocation cancels an active invocation and forbids recording progress or success',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-revoke-active-'));
  try{
    const ledger=new WorkflowLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);ledger.appendInvocation(invocation);ledger.transitionInvocation('wf-1','inv-1','START');ledger.transitionInvocation('wf-1','inv-1','PROCESS_STARTED');
    ledger.revokeAuthorization('wf-1','auth-1','2026-11-09T12:01:00.000Z');
    assert.equal(ledger.project('wf-1').state,'CANCEL_REQUESTED');
    assert.equal(ledger.invocationsFrom(ledger.verify('wf-1'))[0]?.state,'CANCEL_REQUESTED');
    assert.throws(()=>ledger.transitionInvocation('wf-1','inv-1','RESULT_SUCCESS',{terminalResultValid:true,processObservedStopped:true,identityValid:true,protocolValid:true,evidenceObserved:true}),/AUTHORIZATION_REVOKED/);
    assert.throws(()=>ledger.acceptMessage({workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'corr-1',reply_to_message_id:null,source_event_id:'late-event',source_cursor:null,message_type:'EXECUTION_RESULT',payload:{ok:true}}),/WORKFLOW_NOT_ACTIVE/);
    ledger.transitionInvocation('wf-1','inv-1','CONFIRM_CANCEL',{processObservedStopped:true});
    ledger.transitionWorkflowEvent('wf-1','CONFIRM_CANCEL',{reconciled:true});
    assert.equal(ledger.project('wf-1').state,'CANCELLED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('crash recovery blocks workflow, prevents red dispatch, then resumes only after host reconciliation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-recovery-'));
  try{
    const ledger=new WorkflowLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);ledger.appendInvocation(invocation);ledger.transitionInvocation('wf-1','inv-1','START');ledger.transitionInvocation('wf-1','inv-1','PROCESS_STARTED');
    const binding={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),repository:'ai-orchestration-lab',baseline_git:'b'.repeat(40),worktree:'/tmp/wf-1'};
    const expected={provider_id:'mock',product:'sim-adapter',version:'1',configuration_hash:'1'.repeat(64),profile_hash:'2'.repeat(64),permissions_hash:'3'.repeat(64),evidence_hash:'4'.repeat(64)};
    const proof={schema_version:'2.0-p2' as const,...expected,validated_at:now,valid_until:'2027-01-01T00:00:00.000Z',status:'VALID' as const};
    const effect=ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/sum.cjs'},authorization,binding,invocation.identity,'src/sum.cjs',proof,expected);
    ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH',authorization,binding,invocation.identity,'src/sum.cjs',proof,expected);
    const recovered=ledger.recover('wf-1');
    assert.equal(recovered.state,'BLOCKED');assert.deepEqual(recovered.pending_invocations,['inv-1']);assert.deepEqual(recovered.pending_effects,[effect.effect_id]);
    assert.equal(ledger.effectsFrom(ledger.verify('wf-1'))[0]?.state,'RECONCILIATION_REQUIRED');
    assert.throws(()=>ledger.reserveInvocation('wf-1','inv-2',limits),/WORKFLOW_NOT_ACTIVE/);
    assert.throws(()=>ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH',authorization,binding,invocation.identity,'src/sum.cjs',proof,expected),/WORKFLOW_NOT_ACTIVE|EFFECT_REDISPATCH_FORBIDDEN/);
    ledger.transitionEffect('wf-1',effect.effect_id,'OBSERVED',authorization,binding,invocation.identity,'src/sum.cjs',proof,expected);
    ledger.transitionEffect('wf-1',effect.effect_id,'CONFIRM',authorization,binding,invocation.identity,'src/sum.cjs',proof,expected);
    ledger.transitionInvocation('wf-1','inv-1','INTERRUPTED',{processObservedStopped:true});
    ledger.transitionWorkflowEvent('wf-1','RESUME',{authorizationProof});
    assert.equal(ledger.project('wf-1').state,'ACTIVE');
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='WORKFLOW_RECOVERY_REQUIRED').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('review independence is derived from VERIFIED invocation identities and artifact ledger relations',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-review-'));
  try{
    const reviewLimits={...limits,invocations:3};const reviewAuthorization={...authorization,authorization_id:'auth-review',limits:reviewLimits};
    const reviewProof=createAuthorizationProof(reviewAuthorization,p1approval,p1contract,trusted,now);
    const ledger=new WorkflowLedger(root);ledger.create(workflow);ledger.recordAuthorization(reviewAuthorization,p1approval,p1contract,trusted,now);
    ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{authorizationProof:reviewProof});ledger.transitionWorkflowEvent('wf-1','START',{gatesReady:true,authorizationProof:reviewProof,gateProof:taskReadyProof});
    const reviewerCatalog=createModelCatalog('fixture-v1','P2 test fixture',[{provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',aliases:['gemini-y-latest'],version:'1'}]);
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y-latest',version:'1',source:'host-config+observed-provider-metadata',status:'DECLARED'},reviewerCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    const author={...invocation,invocation_id:'impl-1',role:'IMPLEMENTER' as const};
    const reviewer={...invocation,invocation_id:'review-1',role:'REVIEWER' as const,identity:reviewerIdentity};
    for(const item of [author,reviewer]){ledger.reserveInvocation('wf-1',item.invocation_id,reviewLimits);ledger.appendInvocation(item);ledger.transitionInvocation('wf-1',item.invocation_id,'START');ledger.transitionInvocation('wf-1',item.invocation_id,'PROCESS_STARTED');ledger.transitionInvocation('wf-1',item.invocation_id,'RESULT_SUCCESS',{terminalResultValid:true,processObservedStopped:true,identityValid:true,protocolValid:true,evidenceObserved:true});}
    const hash='e'.repeat(64);ledger.recordArtifactAuthorship('wf-1',hash,'impl-1');ledger.recordArtifactReview('wf-1',hash,'review-1');
    assert.equal(ledger.reviewIndependence('wf-1',hash,'review-1').allowed,true);
    const sameModel={...reviewer,invocation_id:'review-2',identity:invocation.identity};ledger.reserveInvocation('wf-1',sameModel.invocation_id,reviewLimits);ledger.appendInvocation(sameModel);ledger.transitionInvocation('wf-1',sameModel.invocation_id,'START');ledger.transitionInvocation('wf-1',sameModel.invocation_id,'PROCESS_STARTED');ledger.transitionInvocation('wf-1',sameModel.invocation_id,'RESULT_SUCCESS',{terminalResultValid:true,processObservedStopped:true,identityValid:true,protocolValid:true,evidenceObserved:true});ledger.recordArtifactReview('wf-1',hash,'review-2');
    assert.equal(ledger.reviewIndependence('wf-1',hash,'review-2').allowed,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('authorization gates independence, revocation, and sandbox proof fail closed', () => {
  const a: AgentIdentity = { provider_id: 'a', product: 'cli', canonical_model_id: 'm1', version: '1', source: 'host', status: 'VERIFIED' };
  const b: AgentIdentity = { ...a, provider_id: 'b', canonical_model_id: 'm2' };
  const relation={reviewerInvocationId:'review-invocation',artifactAuthorInvocationIds:['author-invocation']};
  assert.equal(evaluateIndependentReview(a, b, relation).allowed, true);
  assert.equal(evaluateIndependentReview(a, { ...b, status: 'UNKNOWN' }, relation).allowed, false);
  assert.equal(evaluateIndependentReview(a, a, {...relation,reviewerInvocationId:'author-invocation'}).allowed, false);
  assert.equal(evaluateSandboxProof(null, { provider_id: 'a', product: 'cli', version: '1', configuration_hash: 'a'.repeat(64), profile_hash: 'b'.repeat(64), permissions_hash: 'c'.repeat(64), evidence_hash: 'd'.repeat(64) }, now).allowed, false);
  assert.equal(authorizeWorkflow(authorization,p1approval,p1contract,trusted).allowed,true);
  assert.equal(authorizeWorkflow({...authorization,network_policy:'ALLOWLIST'},p1approval,p1contract,trusted).allowed,false);
  const binding={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),repository:'ai-orchestration-lab',baseline_git:'b'.repeat(40),worktree:'/tmp/wf-1'};
  assert.equal(checkAuthorization(authorization,binding,now,'WRITE',invocation.identity,'src/sum.cjs').allowed,true);
  assert.equal(checkAuthorization(authorization,binding,now,'WRITE',{...invocation.identity,canonical_model_id:'different-model'},'src/sum.cjs').allowed,false);
  assert.equal(checkAuthorization(authorization,binding,now,'WRITE',invocation.identity,'src/../secret').allowed,false);
});

test('limits are bounded and UNKNOWN usage remains unknown', () => {
  const global: WorkflowLimits = { workflow_active_ms: 7_200_000, invocation_ms: 1_200_000, invocations: 30, review_cycles: 5, correction_cycles: 5, output_bytes_per_stream: 10 * 1024 * 1024, message_bytes: 1024 * 1024, operational_retries: 0 };
  const task: WorkflowLimits = { ...global, invocation_ms: 600_000, invocations: 2 };
  const effective = resolveEffectiveLimits(task, global);
  assert.equal(effective.invocation_ms, 600_000);
  assert.equal(effective.invocations, 2);
  assert.throws(() => resolveEffectiveLimits({ ...task, operational_retries: 1 } as unknown as WorkflowLimits, global), /INVALID_LIMIT/);
});

test('effect intent is never redispatched after uncertain outcome', () => {
  const intent = createEffectIntent('wf-1', 'inv-1', 'WRITE', { path: 'src/a.ts' }, now);
  const dispatched = reconcileEffect(intent, 'DISPATCH', null);
  const uncertain = reconcileEffect(dispatched, 'UNKNOWN', null);
  assert.equal(uncertain.state, 'RECONCILIATION_REQUIRED');
  assert.throws(() => reconcileEffect(uncertain, 'DISPATCH', null), /EFFECT_REDISPATCH_FORBIDDEN/);
});
