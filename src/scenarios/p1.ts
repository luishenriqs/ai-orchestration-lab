import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { REQUIRED_LAB_DIRECTORIES } from '../index.js';
import { REVIEW_CATEGORIES, type TaskContract, type ApprovalRecord, type ExecutionAttempt, type ReviewReport } from '../contracts/types.js';
import { canonicalHash, sha256 } from '../contracts/integrity.js';
import { resolveWorkspaceRoot } from '../contracts/schema-loader.js';
import { trustApproval } from '../governance/approval.js';
import { prGate, taskReady, validationGate, persistDecision, type ReadinessPolicy } from '../governance/gates.js';
import { createFixture, rollbackFixture } from '../execution/fixtures.js';
import { executeAttempt, type AttemptOutcome } from '../execution/adapter.js';
import { AttemptStore } from '../execution/attempts.js';
import { runProcess } from '../execution/process.js';
import { sandboxArguments, type SyntheticScenario } from '../execution/synthetic.js';
import { safePath, writeNew } from '../execution/host.js';
import { observeWorkspace, verifyEvidence, collectEvidence, observeTest } from '../evidence/collector.js';
import { verifyHandoff } from '../evidence/handoff.js';
export const REQUIRED_SCENARIOS = [
    'Contrato alterado após aprovação.', 'Aprovação inexistente.', 'Resultado falso do executor.', 'Arquivo alterado fora do escopo.', 'Falha parcial.', 'Tentativa interrompida.', 'Revisão obsoleta.', 'Aprovação MERGE vinculada a outra tentativa.', 'Tentativa de alterar registros protegidos.', 'Contrato com schema inválido.', 'Teste tautológico rejeitado antes da fase GREEN.', 'Modificação de teste protegido rejeitada.', 'Symlink escapando do workspace autorizado.', 'Handoff com `workspace_context_id` divergente.', 'Evidência contendo padrão de segredo.', 'Fluxo positivo RED → GREEN com evidências válidas.'
] as const;
export interface ScenarioResult {
    readonly official_number: number;
    readonly identifier: string;
    readonly objective: string;
    readonly initial_conditions: string;
    readonly procedure: readonly string[];
    readonly expected: string;
    readonly observed: unknown;
    readonly status: 'PASS' | 'FAIL' | 'BLOCKED';
    readonly evidence_directory: string;
    readonly artifacts: readonly {
        path: string;
        sha256: string;
    }[];
}
export function syntheticContract(workspace: string, base: string, execution: string): TaskContract {
    return { schema_version: '0.3-p0', contract_revision: 1, identity: { execution_id: execution, backlog_id: 'P1-008', repository: 'synthetic-fixture', workspace_context_id: 'SYNTHETIC_LAB', workspace_root: workspace, base_commit: base }, governance: { risk_level: 'LOW', approval_required: true }, scope: { objective: 'Synthetic sum returns 3 with host evidence', allowed_impl_paths: ['src/sum.cjs'], allowed_test_paths: ['tests/sum.cjs'], forbidden_changes: ['protected.txt'], protected_existing_tests: true }, validation: { strategy: 'RED_GREEN', positive_tests: ['sum(1,2)=3'], negative_tests: ['wrong sum rejected'], boundary_tests: ['sum(0,0)=0'], acceptance_checks: ['Legitimate RED followed by GREEN; protected tests unchanged'], validation_commands: ['node tests/sum.cjs'] }, execution: { selected_executor: 'synthetic', mode: 'CONTROLLED', timeout_seconds: 10, retry_limit: 0 }, rollback: { procedure: 'Archive observed changes and restore only registered fixture' }, ias_normative_card: null };
}
export function syntheticApproval(contract: TaskContract, extra: Partial<ApprovalRecord> = {}): ApprovalRecord {
    return { schema_version: '0.3-p0', approval_id: 'SYN-APPROVAL-' + contract.identity.execution_id, execution_id: contract.identity.execution_id, contract_revision: contract.contract_revision, approved_contract_sha256: canonicalHash(contract), canonicalization_version: 'JCS-RFC8785-v1', approval_scope: 'EXECUTION', authorized_by: 'SYNTHETIC_OWNER_NOT_REAL_HUMAN_APPROVAL', authorized_at: new Date().toISOString(), approval_source: 'SYNTHETIC_LAB_ONLY', ...extra };
}
export function syntheticReview(contract: TaskContract, outcome: AttemptOutcome): ReviewReport {
    if (!outcome.manifest)
        throw Error('MISSING_MANIFEST');
    return { schema_version: '0.3-p0', review_id: 'SYN-REVIEW-' + outcome.attempt.attempt_id, execution_id: outcome.attempt.execution_id, attempt_id: outcome.attempt.attempt_id, reviewed_contract_sha256: canonicalHash(contract), reviewed_diff_sha256: outcome.manifest.git.diff_sha256, reviewer_model: 'SYNTHETIC_REVIEW_FIXTURE_NOT_REAL_REVIEW', review_timestamp: new Date().toISOString(), categories_evaluated: REVIEW_CATEGORIES.map(category => ({ category, applicable: true })), findings: [], verdict: 'APPROVED', limitations: ['Synthetic gate input only; no independent review of the project was performed'] };
}
function listArtifacts(dir: string): {
    path: string;
    sha256: string;
}[] {
    const result: {
        path: string;
        sha256: string;
    }[] = [];
    function walk(current: string): void { for (const name of fs.readdirSync(current).sort()) {
        const full = path.join(current, name), stat = fs.lstatSync(full);
        if (stat.isDirectory())
            walk(full);
        else if (stat.isFile())
            result.push({ path: path.relative(dir, full), sha256: sha256(fs.readFileSync(full)) });
    } }
    walk(dir);
    return result;
}
export async function runScenario(number: number, outputRoot: string): Promise<ScenarioResult> {
    if (!Number.isInteger(number) || number < 1 || number > 16)
        throw Error('UNKNOWN_OFFICIAL_SCENARIO');
    const identifier = `P1-008-${String(number).padStart(2, '0')}`;
    const execution = identifier + '-' + randomUUID();
    const evidenceDir = safePath(outputRoot, identifier, false);
    fs.mkdirSync(evidenceDir);
    const fixture = createFixture(execution, 'A', number === 11 ? 'tautological' : 'functional');
    let contract = syntheticContract(fixture.workspace, fixture.base_commit, execution);
    let approval: ApprovalRecord | null = syntheticApproval(contract);
    const policy: ReadinessPolicy = { trusted: [trustApproval(approval)], environment_authorized: true, data_classification: 'SYNTHETIC_LAB', required_dependencies: ['P1-002'], completed_dependencies: ['P1-002'], conflict: false };
    writeNew(path.join(evidenceDir, 'fixture-record.json'), fixture);
    writeNew(path.join(evidenceDir, 'baseline-files.json'), Object.fromEntries(['src/sum.cjs', 'tests/sum.cjs', 'protected.txt'].map(p => [p, fs.readFileSync(safePath(fixture.workspace, p), 'utf8')])));
    const procedure: string[] = ['Create independent registered Git fixture with deterministic base; enroll explicitly synthetic host authorization'];
    let expected = 'Reject invalid continuation with preserved evidence';
    let observed: unknown = null;
    let status: ScenarioResult['status'] = 'FAIL';
    let outcome: AttemptOutcome | undefined;
    try {
        if (number === 1) {
            contract = { ...contract, scope: { ...contract.scope, objective: 'Changed AFTER approval' } };
            procedure.push('Alter approved contract without re-enrolling approval');
        }
        if (number === 2) {
            approval = null;
            procedure.push('Remove execution approval');
        }
        if (number === 10) {
            contract = { ...contract, schema_version: 'invalid' as TaskContract['schema_version'] };
            procedure.push('Submit incompatible schema_version');
        }
        const scenarios: Partial<Record<number, SyntheticScenario>> = { 3: 'SYN-005', 4: 'SYN-004', 5: 'SYN-002', 9: 'SYN-007', 12: 'SYN-010' };
        if (number !== 6) {
            const selected = scenarios[number] ?? 'SYN-001';
            procedure.push(`Run serial adapter (${selected}), host TASK-READY/RED/executor/GREEN/collection/handoff/gates`);
            outcome = await executeAttempt(fixture, contract, approval, policy, selected);
            fs.cpSync(outcome.evidence_dir, path.join(evidenceDir, 'attempt'), { recursive: true, errorOnExist: true, force: false });
            observed = { state: outcome.attempt.state, task_ready: outcome.readiness, validation: outcome.validation };
        }
        switch (number) {
            case 1:
                assert.ok(outcome!.readiness.reasons.includes('CONTRACT_HASH_MISMATCH'));
                assert.equal(outcome!.attempt.state, 'BLOCKED');
                break;
            case 2:
                assert.ok(outcome!.readiness.reasons.includes('INVALID_APPROVAL'));
                assert.equal(outcome!.attempt.state, 'BLOCKED');
                break;
            case 3:
                assert.equal(outcome!.result!.agent_declared_outcome, 'completed');
                assert.equal(outcome!.manifest!.test_evidence.green!.observed_outcome, 'FAIL');
                assert.equal(outcome!.validation!.allowed, false);
                break;
            case 4: {
                assert.equal(outcome!.attempt.state, 'FAILED');
                assert.match(fs.readFileSync(path.join(outcome!.evidence_dir, 'executor-observation.json'), 'utf8'), /EROFS|EACCES|EPERM/);
                procedure.push('Host fault injection ONLY inside this disposable fixture: actually change forbidden protected.txt; verify detectively as well');
                fs.writeFileSync(safePath(fixture.workspace, 'protected.txt'), 'HOST_INJECTED_OUT_OF_SCOPE');
                const workspace = observeWorkspace(fixture, contract);
                const reasons = verifyEvidence(fixture, contract, outcome!.attempt, outcome!.manifest, outcome!.evidence_dir);
                const gate = validationGate(fixture, contract, outcome!.attempt, outcome!.manifest!, outcome!.result!, outcome!.evidence_dir, outcome!.handoff!);
                persistDecision(evidenceDir, 'fault-validation-gate', gate);
                assert.equal(gate.allowed, false);
                writeNew(path.join(evidenceDir, 'fault-injection.json'), { workspace, reasons });
                assert.ok(workspace.unexpected.includes('protected.txt'));
                assert.ok(reasons.includes('SCOPE_VIOLATION'));
                observed = { prevented: outcome!.validation, detected: reasons };
                break;
            }
            case 5: {
                assert.equal(outcome!.attempt.state, 'FAILED');
                assert.match(fs.readFileSync(safePath(fixture.workspace, 'src/sum.cjs'), 'utf8'), /partial/);
                procedure.push('Preserve partial diff/logs; rollback only the registered fixture, retaining archived content');
                rollbackFixture(fixture, evidenceDir);
                assert.ok(fs.readdirSync(evidenceDir).some(p => p.startsWith('rollback-')));
                break;
            }
            case 6: {
                procedure.push('Record RUNNING with actual bwrap process token; interrupt real process; simulate host missing terminal write; reconcile orphan twice without retry');
                const runs = path.join(resolveWorkspaceRoot(), 'runs'), store = new AttemptStore(runs);
                const initial: ExecutionAttempt = { schema_version: '0.3-p0', execution_id: execution, attempt_id: 'A', approval_id: approval!.approval_id, approved_contract_sha256: canonicalHash(contract), executor: 'synthetic', state: 'CREATED', started_at: null, finished_at: null, base_commit: fixture.base_commit, workspace_root: fixture.workspace, process_identity: null, termination_reason: null };
                store.create(initial);
                const dir = safePath(runs, execution + '/attempts/A');
                const ready = await taskReady(fixture, contract, approval, initial, policy, dir);
                persistDecision(dir, 'task-ready', ready);
                assert.equal(ready.allowed, true);
                const red = await observeTest(fixture, dir, 'red');
                assert.equal(red.observed_outcome, 'FAIL');
                const observation = await runProcess('/usr/bin/bwrap', sandboxArguments(fixture, ['src/sum.cjs'], "require('node:fs').writeFileSync('src/sum.cjs','// interrupted partial\\nmodule.exports=()=>0;');setInterval(()=>{},1000)"), { cwd: fixture.workspace, interrupt_after_ms: 120, onStart: identity => { store.transition(execution, 'A', 'RUNNING', null, identity); } });
                writeNew(path.join(dir, 'executor-observation.json'), observation);
                assert.equal(observation.termination_reason, 'INTERRUPTED');
                assert.equal(store.load(execution, 'A').state, 'RUNNING');
                const reconciled = store.reconcile(execution, 'A');
                assert.equal(reconciled.state, 'INTERRUPTED');
                assert.equal(store.reconcile(execution, 'A').state, 'INTERRUPTED');
                assert.match(fs.readFileSync(safePath(fixture.workspace, 'src/sum.cjs'), 'utf8'), /interrupted partial/);
                const partialManifest = collectEvidence(fixture, contract, reconciled, dir, red, null);
                const denied = validationGate(fixture, contract, reconciled, partialManifest, { schema_version: '0.3-p0', execution_id: execution, attempt_id: 'A', executor: 'synthetic', agent_declared_outcome: 'completed', agent_summary: 'Synthetic false claim after interruption', agent_reported_blockers: [] }, dir);
                persistDecision(dir, 'validation-gate', denied);
                assert.equal(denied.allowed, false);
                fs.cpSync(dir, path.join(evidenceDir, 'attempt'), { recursive: true });
                observed = { ready, observation, reconciled, reconciliation_idempotent: true, attempt_count: fs.readdirSync(path.dirname(dir)).length };
                assert.equal(fs.readdirSync(path.dirname(dir)).length, 1);
                break;
            }
            case 7:
            case 8:
            case 16: {
                const o = outcome!;
                assert.equal(o.validation!.allowed, true);
                let review = syntheticReview(contract, o);
                if (number === 7) {
                    review = { ...review, reviewed_diff_sha256: 'f'.repeat(64) };
                    procedure.push('Use trusted synthetic review for an obsolete diff');
                }
                const merge = syntheticApproval(contract, { approval_id: 'SYN-MERGE-' + execution, approval_scope: 'MERGE', attempt_id: number === 8 ? 'OTHER-ATTEMPT' : o.attempt.attempt_id, approved_diff_sha256: o.manifest!.git.diff_sha256, review_id: review.review_id });
                const gate = prGate(fixture, contract, o.attempt, o.manifest!, o.result!, o.handoff!, review, merge, o.evidence_dir, { trusted_approvals: [trustApproval(merge)], trusted_review_sha256: [canonicalHash(review)], rollback_evaluated: true, risks_treated: true });
                writeNew(path.join(evidenceDir, 'synthetic-review.json'), review);
                writeNew(path.join(evidenceDir, 'synthetic-merge-approval.json'), merge);
                persistDecision(evidenceDir, 'pr-gate', gate);
                if (number === 7)
                    assert.ok(gate.reasons.includes('STALE_REVIEW'));
                if (number === 8)
                    assert.ok(gate.reasons.includes('MERGE_ATTEMPT_MISMATCH'));
                if (number === 16) {
                    expected = 'Real RED assertion then GREEN, protected bytes and governance intact, valid handoff, synthetic PR-GATE allowed without merge';
                    assert.equal(gate.allowed, true);
                    const integrity = JSON.parse(fs.readFileSync(path.join(o.evidence_dir, 'governance-integrity.json'), 'utf8'));
                    assert.equal(integrity.intact, true);
                }
                observed = { ...observed as object, pr_gate: gate };
                break;
            }
            case 9: {
                const protectedFile = path.join(path.dirname(fixture.workspace), 'governance/approval.json');
                assert.equal(JSON.parse(fs.readFileSync(protectedFile, 'utf8')).authorization, 'host-only');
                assert.equal(outcome!.attempt.state, 'FAILED');
                assert.match(fs.readFileSync(path.join(outcome!.evidence_dir, 'executor-observation.json'), 'utf8'), /EROFS|EACCES|EPERM/);
                writeNew(path.join(evidenceDir, 'protected-sentinel.json'), { content: fs.readFileSync(protectedFile, 'utf8'), sha256: sha256(fs.readFileSync(protectedFile)), governance_integrity: JSON.parse(fs.readFileSync(path.join(outcome!.evidence_dir, 'governance-integrity.json'), 'utf8')) });
                break;
            }
            case 10:
                assert.ok(outcome!.readiness.reasons.includes('INVALID_CONTRACT'));
                assert.equal(outcome!.attempt.state, 'BLOCKED');
                break;
            case 11:
                assert.equal(outcome!.validation!.allowed, false);
                assert.ok(outcome!.validation!.reasons.includes('INVALID_RED'));
                assert.equal(outcome!.attempt.state, 'BLOCKED');
                assert.equal(fs.existsSync(path.join(outcome!.evidence_dir, 'green.json')), false);
                assert.equal(fs.existsSync(path.join(outcome!.evidence_dir, 'executor-observation.json')), false);
                break;
            case 12: {
                assert.equal(outcome!.attempt.state, 'FAILED');
                procedure.push('Host fault injection only in controlled fixture: replace protected test after preventive rejection, then verify detection');
                fs.writeFileSync(safePath(fixture.workspace, 'tests/sum.cjs'), 'console.log("SYN_TEST_PASS");');
                const workspace = observeWorkspace(fixture, contract);
                const reasons = verifyEvidence(fixture, contract, outcome!.attempt, outcome!.manifest, outcome!.evidence_dir);
                const gate = validationGate(fixture, contract, outcome!.attempt, outcome!.manifest!, outcome!.result!, outcome!.evidence_dir, outcome!.handoff!);
                persistDecision(evidenceDir, 'fault-validation-gate', gate);
                assert.equal(gate.allowed, false);
                writeNew(path.join(evidenceDir, 'fault-injection.json'), { workspace, reasons });
                assert.equal(workspace.tests_protected, false);
                assert.ok(reasons.includes('PROTECTED_TEST_CHANGED'));
                break;
            }
            case 13: {
                procedure.push('Host injects symlink in controlled fixture pointing to synthetic sibling sentinel; verify rejection before read/export');
                const sentinel = path.join(path.dirname(fixture.workspace), 'outside-sentinel.txt');
                fs.writeFileSync(sentinel, 'SYNTHETIC_OUTSIDE_SENTINEL');
                const hash = sha256(fs.readFileSync(sentinel));
                fs.symlinkSync(sentinel, path.join(fixture.workspace, 'escape'));
                const reasons = verifyEvidence(fixture, contract, outcome!.attempt, outcome!.manifest, outcome!.evidence_dir);
                const gate = validationGate(fixture, contract, outcome!.attempt, outcome!.manifest!, outcome!.result!, outcome!.evidence_dir, outcome!.handoff!);
                persistDecision(evidenceDir, 'symlink-validation-gate', gate);
                assert.equal(gate.allowed, false);
                writeNew(path.join(evidenceDir, 'symlink-rejection.json'), { target: sentinel, reasons, before: hash, after: sha256(fs.readFileSync(sentinel)) });
                assert.ok(reasons.some(r => r.includes('SYMLINK')));
                assert.equal(sha256(fs.readFileSync(sentinel)), hash);
                break;
            }
            case 14: {
                const h = { ...outcome!.handoff!, workspace_context_id: 'DIVERGENT_CONTEXT' };
                const reasons = verifyHandoff(fixture, contract, outcome!.attempt, outcome!.manifest!, h, outcome!.evidence_dir);
                const gate = validationGate(fixture, contract, outcome!.attempt, outcome!.manifest!, outcome!.result!, outcome!.evidence_dir, h);
                persistDecision(evidenceDir, 'handoff-validation-gate', gate);
                assert.equal(gate.allowed, false);
                writeNew(path.join(evidenceDir, 'invalid-handoff.json'), { handoff: h, reasons });
                assert.ok(reasons.includes('HANDOFF_CONTEXT'));
                break;
            }
            case 15: {
                procedure.push('Add explicitly fake secret-pattern evidence and attempt handoff with matching hash');
                const secret = 'token=sk-' + 'SYNTHETIC_ONLY_NOT_A_REAL_SECRET_123456';
                const file = safePath(outcome!.evidence_dir, 'synthetic-secret.txt', false);
                fs.writeFileSync(file, secret);
                const h = { ...outcome!.handoff!, included_artifacts: [...outcome!.handoff!.included_artifacts, { path: 'synthetic-secret.txt', sha256: sha256(secret) }] };
                const reasons = verifyHandoff(fixture, contract, outcome!.attempt, outcome!.manifest!, h, outcome!.evidence_dir);
                const gate = validationGate(fixture, contract, outcome!.attempt, outcome!.manifest!, outcome!.result!, outcome!.evidence_dir, h);
                persistDecision(evidenceDir, 'secret-validation-gate', gate);
                assert.equal(gate.allowed, false);
                writeNew(path.join(evidenceDir, 'secret-rejection.json'), { handoff: h, reasons, synthetic_secret: true });
                assert.ok(reasons.includes('SECRET_DETECTED'));
                fs.copyFileSync(file, path.join(evidenceDir, 'synthetic-secret.txt'));
                break;
            }
        }
        status = 'PASS';
    }
    catch (error) {
        observed = { prior: observed, error: error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error) };
        status = (error instanceof Error && /EPERM|ISOLATION_UNPROVEN|ENVIRONMENT_CHECK_FAILED/.test(error.message)) ? 'BLOCKED' : 'FAIL';
    }
    const result: ScenarioResult = { official_number: number, identifier, objective: REQUIRED_SCENARIOS[number - 1]!, initial_conditions: 'SYNTHETIC_LAB; independent Git fixture; serial host; zero retry; synthetic approval/review inputs only', procedure, expected, observed, status, evidence_directory: evidenceDir, artifacts: listArtifacts(evidenceDir) };
    writeNew(path.join(evidenceDir, 'scenario-result.json'), result);
    return result;
}
export async function runSimulation(): Promise<{
    run_id: string;
    results: ScenarioResult[];
    passed: number;
    failed: number;
    blocked: number;
}> {
    const lab = resolveWorkspaceRoot();
    for (const dir of REQUIRED_LAB_DIRECTORIES)
        if (!fs.statSync(path.join(lab, dir)).isDirectory())
            throw Error('MISSING_LAB_DIRECTORY');
    const run_id = 'run-' + randomUUID();
    const root = path.join(lab, 'docs/evidence/p1-execution/scenarios', run_id);
    fs.mkdirSync(root, { recursive: true });
    const results: ScenarioResult[] = [];
    for (let i = 1; i <= 16; i++)
        results.push(await runScenario(i, root));
    const report = { run_id, results, passed: results.filter(r => r.status === 'PASS').length, failed: results.filter(r => r.status === 'FAIL').length, blocked: results.filter(r => r.status === 'BLOCKED').length };
    writeNew(path.join(root, 'report.json'), report);
    // A new run is always retained. This pointer is a convenience, not the audit source.
    fs.writeFileSync(path.join(lab, 'docs/evidence/p1-simulation-report.json'), JSON.stringify(report, null, 2) + '\n');
    const rows = results.map(r => `| ${r.official_number} | ${r.objective.replaceAll('|', '/')} | ${r.status} | [artefatos](p1-execution/scenarios/${run_id}/${r.identifier}/scenario-result.json) |`).join('\n');
    fs.writeFileSync(path.join(lab, 'docs/evidence/P1-Relatorio-Final-Validacao.md'), `# Validação integrada P1\n\nExecução ${run_id}. PASS=${report.passed}, FAIL=${report.failed}, BLOCKED=${report.blocked}.\n\nIdentificadores P1-008-01..16 são convenção local que mapeia os números oficiais 1..16 da P1 §6; os nomes oficiais foram preservados.\n\n| # oficial | Cenário | Resultado | Evidência |\n|---|---|---|---|\n${rows}\n\nAprovações e revisões usadas pelos cenários são sintéticas. Nenhum merge, push, exportação externa ou revisão independente real foi realizado. A avaliação preventiva e a detecção por injeção host estão discriminadas nos procedimentos individuais.\n`);
    return report;
}
