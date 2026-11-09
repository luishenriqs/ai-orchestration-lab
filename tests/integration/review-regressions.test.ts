import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFixture } from '../../src/execution/fixtures.js';
import { executeAttempt } from '../../src/execution/adapter.js';
import { syntheticContract, syntheticApproval, syntheticReview } from '../../src/scenarios/p1.js';
import { trustApproval } from '../../src/governance/approval.js';
import { canonicalHash } from '../../src/contracts/integrity.js';
import { parseAndValidateContract } from '../../src/contracts/validator.js';
import { validationGate, prGate } from '../../src/governance/gates.js';
import { observeTest } from '../../src/evidence/collector.js';
import { resolveWorkspaceRoot } from '../../src/contracts/schema-loader.js';

it('R1-001 rejects synthetic source that exits before protected assertions or spoofs their output', async () => {
    const f = createFixture('review-spoof-' + randomUUID(), 'A');
    const dir = path.join(resolveWorkspaceRoot(), 'runs', f.execution_id);
    fs.mkdirSync(dir);
    for (const [i, source] of ["console.log('SYN_TEST_PASS');process.exit(0);module.exports=()=>999;", "require('node:assert/strict').equal=()=>{};module.exports=()=>999;"].entries()) {
        fs.writeFileSync(path.join(f.workspace, 'src/sum.cjs'), source);
        const record = await observeTest(f, dir, i === 0 ? 'green' : 'baseline');
        assert.equal(record.observed_outcome, 'ERROR');
    }
});

it('R1-002 and R1-003 bind gates to persisted authorization and process and block severe review findings', async () => {
    const f = createFixture('review-binding-' + randomUUID(), 'A');
    const c = syntheticContract(f.workspace, f.base_commit, f.execution_id), ap = syntheticApproval(c);
    const o = await executeAttempt(f, c, ap, { trusted: [trustApproval(ap)], environment_authorized: true, data_classification: 'SYNTHETIC_LAB', required_dependencies: [], completed_dependencies: [], conflict: false }, 'SYN-001');
    assert.equal(o.validation?.allowed, true);
    const sourcePath = path.join(f.workspace, 'src/sum.cjs'), source = fs.readFileSync(sourcePath);
    fs.writeFileSync(sourcePath, "console.log('SYN_TEST_PASS');process.exit(0)");
    assert.equal(validationGate(f, c, o.attempt, o.manifest!, o.result!, o.evidence_dir, o.handoff!).allowed, false);
    fs.writeFileSync(sourcePath, source);
    for (const patch of [{ execution_id: 'UNRELATED' }, { approval_id: 'NONEXISTENT' }, { executor: 'codex' as const }, { process_identity: { pid: 1, process_start_token: 'FAKE' } }]) {
        const a = { ...o.attempt, ...patch };
        const r = { ...o.result!, execution_id: a.execution_id, executor: a.executor };
        assert.equal(validationGate(f, c, a, o.manifest!, r, o.evidence_dir, o.handoff!).allowed, false, JSON.stringify(patch));
    }
    const journal = path.join(o.evidence_dir, 'events', '000002.json');
    const saved = fs.readFileSync(journal);
    fs.writeFileSync(journal, '{}');
    assert.equal(validationGate(f, c, o.attempt, o.manifest!, o.result!, o.evidence_dir, o.handoff!).allowed, false);
    fs.writeFileSync(journal, saved);
    const readyPath = path.join(o.evidence_dir, 'task-ready.json'), ready = fs.readFileSync(readyPath);
    fs.unlinkSync(readyPath);
    assert.equal(validationGate(f, c, o.attempt, o.manifest!, o.result!, o.evidence_dir, o.handoff!).allowed, false);
    fs.writeFileSync(readyPath, ready);
    for (const severity of ['HIGH', 'CRITICAL'] as const) {
        const base = syntheticReview(c, o);
        const review = { ...base, verdict: 'APPROVED_WITH_RECOMMENDATIONS' as const, findings: [{ finding_id: 'OPEN', severity, category: base.categories_evaluated[0]!.category, evidence: 'reproduced defect', source_reference: 'fixture', recommendation: 'fix', blocking: false }] };
        const merge = syntheticApproval(c, { approval_scope: 'MERGE', attempt_id: 'A', approved_diff_sha256: o.manifest!.git.diff_sha256, review_id: review.review_id });
        assert.equal(prGate(f, c, o.attempt, o.manifest!, o.result!, o.handoff!, review, merge, o.evidence_dir, { trusted_approvals: [trustApproval(merge)], trusted_review_sha256: [canonicalHash(review)], rollback_evaluated: true, risks_treated: true }).allowed, false);
    }
});

it('R1-004 rejects duplicate contract keys before schema validation and hashing', () => {
    const c = syntheticContract('/synthetic', 'a'.repeat(40), 'DUPLICATE');
    const raw = JSON.stringify(c).replace('"contract_revision":1', '"contract_revision":666,"contract_revision":1');
    assert.equal(parseAndValidateContract('TaskContract', raw).valid, false);
    const nested = JSON.stringify(c).replace('"execution_id":"DUPLICATE"', '"execution_id":"OTHER","execution_id":"DUPLICATE"');
    assert.equal(parseAndValidateContract('TaskContract', nested).valid, false);
    assert.equal(parseAndValidateContract('TaskContract', raw.replace('"contract_revision":666', '"contract_\\u0072evision":666')).valid, false);
    assert.equal(parseAndValidateContract('TaskContract', JSON.stringify(c)).valid, true);
});
