import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AttemptStore, processIdentity } from '../../src/execution/attempts.js';
import { createFixture } from '../../src/execution/fixtures.js';
import { taskReady } from '../../src/governance/gates.js';
import { trustApproval } from '../../src/governance/approval.js';
import { syntheticContract, syntheticApproval } from '../../src/scenarios/p1.js';
import { canonicalHash } from '../../src/contracts/integrity.js';
import { resolveWorkspaceRoot } from '../../src/contracts/schema-loader.js';
import type { ExecutionAttempt } from '../../src/contracts/types.js';
function setup() { const f = createFixture('guard-' + randomUUID(), 'A'); const c = syntheticContract(f.workspace, f.base_commit, f.execution_id); const ap = syntheticApproval(c); const root = path.join(resolveWorkspaceRoot(), 'runs'); const a: ExecutionAttempt = { schema_version: '0.3-p0', execution_id: f.execution_id, attempt_id: 'A', approval_id: ap.approval_id, approved_contract_sha256: canonicalHash(c), executor: 'synthetic', state: 'CREATED', started_at: null, finished_at: null, base_commit: f.base_commit, workspace_root: f.workspace, process_identity: null, termination_reason: null }; return { f, c, ap, a, root }; }
it('P1-008 recovery audit: stale transition lock is archived with owner proof before reconciliation', () => {
    const { a, root } = setup();
    const store = new AttemptStore(root);
    store.create(a);
    const own = processIdentity(process.pid)!;
    store.transition(a.execution_id, 'A', 'RUNNING', null, { ...own, process_start_token: 'orphan-start' });
    const dir = path.join(root, a.execution_id, 'attempts/A');
    fs.writeFileSync(path.join(dir, '.transition-lock'), JSON.stringify({ ...own, process_start_token: 'dead-owner-token' }));
    assert.equal(store.reconcile(a.execution_id, 'A').state, 'INTERRUPTED');
    assert.ok(fs.readdirSync(dir).some(n => n.startsWith('.transition-lock.abandoned-')));
});
it('P1-008 identity audit: fixture/execution and executor bindings must agree before readiness', async () => {
    const { f, c, ap, a } = setup();
    const policy = { trusted: [trustApproval(ap)], environment_authorized: true, data_classification: 'SYNTHETIC_LAB', required_dependencies: [], completed_dependencies: [], conflict: false };
    assert.equal((await taskReady(f, c, ap, { ...a, executor: 'codex' }, policy)).allowed, false);
    const other = { ...c, identity: { ...c.identity, execution_id: 'DIFFERENT' } };
    const forged = syntheticApproval(other);
    assert.equal((await taskReady(f, other, forged, { ...a, execution_id: 'DIFFERENT', approval_id: forged.approval_id, approved_contract_sha256: canonicalHash(other) }, { ...policy, trusted: [trustApproval(forged)] })).allowed, false);
});
