import fs from 'node:fs';
import path from 'node:path';
import { resolveWorkspaceRoot } from '../contracts/schema-loader.js';
import type { TaskContract, ApprovalRecord, ExecutionAttempt, EvidenceManifest, ReviewHandoffPackage, ReviewReport, ExecutionResult } from '../contracts/types.js';
import { REVIEW_CATEGORIES } from '../contracts/types.js';
import { validateTaskContract, validateExecutionAttempt, validateExecutionResult, validateReviewReport } from '../contracts/validator.js';
import { canonicalHash } from '../contracts/integrity.js';
import { type Fixture, verifyFixture } from '../execution/fixtures.js';
import { probeIsolation } from '../execution/synthetic.js';
import type { ProcessObservation } from '../execution/process.js';
import { git, safePath, readJson, writeNew } from '../execution/host.js';
import { assertAttemptConsistent, AttemptStore } from '../execution/attempts.js';
import { snapshotTree, verifyEvidence } from '../evidence/collector.js';
import { verifyHandoff } from '../evidence/handoff.js';
import { verifyApproval, type TrustedApproval } from './approval.js';
export interface GateDecision {
    readonly gate: 'TASK-READY' | 'ValidationGate' | 'PR-GATE';
    readonly allowed: boolean;
    readonly reasons: readonly string[];
    readonly decided_at: string;
    readonly execution_id: string;
    readonly attempt_id: string;
    readonly contract_sha256: string;
}
export interface ReadinessPolicy {
    readonly trusted: readonly TrustedApproval[];
    readonly environment_authorized: boolean;
    readonly data_classification: string;
    readonly required_dependencies: readonly string[];
    readonly completed_dependencies: readonly string[];
    readonly conflict: boolean;
}
function decision(gate: GateDecision['gate'], contract: TaskContract | null, attempt: ExecutionAttempt, reasons: readonly string[]): GateDecision {
    return Object.freeze({ gate, allowed: reasons.length === 0, reasons: Object.freeze([...new Set(reasons)]), decided_at: new Date().toISOString(), execution_id: attempt.execution_id, attempt_id: attempt.attempt_id, contract_sha256: contract ? canonicalHash(contract) : '' });
}
export async function taskReady(fixture: Fixture, input: unknown, approval: unknown, attempt: ExecutionAttempt, policy: ReadinessPolicy, proofDir?: string): Promise<GateDecision> {
    const parsed = validateTaskContract(input);
    if (!parsed.valid)
        return decision('TASK-READY', null, attempt, ['INVALID_CONTRACT']);
    const c = parsed.value;
    const reasons = [...verifyApproval(c, approval, { scope: 'EXECUTION', trusted: policy.trusted }).reasons];
    if (!policy.environment_authorized)
        reasons.push('ENVIRONMENT_NOT_AUTHORIZED');
    if (policy.data_classification !== 'SYNTHETIC_LAB')
        reasons.push('DATA_POLICY');
    if (policy.conflict)
        reasons.push('OPERATIONAL_CONFLICT');
    if (policy.required_dependencies.some(d => !policy.completed_dependencies.includes(d)))
        reasons.push('DEPENDENCIES_UNSATISFIED');
    if (c.execution.selected_executor !== 'synthetic' || c.execution.retry_limit !== 0 || c.execution.mode !== 'CONTROLLED')
        reasons.push('P1_EXECUTION_POLICY');
    if (c.scope.allowed_impl_paths.length === 0 || c.scope.allowed_impl_paths.some(p => p !== 'src/sum.cjs') || c.scope.allowed_test_paths.some(p => p !== 'tests/sum.cjs'))
        reasons.push('UNSUPPORTED_SYNTHETIC_SCOPE');
    if (c.validation.validation_commands.length !== 1 || c.validation.validation_commands[0] !== 'node tests/sum.cjs' || !c.validation.acceptance_checks.length)
        reasons.push('VALIDATION_PLAN_MISSING');
    if (!validateExecutionAttempt(attempt).valid || attempt.state !== 'CREATED' || attempt.executor !== c.execution.selected_executor || attempt.approved_contract_sha256 !== canonicalHash(c) || attempt.execution_id !== c.identity.execution_id || attempt.workspace_root !== c.identity.workspace_root || attempt.base_commit !== c.identity.base_commit || (approval as ApprovalRecord | null)?.approval_id !== attempt.approval_id)
        reasons.push('ATTEMPT_BINDING');
    try {
        assertAttemptConsistent(attempt);
        verifyFixture(fixture);
        if (c.identity.execution_id !== fixture.execution_id || attempt.attempt_id !== fixture.attempt_id || c.identity.repository !== 'synthetic-fixture' || c.identity.workspace_root !== fixture.workspace || c.identity.base_commit !== fixture.base_commit)
            reasons.push('WORKSPACE_BINDING');
        if (git(fixture.workspace, ['status', '--porcelain', '--untracked-files=all']).length)
            reasons.push('DIRTY_BASELINE');
        for (const p of [...c.scope.allowed_impl_paths, ...c.scope.allowed_test_paths])
            safePath(fixture.workspace, p);
        // Do not execute even the fixed probe when authorization/policy is invalid.
        if (reasons.length === 0) {
            const proof = await probeIsolation(fixture);
            if (proofDir)
                writeNew(safePath(proofDir, 'isolation-proof.json', false), proof);
            if (!proof.preventive)
                reasons.push('ISOLATION_UNPROVEN');
        }
    }
    catch (error) {
        reasons.push('ENVIRONMENT_CHECK_FAILED:' + (error instanceof Error ? error.message : 'unknown'));
    }
    return decision('TASK-READY', c, attempt, reasons);
}
export function validationGate(fixture: Fixture, contract: TaskContract, attempt: ExecutionAttempt, manifest: EvidenceManifest, result: ExecutionResult, dir: string, handoff?: ReviewHandoffPackage): GateDecision {
    const reasons: string[] = [];
    if (!validateTaskContract(contract).valid)
        return decision('ValidationGate', null, attempt, ['INVALID_CONTRACT']);
    if (!validateExecutionResult(result).valid || result.execution_id !== attempt.execution_id || result.attempt_id !== attempt.attempt_id || result.executor !== attempt.executor)
        reasons.push('RESULT_BINDING');
    try {
        assertAttemptConsistent(attempt);
        const runs = path.join(resolveWorkspaceRoot(), 'runs');
        const persistedDir = safePath(runs, `${fixture.execution_id}/attempts/${fixture.attempt_id}`);
        // Archived evidence may be read elsewhere, but live gate authorization
        // always comes from the host journal and its enrolled execution policy.
        const persisted = new AttemptStore(runs).load(fixture.execution_id, fixture.attempt_id);
        if (canonicalHash(persisted) !== canonicalHash(attempt) || attempt.execution_id !== contract.identity.execution_id || attempt.executor !== contract.execution.selected_executor)
            reasons.push('PERSISTED_ATTEMPT_MISMATCH');
        const savedContract = readJson(safePath(persistedDir, 'contract.json'));
        const savedApproval = readJson(safePath(persistedDir, 'approval.json')) as ApprovalRecord;
        const savedPolicy = readJson(safePath(persistedDir, 'host-policy.json')) as ReadinessPolicy;
        const ready = readJson(safePath(persistedDir, 'task-ready.json')) as GateDecision;
        if (canonicalHash(savedContract) !== canonicalHash(contract) || savedApproval.approval_id !== attempt.approval_id || !verifyApproval(contract, savedApproval, { scope: 'EXECUTION', trusted: savedPolicy.trusted }).allowed || !ready.allowed || ready.gate !== 'TASK-READY' || ready.execution_id !== attempt.execution_id || ready.attempt_id !== attempt.attempt_id || ready.contract_sha256 !== canonicalHash(contract))
            reasons.push('PERSISTED_AUTHORIZATION_MISMATCH');
    }
    catch {
        reasons.push('INVALID_ATTEMPT');
    }
    if (attempt.state !== 'COMPLETED' || attempt.termination_reason !== 'NORMAL')
        reasons.push('EXECUTION_NOT_COMPLETED');
    reasons.push(...verifyEvidence(fixture, contract, attempt, manifest, dir));
    try {
        const observation = readJson(safePath(dir, 'executor-observation.json')) as ProcessObservation;
        if (canonicalHash(observation.process_identity) !== canonicalHash(attempt.process_identity) || !attempt.started_at || !attempt.finished_at || Date.parse(attempt.started_at) < Date.parse(observation.started_at) || Date.parse(attempt.finished_at) < Date.parse(observation.started_at) + observation.duration_ms)
            reasons.push('PROCESS_OBSERVATION_BINDING');
        if (observation.exit_code !== 0 || observation.termination_reason !== 'NORMAL' || observation.truncated)
            reasons.push('EXECUTOR_FAILED');
        if (!manifest.evidence_integrity.artifact_hashes.some(a => a.path === 'executor-observation.json'))
            reasons.push('UNSEALED_EXECUTOR_OBSERVATION');
    }
    catch {
        reasons.push('MISSING_EXECUTOR_OBSERVATION');
    }
    try {
        const proof = readJson(safePath(dir, 'isolation-proof.json')) as {
            preventive: boolean;
            before: string;
            after: string;
            observation: ProcessObservation;
        };
        if (!proof.preventive || proof.before !== proof.after || proof.observation.exit_code !== 0 || !proof.observation.stdout.includes('PREVENTION_PROVED'))
            reasons.push('ISOLATION_UNPROVEN');
        const integrity = readJson(safePath(dir, 'governance-integrity.json')) as {
            intact: boolean;
            before: unknown;
            after: unknown;
        };
        const current = ['contracts', 'approvals', 'schemas', 'reviews', 'src', 'dist/src'].map(p => ({ path: p, digest: snapshotTree(path.join(resolveWorkspaceRoot(), p)) }));
        if (!integrity.intact || canonicalHash(integrity.before) !== canonicalHash(integrity.after) || canonicalHash(integrity.after) !== canonicalHash(current))
            reasons.push('GOVERNANCE_INTEGRITY');
        for (const name of ['isolation-proof.json', 'governance-integrity.json'])
            if (!manifest.evidence_integrity.artifact_hashes.some(a => a.path === name))
                reasons.push('UNSEALED_SECURITY_EVIDENCE');
    }
    catch {
        reasons.push('MISSING_SECURITY_EVIDENCE');
    }
    if (handoff)
        reasons.push(...verifyHandoff(fixture, contract, attempt, manifest, handoff, dir));
    return decision('ValidationGate', contract, attempt, reasons);
}
export interface PrPolicy {
    readonly trusted_approvals: readonly TrustedApproval[];
    readonly trusted_review_sha256: readonly string[];
    readonly rollback_evaluated: boolean;
    readonly risks_treated: boolean;
}
export function prGate(fixture: Fixture, contract: TaskContract, attempt: ExecutionAttempt, manifest: EvidenceManifest, result: ExecutionResult, handoff: ReviewHandoffPackage, review: ReviewReport, approval: ApprovalRecord, dir: string, policy: PrPolicy): GateDecision {
    const reasons = [...validationGate(fixture, contract, attempt, manifest, result, dir, handoff).reasons];
    if (!validateReviewReport(review).valid)
        reasons.push('INVALID_REVIEW');
    else {
        if (!policy.trusted_review_sha256.includes(canonicalHash(review)))
            reasons.push('UNTRUSTED_REVIEW');
        if (review.execution_id !== attempt.execution_id || review.attempt_id !== attempt.attempt_id || review.reviewed_contract_sha256 !== canonicalHash(contract) || review.reviewed_diff_sha256 !== manifest.git.diff_sha256)
            reasons.push('STALE_REVIEW');
        if (review.verdict === 'REJECTED' || review.findings.some(f => f.blocking || f.severity === 'HIGH' || f.severity === 'CRITICAL'))
            reasons.push('REVIEW_REJECTED');
        if (review.categories_evaluated.length !== REVIEW_CATEGORIES.length || new Set(review.categories_evaluated.map(c => c.category)).size !== REVIEW_CATEGORIES.length)
            reasons.push('INCOMPLETE_REVIEW');
        const green = manifest.test_evidence.green;
        if (!green || Date.parse(review.review_timestamp) < Date.parse(green.started_at) + green.duration_ms)
            reasons.push('REVIEW_PRECEDES_VALIDATION');
        reasons.push(...verifyApproval(contract, approval, { scope: 'MERGE', trusted: policy.trusted_approvals, attempt_id: attempt.attempt_id, diff_sha256: manifest.git.diff_sha256, review_id: review.review_id }).reasons);
    }
    if (!policy.rollback_evaluated)
        reasons.push('ROLLBACK_NOT_EVALUATED');
    if (!policy.risks_treated)
        reasons.push('RISKS_UNRESOLVED');
    // This decision never performs merge, push, export, or human approval.
    return decision('PR-GATE', contract, attempt, reasons);
}
export function persistDecision(dir: string, name: string, value: GateDecision): void {
    if (!/^[a-z0-9-]+$/.test(name))
        throw Error('INVALID_DECISION_NAME');
    fs.writeFileSync(safePath(dir, `${name}.json`, false), JSON.stringify(value, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
}
