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
  measureInvocationMs,
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
const mergeDiff='b'.repeat(64),mergeReviewHash='c'.repeat(64),mergeEvidenceHash='d'.repeat(64);
const p1mergeApproval=createApproval(canonicalHash(p1contract),{approval_id:'P2-MERGE-FIXTURE',execution_id:'wf-1',approval_scope:'MERGE',authorized_by:'test-human',approval_source:'P2_TEST_FIXTURE',attempt_id:'attempt-1',approved_diff_sha256:mergeDiff,review_id:'review-1'});
const trusted=[trustApproval(p1approval),trustApproval(p1mergeApproval)];
const limits:WorkflowLimits={workflow_active_ms:7_200_000,invocation_ms:1_200_000,invocations:1,review_cycles:5,correction_cycles:5,output_bytes_per_stream:10*1024*1024,message_bytes:1024*1024,operational_retries:0};
const authorization={schema_version:'2.0-p2' as const,authorization_id:'auth-1',workflow_id:'wf-1',approval_record_sha256:canonicalHash(p1approval),contract_sha256:canonicalHash(p1contract),repository:'ai-orchestration-lab',baseline_git:'b'.repeat(40),worktree:'/tmp/wf-1',allowed_paths:['src/sum.cjs'],allowed_operations:['WRITE'],allowed_agents:['openai/codex/gpt-x/1'],limits,network_policy:'DENY' as const,expires_at:'2027-01-01T00:00:00.000Z',revoked_at:null};
const authorizationProof:AuthorizationProof=createAuthorizationProof(authorization,p1approval,p1contract,trusted,now);
const taskReadyProof:GateProof={gate:'TASK-READY',workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),allowed:true,decided_at:now,authority:'SIMULATED_HOST'};
const modelCatalog=createModelCatalog('fixture-v1','P2 test fixture',[{provider_id:'openai',product:'codex',canonical_model_id:'gpt-x',aliases:['gpt-x-latest'],version:'1'}]);
const fullModelCatalog=createModelCatalog('fixture-v1','P2 test fixture',[{provider_id:'openai',product:'codex',canonical_model_id:'gpt-x',aliases:['gpt-x-latest'],version:'1'},{provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',aliases:['gemini-y-latest'],version:'1'}]);
const sandboxProfile={configuration_hash:'1'.repeat(64),profile_hash:'2'.repeat(64),permissions_hash:'3'.repeat(64),evidence_hash:'4'.repeat(64)};
const sandboxRecord={schema_version:'2.0-p2' as const,provider_id:'openai',product:'codex',version:'1',...sandboxProfile,validated_at:now,valid_until:'2027-01-01T00:00:00.000Z',status:'VALID' as const};
const verifiedIdentity=resolveIdentity({provider_id:'openai',product:'codex',canonical_model_id:'gpt-x-latest',version:'1',source:'host-config+observed-provider-metadata',status:'DECLARED'},modelCatalog,{provider_id:'openai',product:'codex',model:'gpt-x',version:'1'});
const workflow: WorkflowRecord = {
  schema_version: '2.0-p2', workflow_id: 'wf-1', contract_sha256: canonicalHash(p1contract),
  repository: 'ai-orchestration-lab', baseline_git: 'b'.repeat(40), worktree: '/tmp/wf-1',
  state: 'CREATED', phase: 'NONE', authorization_id: null, created_at: now,
  active_invocation_id: null, revision_cycles: 0, correction_cycles: 0,
};
function setupActiveLedger(ledger:WorkflowLedger):void {
  ledger.create(workflow);ledger.recordAuthorization(authorization,p1approval,p1contract,now);
  ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{authorizationProof});
  ledger.transitionWorkflowEvent('wf-1','START',{gatesReady:true,authorizationProof,gateProof:taskReadyProof});
}
function newLedger(root:string):WorkflowLedger{return new WorkflowLedger(root,{trusted_approvals:trusted,model_catalog:fullModelCatalog,fixture_id:'p2-unit-test',sandbox_profiles:{'openai/codex/gpt-x/1':sandboxProfile},sandbox_validations:[sandboxRecord],p1_pr_gate_verifier:(binding)=>({gate:'PR-GATE',allowed:true,reasons:[],decided_at:now,execution_id:binding.workflow_id,attempt_id:binding.attempt_id,contract_sha256:binding.contract_sha256})});}
function observed(i:AgentInvocationRecord){return {provider_id:i.identity.provider_id,product:i.identity.product,model:i.identity.canonical_model_id,version:i.identity.version};}
function appendInvocation(ledger:WorkflowLedger,i:AgentInvocationRecord,observation=observed(i)){return ledger.appendInvocation(i,observation);}
function processStart(ledger:WorkflowLedger,id:string){ledger.recordFixtureInvocationObservation('wf-1',id,'PROCESS_STARTED','a'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1',id,'PROCESS_STARTED');}
function succeedFixture(ledger:WorkflowLedger,id:string){ledger.recordFixtureInvocationObservation('wf-1',id,'PROCESS_STOPPED','b'.repeat(64),'p2-unit-test');ledger.recordFixtureInvocationObservation('wf-1',id,'TERMINAL_RESULT','c'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1',id,'RESULT_SUCCESS');}
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
  assert.equal(transitionInvocation(cancelling,'PROCESS_STARTED').state,'CANCEL_REQUESTED');
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
    const ledger = newLedger(root);
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
    const ledger=newLedger(root);ledger.create(workflow);
    const lock=path.join(root,'wf-1','.ledger-lock');fs.writeFileSync(lock,JSON.stringify({nonce:'dead-owner',identity:{pid:process.pid,process_start_token:'stale-token',executable:'/stale'}}),{mode:0o600});
    ledger.append('wf-1','HOST_NOTE',{observed:'recovered'});
    assert.equal(ledger.verify('wf-1').length,2);
    assert.equal(fs.existsSync(lock+'.abandoned-dead-owner'),true);
    fs.writeFileSync(lock,JSON.stringify({nonce:'broken-owner',identity:{pid:'bad'}}),{mode:0o600});
    assert.throws(()=>ledger.append('wf-1','HOST_NOTE',{observed:'malformed'}),/LEDGER_LOCK_MALFORMED/);fs.unlinkSync(lock);
    fs.writeFileSync(lock,JSON.stringify({nonce:'live-owner',identity:processIdentity(process.pid)}),{mode:0o600});
    assert.throws(()=>ledger.append('wf-1','HOST_NOTE',{observed:'must-not-run'}),/LEDGER_LOCKED/);
    assert.equal(fs.existsSync(lock),true);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('ledger serializes invocation reservations and deduplicates replay across persisted events', () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-replay-'));
  try {
    const ledger=newLedger(root);setupActiveLedger(ledger);
    const firstReservation=ledger.reserveInvocation('wf-1','inv-1',limits);assert.deepEqual(ledger.reserveInvocation('wf-1','inv-1',limits),firstReservation);appendInvocation(ledger,invocation);
    assert.throws(()=>ledger.reserveInvocation('wf-1','inv-2',limits),/INVOCATION_LIMIT_EXCEEDED/);
    ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    assert.equal(ledger.project('wf-1').active_invocation_id,'inv-1');
    const msg:AgentMessageInput={workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'corr-1',reply_to_message_id:null,source_event_id:'evt-upstream-1',source_cursor:null,message_type:'PLAN_RESULT',payload:{plan:'ok'}};
    assert.equal(ledger.acceptMessage(msg).duplicate,false);
    assert.equal(ledger.acceptMessage(msg).duplicate,true);
    assert.throws(()=>ledger.acceptMessage({...msg,payload:{plan:'changed'}}),/SOURCE_EVENT_CONFLICT/);
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='AGENT_MESSAGE').length,1);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});

test('host configuration snapshots identity and trust; caller identity claims cannot authorize an invocation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-host-config-'));
  try{
    const catalog=createModelCatalog('fixture-v1','P2 test fixture',[{provider_id:'openai',product:'codex',canonical_model_id:'gpt-x',aliases:['gpt-x-latest'],version:'1'}]);
    const mutableTrusted=[...trusted];const ledger=new WorkflowLedger(root,{trusted_approvals:mutableTrusted,model_catalog:catalog,fixture_id:'p2-unit-test'});mutableTrusted.splice(0);
    setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','forged',limits);
    assert.throws(()=>appendInvocation(ledger,{...invocation,invocation_id:'forged',identity:{...invocation.identity,status:'VERIFIED',catalog_hash:'f'.repeat(64)}},{provider_id:'attacker',product:'codex',model:'gpt-x',version:'1'} as never),/AGENT_IDENTITY_NOT_VERIFIED/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('task message byte cap and monotonic persisted cursors are enforced',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-message-limits-'));
  try{
    const smallLimits={...limits,message_bytes:2048};const auth={...authorization,authorization_id:'auth-small-message',limits:smallLimits};
    const ledger=newLedger(root);ledger.create(workflow);ledger.recordAuthorization(auth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    ledger.reserveInvocation('wf-1','inv-1',smallLimits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    assert.throws(()=>ledger.acceptMessage({workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'x',reply_to_message_id:null,source_event_id:null,source_cursor:'1',message_type:'PLAN_RESULT',payload:{data:'x'.repeat(3000)}}),/MESSAGE_TOO_LARGE/);
    const msg={workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'x',reply_to_message_id:null,source_event_id:null,source_cursor:'2',message_type:'PLAN_RESULT' as const,payload:{ok:true}};
    assert.equal(ledger.acceptMessage(msg).duplicate,false);
    assert.throws(()=>ledger.acceptMessage({...msg,source_cursor:'1'}),/SOURCE_CURSOR_REWIND/);
    assert.throws(()=>ledger.acceptMessage({...msg,source_cursor:'3',message_type:'CONTROL_EVENT'}),/CONTROL_EVENT_HOST_ONLY/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('expired authorization blocks progress using host clock and ignores caller timestamps',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-expiry-'));let clock=Date.parse(now);
  try{
    const expiry=new Date(clock+1000).toISOString();const auth={...authorization,authorization_id:'auth-short',expires_at:expiry};
    const ledger=new WorkflowLedger(root,{trusted_approvals:trusted,model_catalog:fullModelCatalog,fixture_id:'p2-unit-test',clock:()=>clock});ledger.create(workflow);
    ledger.recordAuthorization(auth,p1approval,p1contract,'1900-01-01T00:00:00.000Z');ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    clock+=1001;
    assert.throws(()=>ledger.reserveInvocation('wf-1','expired',limits),/AUTHORIZATION_EXPIRED/);
    assert.equal(ledger.project('wf-1').state,'BLOCKED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('ledger persists effect intent and blocks uncertain redispatch and path escapes',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-effects-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    assert.throws(()=>ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/../secret'},'src/../secret'),/EFFECT_UNAUTHORIZED/);
    const effect=ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/sum.cjs'},'src/sum.cjs');
    ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH');
    assert.equal(ledger.markDispatchedEffectsUncertain('wf-1').length,1);
    assert.throws(()=>ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH'),/EFFECT_REDISPATCH_FORBIDDEN/);
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='EFFECT_INTENT').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('simulated workflow requires matching gates and explicit final human approval',()=>{
  let current=transitionWorkflow(workflow,'AUTHORIZE',{authorizationProof});
  current=transitionWorkflow(current,'START',{gatesReady:true,authorizationProof,gateProof:taskReadyProof});
  assert.throws(()=>transitionWorkflow(current,'REQUEST_FINAL_APPROVAL',{gatesReady:true}),/FINAL_VALIDATION_REQUIRED/);
  current=transitionWorkflow(current,'ADVANCE_PHASE',{phaseGatePassed:true,nextPhase:'REVIEWING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
  current=transitionWorkflow(current,'ADVANCE_PHASE',{phaseGatePassed:true,nextPhase:'EXECUTING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
  current=transitionWorkflow(current,'ADVANCE_PHASE',{nextPhase:'REVIEWING'});
  current=transitionWorkflow(current,'ADVANCE_PHASE',{phaseGatePassed:true,nextPhase:'VALIDATING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
  current=transitionWorkflow(current,'REQUEST_FINAL_APPROVAL',{gatesReady:true,gateProof:{...taskReadyProof,gate:'ValidationGate'}});
  assert.throws(()=>transitionWorkflow(current,'APPROVE',{approvalValid:true}),/USE_FINAL_APPROVAL_API/);
  const approval:FinalApprovalProof={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),diff_sha256:'b'.repeat(64),review_sha256:'c'.repeat(64),evidence_sha256:'d'.repeat(64),actor:'human-1',source:'SIMULATED_HUMAN',verified:true,approved_at:now};
  assert.throws(()=>transitionWorkflow(current,'APPROVE',{approvalValid:true,finalApprovalProof:approval}),/USE_FINAL_APPROVAL_API/);
  assert.equal(current.state,'AWAITING_APPROVAL');
});

test('G5 ledger rejects caller-authored gates and final-approval proofs',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-e2e-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{authorizationProof,phaseGatePassed:true,nextPhase:'REVIEWING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}});
    assert.throws(()=>ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{authorizationProof,phaseGatePassed:true,nextPhase:'EXECUTING',gateProof:{...taskReadyProof,gate:'REVIEW-GATE'}}),/HOST_GATE_REQUIRED/);
    assert.throws(()=>ledger.transitionWorkflowEvent('wf-1','APPROVE',{approvalValid:true,finalApprovalProof:{workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),diff_sha256:mergeDiff,review_sha256:mergeReviewHash,evidence_sha256:mergeEvidenceHash,actor:'test-human',source:'SIMULATED_HUMAN',verified:true,approved_at:now}}),/USE_FINAL_APPROVAL_API/);
    assert.equal(ledger.project('wf-1').state,'ACTIVE');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('G5 accepts a complete simulated workflow only with ledger evidence and trusted P1 merge approval',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-valid-e2e-'));
  try{
    const flowLimits={...limits,invocations:5};
    const flowAuthorization={...authorization,authorization_id:'auth-e2e',limits:flowLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};
    const ledger=new WorkflowLedger(root,{trusted_approvals:trusted,model_catalog:fullModelCatalog,fixture_id:'p2-unit-test',sandbox_profiles:{'openai/codex/gpt-x/1':sandboxProfile},sandbox_validations:[sandboxRecord],p1_pr_gate_verifier:(b)=>({gate:'PR-GATE',allowed:true,reasons:[],decided_at:now,execution_id:b.workflow_id,attempt_id:b.attempt_id,contract_sha256:b.contract_sha256})});
    ledger.create(workflow);ledger.recordAuthorization(flowAuthorization,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',version:'1',source:'host-config',status:'DECLARED'},fullModelCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    const failed={...invocation,invocation_id:'failed-previously',role:'PLANNER' as const};ledger.reserveInvocation('wf-1',failed.invocation_id,flowLimits);appendInvocation(ledger,failed);ledger.transitionInvocation('wf-1',failed.invocation_id,'START');processStart(ledger,failed.invocation_id);ledger.recordFixtureInvocationObservation('wf-1',failed.invocation_id,'PROCESS_STOPPED','b'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1',failed.invocation_id,'RESULT_FAILURE');
    const records=[{...invocation,invocation_id:'impl',role:'IMPLEMENTER' as const},{...invocation,invocation_id:'review',role:'REVIEWER' as const,identity:reviewerIdentity},{...invocation,invocation_id:'validator',role:'VALIDATOR' as const}];
    for(const item of records){ledger.reserveInvocation('wf-1',item.invocation_id,flowLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',item.invocation_id,'START');processStart(ledger,item.invocation_id);succeedFixture(ledger,item.invocation_id);}
    ledger.recordArtifactAuthorship('wf-1',mergeDiff,'impl','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1',mergeDiff,'review','p2-unit-test',mergeReviewHash);
    ledger.recordFixtureEvidence('wf-1','VALIDATION','validator',mergeEvidenceHash,'p2-unit-test');ledger.recordFixtureEvidence('wf-1','FINAL','validator',mergeEvidenceHash,'p2-unit-test');
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});
    ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'EXECUTING'});
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});
    ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'VALIDATING'});
    ledger.evaluateGate('wf-1','ValidationGate','p2-unit-test');
    ledger.transitionWorkflowEvent('wf-1','REQUEST_FINAL_APPROVAL',{});
    ledger.recordFinalApproval('wf-1',p1mergeApproval,'attempt-1','review-1',mergeDiff,mergeReviewHash,mergeEvidenceHash,'p2-unit-test');
    assert.equal(ledger.project('wf-1').state,'COMPLETED');
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='FINAL_APPROVAL_RECORDED').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R2 regression: resume from NONE does not create an invalid ACTIVE/NONE workflow',()=>{
  const authorized=transitionWorkflow(workflow,'AUTHORIZE',{authorizationProof});
  const blocked=transitionWorkflow(authorized,'REVOKE');
  const resumed=transitionWorkflow(blocked,'RESUME',{authorizationProof:{...authorizationProof,authorization_id:'auth-new'}});
  assert.notEqual(resumed.phase,'NONE');
});

test('R2 regression: initial grants reject invalid or forbidden path entries',()=>{
  const binding={workflow_id:'wf-1',contract_sha256:canonicalHash(p1contract),repository:'ai-orchestration-lab',baseline_git:'b'.repeat(40),worktree:'/tmp/wf-1'};
  assert.equal(authorizeWorkflow({...authorization,allowed_paths:['src/../secret']},p1approval,p1contract,trusted).allowed,false);
  assert.equal(checkAuthorization({...authorization,allowed_paths:['src/sum.cjs','protected.txt']},binding,now,'WRITE',invocation.identity,'src/sum.cjs',['protected.txt']).allowed,false);
});

test('R2 regression: same source event cannot be replayed with a different source cursor',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-cursor-conflict-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    const msg={workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'c',reply_to_message_id:null,source_event_id:'source-1',source_cursor:'4',message_type:'PLAN_RESULT' as const,payload:{p:1}};
    ledger.acceptMessage(msg);
    assert.throws(()=>ledger.acceptMessage({...msg,source_cursor:'5'}),/SOURCE_EVENT_CONFLICT/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R2: failed historical invocation is retained but reconciled before successful completion',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r2-failed-history-'));
  try{
    const flowLimits={...limits,invocations:5};const flowAuth={...authorization,limits:flowLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};
    const ledger=new WorkflowLedger(root,{trusted_approvals:trusted,model_catalog:fullModelCatalog,fixture_id:'p2-unit-test',p1_pr_gate_verifier:b=>({gate:'PR-GATE',allowed:true,reasons:[],decided_at:now,execution_id:b.workflow_id,attempt_id:b.attempt_id,contract_sha256:b.contract_sha256})});
    ledger.create(workflow);ledger.recordAuthorization(flowAuth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    const failed={...invocation,invocation_id:'failed-history',role:'PLANNER' as const};ledger.reserveInvocation('wf-1',failed.invocation_id,flowLimits);appendInvocation(ledger,failed);ledger.transitionInvocation('wf-1',failed.invocation_id,'START');processStart(ledger,failed.invocation_id);ledger.recordFixtureInvocationObservation('wf-1',failed.invocation_id,'PROCESS_STOPPED','b'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1',failed.invocation_id,'RESULT_FAILURE');
    const reviewer=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',version:'1',source:'host-config',status:'DECLARED'},fullModelCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    for(const item of [{...invocation,invocation_id:'impl',role:'IMPLEMENTER' as const},{...invocation,invocation_id:'review',role:'REVIEWER' as const,identity:reviewer},{...invocation,invocation_id:'validator',role:'VALIDATOR' as const}]){ledger.reserveInvocation('wf-1',item.invocation_id,flowLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',item.invocation_id,'START');processStart(ledger,item.invocation_id);succeedFixture(ledger,item.invocation_id);}
    ledger.recordArtifactAuthorship('wf-1',mergeDiff,'impl','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1',mergeDiff,'review','p2-unit-test',mergeReviewHash);ledger.recordFixtureEvidence('wf-1','VALIDATION','validator',mergeEvidenceHash,'p2-unit-test');ledger.recordFixtureEvidence('wf-1','FINAL','validator',mergeEvidenceHash,'p2-unit-test');
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'EXECUTING'});ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'VALIDATING'});ledger.evaluateGate('wf-1','ValidationGate','p2-unit-test');ledger.transitionWorkflowEvent('wf-1','REQUEST_FINAL_APPROVAL',{});
    ledger.recordFinalApproval('wf-1',p1mergeApproval,'attempt-1','review-1',mergeDiff,mergeReviewHash,mergeEvidenceHash,'p2-unit-test');
    assert.equal(ledger.project('wf-1').state,'COMPLETED');assert.equal(ledger.invocationsFrom(ledger.verify('wf-1')).find(i=>i.invocation_id==='failed-history')?.state,'FAILED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R2: FAIL enters containment while an invocation is active; CREATED invocations can be cancelled safely',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r2-fail-containment-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    ledger.transitionWorkflowEvent('wf-1','FAIL',{});assert.equal(ledger.project('wf-1').state,'CANCEL_REQUESTED');assert.equal(ledger.invocationsFrom(ledger.verify('wf-1'))[0]?.state,'CANCEL_REQUESTED');
    ledger.recordFixtureInvocationObservation('wf-1','inv-1','PROCESS_STOPPED','e'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1','inv-1','RESULT_UNCERTAIN');ledger.transitionWorkflowEvent('wf-1','CONFIRM_FAIL',{});assert.equal(ledger.project('wf-1').state,'FAILED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
  const createdRoot=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r2-created-cancel-'));
  try{
    const ledger=newLedger(createdRoot);setupActiveLedger(ledger);ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionWorkflowEvent('wf-1','CANCEL',{});
    assert.equal(ledger.invocationsFrom(ledger.verify('wf-1'))[0]?.state,'CANCELLED');ledger.transitionWorkflowEvent('wf-1','CONFIRM_CANCEL',{});assert.equal(ledger.project('wf-1').state,'CANCELLED');
  }finally{fs.rmSync(createdRoot,{recursive:true,force:true});}
});

test('R2: duration exhaustion blocks progress and requests invocation containment',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r2-timeout-'));
  try{
    let clock=Date.parse(now);const ledger=new WorkflowLedger(root,{trusted_approvals:trusted,model_catalog:fullModelCatalog,fixture_id:'p2-unit-test',clock:()=>clock});setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');
    clock+=7_200_001;assert.throws(()=>ledger.assertBudgets('wf-1'),/DURATION_LIMIT_EXCEEDED/);assert.equal(ledger.project('wf-1').state,'BLOCKED');assert.equal(ledger.invocationsFrom(ledger.verify('wf-1'))[0]?.state,'CANCEL_REQUESTED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R2: a review gate becomes stale when a new artifact is authored in the same review cycle',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r2-stale-gate-'));
  try{
    const flowLimits={...limits,invocations:5};const flowAuth={...authorization,limits:flowLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};
    const ledger=newLedger(root);ledger.create(workflow);ledger.recordAuthorization(flowAuth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',version:'1',source:'host-config',status:'DECLARED'},fullModelCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    for(const item of [{...invocation,invocation_id:'impl',role:'IMPLEMENTER' as const},{...invocation,invocation_id:'review',role:'REVIEWER' as const,identity:reviewerIdentity}]){ledger.reserveInvocation('wf-1',item.invocation_id,flowLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',item.invocation_id,'START');processStart(ledger,item.invocation_id);succeedFixture(ledger,item.invocation_id);}
    ledger.recordArtifactAuthorship('wf-1',mergeDiff,'impl','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1',mergeDiff,'review','p2-unit-test',mergeReviewHash);ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');
    const newer={...invocation,invocation_id:'impl-new',role:'IMPLEMENTER' as const};ledger.reserveInvocation('wf-1',newer.invocation_id,flowLimits);appendInvocation(ledger,newer);ledger.transitionInvocation('wf-1',newer.invocation_id,'START');processStart(ledger,newer.invocation_id);succeedFixture(ledger,newer.invocation_id);ledger.recordArtifactAuthorship('wf-1','f'.repeat(64),'impl-new','src/sum.cjs','p2-unit-test');
    assert.throws(()=>ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'EXECUTING'}),/HOST_GATE_REQUIRED:REVIEW-GATE/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R2: blocked effects are reconciled for cancellation but never treated as successful',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r2-blocked-effect-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    const effect=ledger.createEffectIntent('wf-1','inv-1','WRITE',{change:'x'},'src/sum.cjs');ledger.transitionEffect('wf-1',effect.effect_id,'BLOCK');ledger.transitionWorkflowEvent('wf-1','BLOCK',{reason:'effect-blocked'});
    ledger.recordFixtureInvocationObservation('wf-1','inv-1','PROCESS_STOPPED','f'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1','inv-1','CONFIRM_CANCEL');ledger.transitionWorkflowEvent('wf-1','CANCEL',{});ledger.transitionWorkflowEvent('wf-1','CONFIRM_CANCEL',{});
    assert.equal(ledger.project('wf-1').state,'CANCELLED');assert.equal(ledger.verify('wf-1').find(e=>e.event_type==='EFFECT_INTENT')?.payload instanceof Object,true);
    assert.throws(()=>ledger.transitionWorkflowEvent('wf-1','RESUME',{}),/EFFECTS_NEED_RECONCILIATION/);
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
    const ledger=newLedger(root);setupActiveLedger(ledger);
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
    const ledger=newLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    ledger.revokeAuthorization('wf-1','auth-1','2026-11-09T12:01:00.000Z');
    assert.equal(ledger.project('wf-1').state,'CANCEL_REQUESTED');
    assert.equal(ledger.invocationsFrom(ledger.verify('wf-1'))[0]?.state,'CANCEL_REQUESTED');
    assert.throws(()=>ledger.transitionInvocation('wf-1','inv-1','RESULT_SUCCESS',{terminalResultValid:true,processObservedStopped:true,identityValid:true,protocolValid:true,evidenceObserved:true}),/AUTHORIZATION_REVOKED/);
    assert.throws(()=>ledger.acceptMessage({workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'corr-1',reply_to_message_id:null,source_event_id:'late-event',source_cursor:null,message_type:'EXECUTION_RESULT',payload:{ok:true}}),/WORKFLOW_NOT_ACTIVE/);
    ledger.recordFixtureInvocationObservation('wf-1','inv-1','PROCESS_STOPPED','d'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1','inv-1','CONFIRM_CANCEL');
    ledger.transitionWorkflowEvent('wf-1','CONFIRM_CANCEL',{reconciled:true});
    assert.equal(ledger.project('wf-1').state,'CANCELLED');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('crash recovery blocks workflow, prevents red dispatch, then resumes only after host reconciliation',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-recovery-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);
    ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    const effect=ledger.createEffectIntent('wf-1','inv-1','WRITE',{path:'src/sum.cjs'},'src/sum.cjs');
    ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH');
    const recovered=ledger.recover('wf-1');
    assert.equal(recovered.state,'BLOCKED');assert.deepEqual(recovered.pending_invocations,['inv-1']);assert.deepEqual(recovered.pending_effects,[effect.effect_id]);
    assert.equal(ledger.effectsFrom(ledger.verify('wf-1'))[0]?.state,'RECONCILIATION_REQUIRED');
    assert.throws(()=>ledger.reserveInvocation('wf-1','inv-2',limits),/WORKFLOW_NOT_ACTIVE/);
    assert.throws(()=>ledger.transitionEffect('wf-1',effect.effect_id,'DISPATCH'),/WORKFLOW_NOT_ACTIVE|EFFECT_REDISPATCH_FORBIDDEN/);
    ledger.transitionEffect('wf-1',effect.effect_id,'OBSERVED');
    ledger.transitionEffect('wf-1',effect.effect_id,'CONFIRM');
    ledger.recordFixtureInvocationObservation('wf-1','inv-1','PROCESS_STOPPED','d'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1','inv-1','RESULT_UNCERTAIN');
    ledger.transitionWorkflowEvent('wf-1','RESUME',{authorizationProof});
    assert.equal(ledger.project('wf-1').state,'ACTIVE');
    assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='WORKFLOW_RECOVERY_REQUIRED').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('review independence is derived from VERIFIED invocation identities and artifact ledger relations',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-review-'));
  try{
    const reviewLimits={...limits,invocations:3};const reviewAuthorization={...authorization,authorization_id:'auth-review',limits:reviewLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};
    const reviewProof=createAuthorizationProof(reviewAuthorization,p1approval,p1contract,trusted,now);
    const ledger=newLedger(root);ledger.create(workflow);ledger.recordAuthorization(reviewAuthorization,p1approval,p1contract,now);
    ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{authorizationProof:reviewProof});ledger.transitionWorkflowEvent('wf-1','START',{gatesReady:true,authorizationProof:reviewProof,gateProof:taskReadyProof});
    const reviewerCatalog=createModelCatalog('fixture-v1','P2 test fixture',[{provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',aliases:['gemini-y-latest'],version:'1'}]);
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y-latest',version:'1',source:'host-config+observed-provider-metadata',status:'DECLARED'},reviewerCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    const author={...invocation,invocation_id:'impl-1',role:'IMPLEMENTER' as const};
    const reviewer={...invocation,invocation_id:'review-1',role:'REVIEWER' as const,identity:reviewerIdentity};
    for(const item of [author,reviewer]){ledger.reserveInvocation('wf-1',item.invocation_id,reviewLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',item.invocation_id,'START');processStart(ledger,item.invocation_id);succeedFixture(ledger,item.invocation_id);}
    const hash='e'.repeat(64);ledger.recordArtifactAuthorship('wf-1',hash,'impl-1','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1',hash,'review-1','p2-unit-test');
    assert.equal(ledger.reviewIndependence('wf-1',hash,'review-1').allowed,true);
    const sameModel={...reviewer,invocation_id:'review-2',identity:invocation.identity};ledger.reserveInvocation('wf-1',sameModel.invocation_id,reviewLimits);appendInvocation(ledger,sameModel);ledger.transitionInvocation('wf-1',sameModel.invocation_id,'START');processStart(ledger,sameModel.invocation_id);succeedFixture(ledger,sameModel.invocation_id);assert.throws(()=>ledger.recordArtifactReview('wf-1',hash,'review-2','p2-unit-test'),/REVIEW_NOT_INDEPENDENT/);
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

test('R3 RED-06: empty contract implementation paths do not permit authorization amplification',()=>{
  const emptyContract={...p1contract,scope:{...p1contract.scope,allowed_impl_paths:[],allowed_test_paths:[]}};
  const emptyApproval=createApproval(canonicalHash(emptyContract),{execution_id:'wf-1',authorized_by:'test-human',approval_source:'P2_TEST_FIXTURE'});
  const emptyTrusted=[trustApproval(emptyApproval)];
  const grant={...authorization,approval_record_sha256:canonicalHash(emptyApproval),contract_sha256:canonicalHash(emptyContract),allowed_paths:['src/sum.cjs']};
  assert.equal(authorizeWorkflow(grant,emptyApproval,emptyContract,emptyTrusted).allowed,false);
});

test('R3 RED-08: source cursors are compared exactly beyond Number safe integer range',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r3-big-cursor-'));
  try{
    const ledger=newLedger(root);setupActiveLedger(ledger);ledger.reserveInvocation('wf-1','inv-1',limits);appendInvocation(ledger,invocation);ledger.transitionInvocation('wf-1','inv-1','START');processStart(ledger,'inv-1');
    const msg=(source_cursor:string):AgentMessageInput=>({workflow_id:'wf-1',invocation_id:'inv-1',correlation_id:'c',reply_to_message_id:null,source_event_id:null,source_cursor,message_type:'PLAN_RESULT',payload:{ok:true}});
    ledger.acceptMessage(msg('90071992547409930000'));
    assert.throws(()=>ledger.acceptMessage(msg('90071992547409929999')),/SOURCE_CURSOR_REWIND/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R3 RED-07: a finished over-duration invocation does not consume the active invocation budget forever',()=>{
  const elapsed=measureInvocationMs([{...invocation,started_at:'2026-11-09T12:00:00.000Z',finished_at:'2026-11-09T12:30:00.000Z',state:'FAILED'}],'2026-11-09T13:00:00.000Z');
  assert.equal(elapsed,0);
});

test('R3 RED-01: a review gate cannot use a review from before the latest authorship',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r3-current-artifact-'));
  try{
    const flowLimits={...limits,invocations:5};const flowAuth={...authorization,limits:flowLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};
    const ledger=newLedger(root);ledger.create(workflow);ledger.recordAuthorization(flowAuth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',version:'1',source:'host-config',status:'DECLARED'},fullModelCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    const run=(id:string,role:'IMPLEMENTER'|'REVIEWER'|'VALIDATOR',identity=verifiedIdentity)=>{const item={...invocation,invocation_id:id,role,identity};ledger.reserveInvocation('wf-1',id,flowLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',id,'START');processStart(ledger,id);succeedFixture(ledger,id);};
    run('author-a1','IMPLEMENTER');run('review-a1','REVIEWER',reviewerIdentity);run('validator-a1','VALIDATOR');
    ledger.recordArtifactAuthorship('wf-1','a'.repeat(64),'author-a1','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1','a'.repeat(64),'review-a1','p2-unit-test');ledger.recordFixtureEvidence('wf-1','VALIDATION','validator-a1','b'.repeat(64),'p2-unit-test');
    run('author-a2','IMPLEMENTER');ledger.recordArtifactAuthorship('wf-1','c'.repeat(64),'author-a2','src/sum.cjs','p2-unit-test');
    ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});
    assert.throws(()=>ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test'),/GATE_EVIDENCE_INCOMPLETE/);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R3 RED-04: returning after failed validation uses correction, without a passing ValidationGate',()=>{
  const active={...workflow,state:'ACTIVE' as const,phase:'VALIDATING' as const,authorization_id:'auth-1'};
  assert.equal(transitionWorkflow(active,'RETURN_FOR_CORRECTION',{nextPhase:'EXECUTING'}).phase,'EXECUTING');
});

test('R3 J3: failed validation returns to correction and final approval binds only the replacement artifact',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r3-j3-correction-'));
  try{
    const flowLimits={...limits,invocations:12};const flowAuth={...authorization,limits:flowLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};
    const ledger=newLedger(root);ledger.create(workflow);ledger.recordAuthorization(flowAuth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',version:'1',source:'host-config',status:'DECLARED'},fullModelCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    const run=(id:string,role:'IMPLEMENTER'|'REVIEWER'|'VALIDATOR',identity=verifiedIdentity)=>{const item={...invocation,invocation_id:id,role,identity};ledger.reserveInvocation('wf-1',id,flowLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',id,'START');processStart(ledger,id);succeedFixture(ledger,id);};
    run('plan-author','IMPLEMENTER');run('plan-review','REVIEWER',reviewerIdentity);ledger.recordArtifactAuthorship('wf-1','1'.repeat(64),'plan-author','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1','1'.repeat(64),'plan-review','p2-unit-test','2'.repeat(64));ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'EXECUTING'});
    run('impl-a1','IMPLEMENTER');run('review-a1','REVIEWER',reviewerIdentity);run('validator-a1','VALIDATOR');ledger.recordArtifactAuthorship('wf-1','3'.repeat(64),'impl-a1','src/sum.cjs','p2-unit-test','4'.repeat(64));ledger.recordArtifactReview('wf-1','3'.repeat(64),'review-a1','p2-unit-test','5'.repeat(64));ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'VALIDATING'});ledger.recordFixtureEvidence('wf-1','VALIDATION','validator-a1','6'.repeat(64),'p2-unit-test','FAIL');ledger.transitionWorkflowEvent('wf-1','RETURN_FOR_CORRECTION',{nextPhase:'EXECUTING'});
    run('impl-a2','IMPLEMENTER');run('review-a2','REVIEWER',reviewerIdentity);run('validator-a2','VALIDATOR');ledger.recordArtifactAuthorship('wf-1',mergeDiff,'impl-a2','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1',mergeDiff,'review-a2','p2-unit-test',mergeReviewHash);ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'VALIDATING'});ledger.recordFixtureEvidence('wf-1','VALIDATION','validator-a2',mergeEvidenceHash,'p2-unit-test','PASS');ledger.evaluateGate('wf-1','ValidationGate','p2-unit-test');ledger.recordFixtureEvidence('wf-1','FINAL','validator-a2','e'.repeat(64),'p2-unit-test');ledger.transitionWorkflowEvent('wf-1','REQUEST_FINAL_APPROVAL',{});assert.throws(()=>ledger.recordFinalApproval('wf-1',p1mergeApproval,'attempt-1','review-1','4'.repeat(64),'5'.repeat(64),'6'.repeat(64),'p2-unit-test'),/FINAL_EVIDENCE_NOT_REGISTERED/);ledger.recordFinalApproval('wf-1',p1mergeApproval,'attempt-1','review-1',mergeDiff,mergeReviewHash,'e'.repeat(64),'p2-unit-test');
    assert.equal(ledger.project('wf-1').state,'COMPLETED');assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='ARTIFACT_AUTHORED').length,3);assert.equal((ledger.verify('wf-1').find(e=>e.event_type==='FINAL_APPROVAL_RECORDED')?.payload as {proof:{diff_sha256:string}}).proof.diff_sha256,mergeDiff);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R3 J2: rejected planning returns to planning and requires a fresh review for the replacement',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r3-j2-plan-revision-'));
  try{
    const flowLimits={...limits,invocations:6};const flowAuth={...authorization,limits:flowLimits,allowed_agents:[...authorization.allowed_agents,'google/gemini/gemini-y/1']};const ledger=newLedger(root);ledger.create(workflow);ledger.recordAuthorization(flowAuth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});
    const reviewerIdentity=resolveIdentity({provider_id:'google',product:'gemini',canonical_model_id:'gemini-y',version:'1',source:'host-config',status:'DECLARED'},fullModelCatalog,{provider_id:'google',product:'gemini',model:'gemini-y',version:'1'});
    const run=(id:string,role:'IMPLEMENTER'|'REVIEWER',identity=verifiedIdentity)=>{const item={...invocation,invocation_id:id,role,identity};ledger.reserveInvocation('wf-1',id,flowLimits);appendInvocation(ledger,item);ledger.transitionInvocation('wf-1',id,'START');processStart(ledger,id);succeedFixture(ledger,id);};
    run('plan-a1','IMPLEMENTER');run('review-a1','REVIEWER',reviewerIdentity);ledger.recordArtifactAuthorship('wf-1','1'.repeat(64),'plan-a1','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1','1'.repeat(64),'review-a1','p2-unit-test','2'.repeat(64),'CHANGES_REQUESTED');ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.transitionWorkflowEvent('wf-1','RETURN_FOR_CORRECTION',{nextPhase:'PLANNING'});
    run('plan-a2','IMPLEMENTER');run('review-a2','REVIEWER',reviewerIdentity);ledger.recordArtifactAuthorship('wf-1','3'.repeat(64),'plan-a2','src/sum.cjs','p2-unit-test');ledger.recordArtifactReview('wf-1','3'.repeat(64),'review-a2','p2-unit-test','4'.repeat(64));ledger.transitionWorkflowEvent('wf-1','ADVANCE_PHASE',{nextPhase:'REVIEWING'});ledger.evaluateGate('wf-1','REVIEW-GATE','p2-unit-test');
    assert.equal(ledger.project('wf-1').phase,'REVIEWING');assert.equal(ledger.project('wf-1').revision_cycles,1);assert.equal(ledger.project('wf-1').correction_cycles,1);assert.equal(ledger.verify('wf-1').filter(e=>e.event_type==='GATE_DECISION'&&(e.payload as {gate:string}).gate==='REVIEW-GATE').length,1);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('R3 J7: reconciled invocation timeout permits authorized resume without resetting workflow time',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'p2-r3-j7-timeout-resume-'));
  try{
    let clock=Date.parse(now);const flowLimits={...limits,invocations:4,workflow_active_ms:7_200_000,invocation_ms:1_200_000};const flowAuth={...authorization,limits:flowLimits};const ledger=new WorkflowLedger(root,{trusted_approvals:trusted,model_catalog:fullModelCatalog,fixture_id:'p2-unit-test',clock:()=>clock});ledger.create(workflow);ledger.recordAuthorization(flowAuth,p1approval,p1contract);ledger.transitionWorkflowEvent('wf-1','AUTHORIZE',{});ledger.transitionWorkflowEvent('wf-1','START',{});ledger.reserveInvocation('wf-1','slow',flowLimits);appendInvocation(ledger,{...invocation,invocation_id:'slow'});ledger.transitionInvocation('wf-1','slow','START');processStart(ledger,'slow');clock+=1_200_001;
    assert.throws(()=>ledger.assertBudgets('wf-1'),/DURATION_LIMIT_EXCEEDED/);assert.equal(ledger.project('wf-1').state,'BLOCKED');ledger.recordFixtureInvocationObservation('wf-1','slow','PROCESS_STOPPED','a'.repeat(64),'p2-unit-test');ledger.transitionInvocation('wf-1','slow','RESULT_UNCERTAIN');ledger.transitionWorkflowEvent('wf-1','RESUME',{});ledger.reserveInvocation('wf-1','fast',flowLimits);appendInvocation(ledger,{...invocation,invocation_id:'fast'});ledger.transitionInvocation('wf-1','fast','START');
    assert.equal(ledger.project('wf-1').state,'ACTIVE');assert.equal(ledger.invocationsFrom(ledger.verify('wf-1')).find(i=>i.invocation_id==='slow')?.state,'INTERRUPTED');assert.equal(ledger.invocationsFrom(ledger.verify('wf-1')).find(i=>i.invocation_id==='fast')?.state,'STARTING');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('effect intent is never redispatched after uncertain outcome', () => {
  const intent = createEffectIntent('wf-1', 'inv-1', 'auth-1', 'WRITE', 'src/a.ts', 'a'.repeat(64), { path: 'src/a.ts' }, now);
  const dispatched = reconcileEffect(intent, 'DISPATCH', null);
  const uncertain = reconcileEffect(dispatched, 'UNKNOWN', null);
  assert.equal(uncertain.state, 'RECONCILIATION_REQUIRED');
  assert.throws(() => reconcileEffect(uncertain, 'DISPATCH', null), /EFFECT_REDISPATCH_FORBIDDEN/);
});
