import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../../src/execution/fixtures.js';
import { task, approval } from '../helpers/contracts.js';
import { canonicalHash } from '../../src/contracts/integrity.js';
import { trustApproval } from '../../src/governance/approval.js';
import { taskReady, validationGate, prGate, type ReadinessPolicy } from '../../src/governance/gates.js';
import { observeTest, collectEvidence, snapshotTree } from '../../src/evidence/collector.js';
import { createHandoff } from '../../src/evidence/handoff.js';
import { executeSynthetic, probeIsolation } from '../../src/execution/synthetic.js';
import { resolveWorkspaceRoot } from '../../src/contracts/schema-loader.js';
import { REVIEW_CATEGORIES, type ExecutionAttempt, type ReviewReport, type ExecutionResult } from '../../src/contracts/types.js';
function setup() { const f = createFixture('gate-' + randomUUID(), 'A'); const base = task(f.workspace, f.base_commit); const c = { ...base, identity: { ...base.identity, execution_id: f.execution_id } }; const ap = approval(canonicalHash(c), { execution_id: f.execution_id }); const a: ExecutionAttempt = { schema_version: '0.3-p0', execution_id: c.identity.execution_id, attempt_id: 'A', approval_id: ap.approval_id, approved_contract_sha256: canonicalHash(c), executor: 'synthetic', state: 'CREATED', started_at: null, finished_at: null, termination_reason: null, base_commit: f.base_commit, workspace_root: f.workspace, process_identity: null }; const policy: ReadinessPolicy = { trusted: [trustApproval(ap)], environment_authorized: true, data_classification: 'SYNTHETIC_LAB', required_dependencies: ['P1-002'], completed_dependencies: ['P1-002'], conflict: false }; return { f, c, ap, a, policy }; }
it('P1-007 TASK-READY rejects every false prerequisite, invalid policies and missing approval', async () => {
    const { f, c, ap, a, policy } = setup();
    assert.equal((await taskReady(f, c, ap, a, policy)).allowed, true);
    for (const patch of [{ environment_authorized: false }, { data_classification: 'CLIENT_CONFIDENTIAL' }, { completed_dependencies: [] }, { conflict: true }, { trusted: [] }])
        assert.equal((await taskReady(f, c, ap, a, { ...policy, ...patch })).allowed, false);
    assert.equal((await taskReady(f, c, null, a, policy)).allowed, false);
    for (const bad of [{ ...c, contract_revision: 2 }, { ...c, execution: { ...c.execution, retry_limit: 1 } }, { ...c, execution: { ...c.execution, selected_executor: 'codex' } }, { ...c, identity: { ...c.identity, workspace_root: '/other' } }])
        assert.equal((await taskReady(f, bad, ap, a, policy)).allowed, false);
});
it('P1-007 gates require observed evidence and current trusted review plus exact MERGE authorization', async () => {
    const { f, c, a } = setup();
    const dir = path.join(resolveWorkspaceRoot(), 'runs', f.execution_id);
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'isolation-proof.json'), JSON.stringify(await probeIsolation(f)));
    const security = ['contracts', 'approvals', 'schemas', 'reviews', 'src', 'dist/src'].map(p => ({ path: p, digest: snapshotTree(path.join(resolveWorkspaceRoot(), p)) }));
    fs.writeFileSync(path.join(dir, 'governance-integrity.json'), JSON.stringify({ before: security, after: security, intact: true }));
    const red = await observeTest(f, dir, 'red');
    const o = await executeSynthetic(f, 'SYN-001');
    const green = await observeTest(f, dir, 'green');
    fs.writeFileSync(path.join(dir, 'executor-observation.json'), JSON.stringify(o));
    const completed: ExecutionAttempt = { ...a, state: 'COMPLETED', started_at: o.started_at, finished_at: new Date().toISOString(), process_identity: o.process_identity, termination_reason: 'NORMAL' };
    const result: ExecutionResult = { schema_version: '0.3-p0', execution_id: c.identity.execution_id, attempt_id: a.attempt_id, executor: 'synthetic', agent_declared_outcome: 'completed', agent_summary: 'SYNTHETIC CLAIM', agent_reported_blockers: [] };
    const m = collectEvidence(f, c, completed, dir, red, green);
    const h = createHandoff(c, completed, m, dir);
    const v = validationGate(f, c, completed, m, result, dir, h);
    assert.deepEqual(v.reasons, []);
    assert.equal(v.allowed, true);
    const review: ReviewReport = { schema_version: '0.3-p0', review_id: 'SYN-REVIEW', execution_id: c.identity.execution_id, attempt_id: a.attempt_id, reviewed_contract_sha256: canonicalHash(c), reviewed_diff_sha256: m.git.diff_sha256, reviewer_model: 'SYNTHETIC_REVIEW_FIXTURE_NOT_REAL_REVIEW', review_timestamp: new Date().toISOString(), categories_evaluated: REVIEW_CATEGORIES.map(category => ({ category, applicable: true })), findings: [], verdict: 'APPROVED', limitations: ['Synthetic fixture, no independent agent review performed'] };
    const ap = approval(canonicalHash(c), { execution_id: f.execution_id, approval_scope: 'MERGE', attempt_id: a.attempt_id, approved_diff_sha256: m.git.diff_sha256, review_id: review.review_id });
    const policy = { trusted_approvals: [trustApproval(ap)], trusted_review_sha256: [canonicalHash(review)], rollback_evaluated: true, risks_treated: true };
    assert.equal(prGate(f, c, completed, m, result, h, review, ap, dir, policy).allowed, true);
    for (const patch of [{ trusted_review_sha256: [] }, { rollback_evaluated: false }, { risks_treated: false }, { trusted_approvals: [] }])
        assert.equal(prGate(f, c, completed, m, result, h, review, ap, dir, { ...policy, ...patch }).allowed, false);
    assert.equal(prGate(f, c, completed, m, result, h, { ...review, reviewed_diff_sha256: 'f'.repeat(64) }, ap, dir, policy).allowed, false);
    assert.equal(prGate(f, c, completed, m, result, h, review, { ...ap, attempt_id: 'OTHER' }, dir, policy).allowed, false);
    assert.equal(validationGate(f, c, { ...completed, state: 'FAILED', termination_reason: 'PROCESS_FAILURE' }, m, result, dir, h).allowed, false);
    assert.equal(validationGate(f, c, completed, { ...m, test_evidence: { ...m.test_evidence, green: null } }, result, dir, h).allowed, false);
});
