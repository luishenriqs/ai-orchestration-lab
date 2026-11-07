import fs from 'node:fs';
import type { TaskContract, ApprovalRecord, ExecutionAttempt, EvidenceManifest, ReviewHandoffPackage, ReviewReport, ExecutionResult } from '../contracts/types.js';
import { REVIEW_CATEGORIES } from '../contracts/types.js';
import { validateTaskContract, validateExecutionAttempt, validateExecutionResult, validateReviewReport } from '../contracts/validator.js';
import { canonicalHash } from '../contracts/integrity.js';
import { type Fixture, verifyFixture } from '../execution/fixtures.js';
import { probeIsolation } from '../execution/synthetic.js';
import type { ProcessObservation } from '../execution/process.js';
import { git, safePath, readJson, writeNew } from '../execution/host.js';
import { assertAttemptConsistent } from '../execution/attempts.js';
import { verifyEvidence } from '../evidence/collector.js';
import { verifyHandoff } from '../evidence/handoff.js';
import { verifyApproval, type TrustedApproval } from './approval.js';
export interface GateDecision {readonly gate:'TASK-READY'|'ValidationGate'|'PR-GATE';readonly allowed:boolean;readonly reasons:readonly string[];readonly decided_at:string;readonly execution_id:string;readonly attempt_id:string;readonly contract_sha256:string}
export interface ReadinessPolicy {readonly trusted:readonly TrustedApproval[];readonly environment_authorized:boolean;readonly data_classification:string;readonly required_dependencies:readonly string[];readonly completed_dependencies:readonly string[];readonly conflict:boolean}
function decision(gate:GateDecision['gate'],contract:TaskContract|null,attempt:ExecutionAttempt,reasons:readonly string[]):GateDecision {
  return Object.freeze({gate,allowed:reasons.length===0,reasons:Object.freeze([...new Set(reasons)]),decided_at:new Date().toISOString(),execution_id:attempt.execution_id,attempt_id:attempt.attempt_id,contract_sha256:contract?canonicalHash(contract):''});
}
export async function taskReady(fixture:Fixture,input:unknown,approval:unknown,attempt:ExecutionAttempt,policy:ReadinessPolicy,proofDir?:string):Promise<GateDecision>{
  const parsed=validateTaskContract(input);if(!parsed.valid)return decision('TASK-READY',null,attempt,['INVALID_CONTRACT']);const c=parsed.value;const reasons=[...verifyApproval(c,approval,{scope:'EXECUTION',trusted:policy.trusted}).reasons];
  if(!policy.environment_authorized) reasons.push('ENVIRONMENT_NOT_AUTHORIZED');
  if(policy.data_classification!=='SYNTHETIC_LAB') reasons.push('DATA_POLICY');
  if(policy.conflict) reasons.push('OPERATIONAL_CONFLICT');
  if(policy.required_dependencies.some(d=>!policy.completed_dependencies.includes(d))) reasons.push('DEPENDENCIES_UNSATISFIED');
  if(c.execution.selected_executor!=='synthetic'||c.execution.retry_limit!==0||c.execution.mode!=='CONTROLLED') reasons.push('P1_EXECUTION_POLICY');
  if(c.scope.allowed_impl_paths.length===0||c.scope.allowed_impl_paths.some(p=>p!=='src/sum.cjs')||c.scope.allowed_test_paths.some(p=>p!=='tests/sum.cjs')) reasons.push('UNSUPPORTED_SYNTHETIC_SCOPE');
  if(c.validation.validation_commands.length!==1||c.validation.validation_commands[0]!=='node tests/sum.cjs'||!c.validation.acceptance_checks.length) reasons.push('VALIDATION_PLAN_MISSING');
  if(!validateExecutionAttempt(attempt).valid||attempt.state!=='CREATED'||attempt.approved_contract_sha256!==canonicalHash(c)||attempt.execution_id!==c.identity.execution_id||attempt.workspace_root!==c.identity.workspace_root||attempt.base_commit!==c.identity.base_commit||(approval as ApprovalRecord|null)?.approval_id!==attempt.approval_id) reasons.push('ATTEMPT_BINDING');
  try {
    assertAttemptConsistent(attempt);verifyFixture(fixture);
    if(c.identity.repository!=='synthetic-fixture'||c.identity.workspace_root!==fixture.workspace||c.identity.base_commit!==fixture.base_commit) reasons.push('WORKSPACE_BINDING');
    if(git(fixture.workspace,['status','--porcelain','--untracked-files=all']).length) reasons.push('DIRTY_BASELINE');
    for(const p of [...c.scope.allowed_impl_paths,...c.scope.allowed_test_paths]) safePath(fixture.workspace,p);
    // Do not execute even the fixed probe when authorization/policy is invalid.
    if(reasons.length===0){const proof=await probeIsolation(fixture);if(proofDir)writeNew(safePath(proofDir,'isolation-proof.json',false),proof);if(!proof.preventive)reasons.push('ISOLATION_UNPROVEN');}
  }catch(error){reasons.push('ENVIRONMENT_CHECK_FAILED:'+(error instanceof Error?error.message:'unknown'));}
  return decision('TASK-READY',c,attempt,reasons);
}
export function validationGate(fixture:Fixture,contract:TaskContract,attempt:ExecutionAttempt,manifest:EvidenceManifest,result:ExecutionResult,dir:string,handoff?:ReviewHandoffPackage):GateDecision {
  const reasons:string[]=[];
  if(!validateTaskContract(contract).valid) return decision('ValidationGate',null,attempt,['INVALID_CONTRACT']);
  if(!validateExecutionResult(result).valid||result.execution_id!==attempt.execution_id||result.attempt_id!==attempt.attempt_id||result.executor!==attempt.executor) reasons.push('RESULT_BINDING');
  try{assertAttemptConsistent(attempt);}catch{reasons.push('INVALID_ATTEMPT');}
  if(attempt.state!=='COMPLETED'||attempt.termination_reason!=='NORMAL') reasons.push('EXECUTION_NOT_COMPLETED');
  reasons.push(...verifyEvidence(fixture,contract,attempt,manifest,dir));
  try {
    const observation=readJson(safePath(dir,'executor-observation.json')) as ProcessObservation;
    if(observation.exit_code!==0||observation.termination_reason!=='NORMAL'||observation.truncated) reasons.push('EXECUTOR_FAILED');
    if(!manifest.evidence_integrity.artifact_hashes.some(a=>a.path==='executor-observation.json')) reasons.push('UNSEALED_EXECUTOR_OBSERVATION');
  }catch{reasons.push('MISSING_EXECUTOR_OBSERVATION');}
  if(handoff) reasons.push(...verifyHandoff(fixture,contract,attempt,manifest,handoff,dir));
  return decision('ValidationGate',contract,attempt,reasons);
}
export interface PrPolicy {readonly trusted_approvals:readonly TrustedApproval[];readonly trusted_review_sha256:readonly string[];readonly rollback_evaluated:boolean;readonly risks_treated:boolean}
export function prGate(fixture:Fixture,contract:TaskContract,attempt:ExecutionAttempt,manifest:EvidenceManifest,result:ExecutionResult,handoff:ReviewHandoffPackage,review:ReviewReport,approval:ApprovalRecord,dir:string,policy:PrPolicy):GateDecision {
  const reasons=[...validationGate(fixture,contract,attempt,manifest,result,dir,handoff).reasons];
  if(!validateReviewReport(review).valid) reasons.push('INVALID_REVIEW');
  else {
    if(!policy.trusted_review_sha256.includes(canonicalHash(review))) reasons.push('UNTRUSTED_REVIEW');
    if(review.execution_id!==attempt.execution_id||review.attempt_id!==attempt.attempt_id||review.reviewed_contract_sha256!==canonicalHash(contract)||review.reviewed_diff_sha256!==manifest.git.diff_sha256) reasons.push('STALE_REVIEW');
    if(review.verdict==='REJECTED'||review.findings.some(f=>f.blocking)) reasons.push('REVIEW_REJECTED');
    if(review.categories_evaluated.length!==REVIEW_CATEGORIES.length||new Set(review.categories_evaluated.map(c=>c.category)).size!==REVIEW_CATEGORIES.length) reasons.push('INCOMPLETE_REVIEW');
    const green=manifest.test_evidence.green;if(!green||Date.parse(review.review_timestamp)<Date.parse(green.started_at)+green.duration_ms) reasons.push('REVIEW_PRECEDES_VALIDATION');
    reasons.push(...verifyApproval(contract,approval,{scope:'MERGE',trusted:policy.trusted_approvals,attempt_id:attempt.attempt_id,diff_sha256:manifest.git.diff_sha256,review_id:review.review_id}).reasons);
  }
  if(!policy.rollback_evaluated) reasons.push('ROLLBACK_NOT_EVALUATED');if(!policy.risks_treated)reasons.push('RISKS_UNRESOLVED');
  // This decision never performs merge, push, export, or human approval.
  return decision('PR-GATE',contract,attempt,reasons);
}
export function persistDecision(dir:string,name:string,value:GateDecision):void {
  if(!/^[a-z0-9-]+$/.test(name))throw Error('INVALID_DECISION_NAME');fs.writeFileSync(safePath(dir,`${name}.json`,false),JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});
}
