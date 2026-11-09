import fs from 'node:fs';
import path from 'node:path';
import type { EvidenceManifest, ExecutionAttempt, TaskContract, TestRunRecord } from '../contracts/types.js';
import { validateEvidenceManifest } from '../contracts/validator.js';
import { canonicalHash, canonicalize, sha256 } from '../contracts/integrity.js';
import { type Fixture, verifyFixture, assertSyntheticSource } from '../execution/fixtures.js';
import { git, safePath, readJson, writeNew } from '../execution/host.js';
import { runFixtureTest } from '../execution/synthetic.js';
import type { ProcessObservation } from '../execution/process.js';
export interface WorkspaceObservation {
    readonly files: readonly string[];
    readonly unexpected: readonly string[];
    readonly diff: string;
    readonly tests_protected: boolean;
}
export function observeWorkspace(fixture: Fixture, contract: TaskContract): WorkspaceObservation {
    verifyFixture(fixture);
    const tracked = git(fixture.workspace, ['diff', '--name-only', '--no-renames', '-z', fixture.base_commit]).split('\0').filter(Boolean);
    const untracked = git(fixture.workspace, ['ls-files', '--others', '-z']).split('\0').filter(Boolean);
    const files = [...new Set([...tracked, ...untracked])].sort();
    const changes = files.map(file => { const target = safePath(fixture.workspace, file, false); const stat = fs.lstatSync(target, { throwIfNoEntry: false }); if (stat && !stat.isFile())
        throw Error('SPECIAL_FILE_FORBIDDEN'); return { path: file, deleted: !stat, content: stat ? fs.readFileSync(target).toString('base64') : null }; });
    const allowed = new Set([...contract.scope.allowed_impl_paths, ...contract.scope.allowed_test_paths]);
    const unexpected = files.filter(file => !allowed.has(file) || contract.scope.forbidden_changes.some(p => file === p || file.startsWith(p + '/')));
    const tests = git(fixture.workspace, ['ls-tree', '-r', '--name-only', '-z', fixture.base_commit, '--', 'tests/']).split('\0').filter(Boolean);
    const tests_protected = !contract.scope.protected_existing_tests || tests.every(file => {
        const target = safePath(fixture.workspace, file, false);
        return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === git(fixture.workspace, ['show', `${fixture.base_commit}:${file}`]);
    });
    const diff = canonicalize({ tracked_diff: git(fixture.workspace, ['diff', '--binary', '--no-ext-diff', '--no-textconv', fixture.base_commit]), changes });
    return { files, unexpected, diff, tests_protected };
}
export async function observeTest(fixture: Fixture, evidenceDir: string, phase: 'red' | 'green' | 'baseline'): Promise<TestRunRecord> {
    const observation = await runFixtureTest(fixture);
    const log_path = `${phase}.json`;
    const log = { phase, fixture_execution_id: fixture.execution_id, attempt_id: fixture.attempt_id, test_sha256: sha256(fs.readFileSync(safePath(fixture.workspace, 'tests/sum.cjs'))), observation };
    writeNew(safePath(evidenceDir, log_path, false), log);
    const outcome = observation.termination_reason === 'TIMEOUT' ? 'TIMEOUT' : observation.truncated ? 'ERROR' : observation.exit_code === 0 && observation.stdout.includes('SYN_TEST_PASS') ? 'PASS' : observation.exit_code === 1 && observation.stderr.includes('SYN_EXPECT_SUM_3') ? 'FAIL' : 'ERROR';
    return { command: 'node tests/sum.cjs', working_directory: fixture.workspace, started_at: observation.started_at, duration_ms: observation.duration_ms, exit_code: observation.exit_code, log_path, log_sha256: sha256(fs.readFileSync(path.join(evidenceDir, log_path))), observed_outcome: outcome };
}
export function collectEvidence(fixture: Fixture, contract: TaskContract, attempt: ExecutionAttempt, evidenceDir: string, red: TestRunRecord | null, green: TestRunRecord | null): EvidenceManifest {
    const observed = observeWorkspace(fixture, contract);
    const diffPath = safePath(evidenceDir, 'diff.bundle.json', false);
    fs.writeFileSync(diffPath, observed.diff, { flag: 'wx' });
    writeNew(safePath(evidenceDir, 'workspace-observation.json', false), observed);
    const artifacts = ['diff.bundle.json', 'workspace-observation.json', ...['executor-observation.json', 'isolation-proof.json', 'governance-integrity.json'].filter(p => fs.existsSync(safePath(evidenceDir, p, false))), ...[red, green].filter((r): r is TestRunRecord => r !== null).map(r => r.log_path)].map(file => ({ path: file, sha256: sha256(fs.readFileSync(safePath(evidenceDir, file))) }));
    const manifest: EvidenceManifest = { schema_version: '0.3-p0', execution_id: contract.identity.execution_id, attempt_id: attempt.attempt_id, evidence_origin: 'HOST_OBSERVED', git: { base_sha: fixture.base_commit, head_sha: git(fixture.workspace, ['rev-parse', 'HEAD']).trim(), dirty_worktree_files: observed.files, diff_sha256: sha256(observed.diff) }, test_evidence: { strategy: contract.validation.strategy, red, green, baseline: null }, independent_test_runs: [red, green].filter((r): r is TestRunRecord => r !== null), scope_validation: { result: observed.unexpected.length === 0 && observed.tests_protected ? 'PASS' : 'FAIL', unexpected_files: observed.unexpected }, evidence_integrity: { artifact_hashes: artifacts } };
    if (!validateEvidenceManifest(manifest).valid)
        throw Error('INVALID_COLLECTED_MANIFEST');
    writeNew(safePath(evidenceDir, 'evidence-manifest.json', false), manifest);
    return manifest;
}
export function verifyEvidence(fixture: Fixture, contract: TaskContract, attempt: ExecutionAttempt, input: unknown, dir: string): readonly string[] {
    const parsed = validateEvidenceManifest(input);
    if (!parsed.valid)
        return ['INVALID_EVIDENCE_SCHEMA'];
    const m = parsed.value;
    const reasons: string[] = [];
    try {
        assertSyntheticSource(fixture);
        if (contract.identity.execution_id !== fixture.execution_id || attempt.execution_id !== fixture.execution_id || attempt.executor !== contract.execution.selected_executor || attempt.attempt_id !== fixture.attempt_id || m.execution_id !== contract.identity.execution_id || m.attempt_id !== attempt.attempt_id || attempt.approved_contract_sha256 !== canonicalHash(contract) || attempt.workspace_root !== fixture.workspace || attempt.base_commit !== fixture.base_commit || m.git.base_sha !== fixture.base_commit || m.git.head_sha !== fixture.base_commit)
            reasons.push('EVIDENCE_BINDING');
        if (canonicalHash(readJson(safePath(dir, 'evidence-manifest.json'))) !== canonicalHash(m))
            reasons.push('MANIFEST_INTEGRITY');
        const observed = observeWorkspace(fixture, contract);
        if (m.git.diff_sha256 !== sha256(observed.diff) || canonicalHash(m.git.dirty_worktree_files) !== canonicalHash(observed.files))
            reasons.push('WORKSPACE_CHANGED');
        if (observed.unexpected.length || m.scope_validation.result !== 'PASS' || m.scope_validation.unexpected_files.length)
            reasons.push('SCOPE_VIOLATION');
        if (!observed.tests_protected)
            reasons.push('PROTECTED_TEST_CHANGED');
        if (m.test_evidence.strategy !== contract.validation.strategy)
            reasons.push('TEST_STRATEGY_MISMATCH');
        const artifacts = m.evidence_integrity.artifact_hashes;
        if (!artifacts.some(a => a.path === 'diff.bundle.json' && a.sha256 === m.git.diff_sha256))
            reasons.push('MISSING_DIFF');
        for (const artifact of artifacts)
            if (sha256(fs.readFileSync(safePath(dir, artifact.path))) !== artifact.sha256)
                reasons.push('ARTIFACT_INTEGRITY');
        for (const test of m.independent_test_runs) {
            const logFile = safePath(dir, test.log_path);
            if (sha256(fs.readFileSync(logFile)) !== test.log_sha256) {
                reasons.push('ARTIFACT_INTEGRITY');
                continue;
            }
            const log = readJson(logFile) as {
                fixture_execution_id: string;
                attempt_id: string;
                observation: ProcessObservation;
            };
            const o = log.observation;
            if (log.fixture_execution_id !== fixture.execution_id || log.attempt_id !== attempt.attempt_id || test.command !== 'node tests/sum.cjs' || test.working_directory !== fixture.workspace || test.started_at !== o.started_at || test.duration_ms !== o.duration_ms || test.exit_code !== o.exit_code || o.truncated)
                reasons.push('TEST_OBSERVATION_MISMATCH');
            if ((test.observed_outcome === 'PASS' && (o.exit_code !== 0 || !o.stdout.includes('SYN_TEST_PASS'))) || (test.observed_outcome === 'FAIL' && (o.exit_code !== 1 || !o.stderr.includes('SYN_EXPECT_SUM_3'))))
                reasons.push('TEST_OBSERVATION_MISMATCH');
        }
        const red = m.test_evidence.red, green = m.test_evidence.green;
        if (!green || green.observed_outcome !== 'PASS' || green.exit_code !== 0)
            reasons.push('MISSING_GREEN');
        for (const record of [red, green, m.test_evidence.baseline])
            if (record && !m.independent_test_runs.some(r => canonicalHash(r) === canonicalHash(record)))
                reasons.push('UNOBSERVED_TEST');
        if (contract.validation.strategy === 'RED_GREEN' || contract.validation.strategy === 'RED_GREEN_WHEN_APPLICABLE') {
            if (!red || red.observed_outcome !== 'FAIL' || red.exit_code !== 1)
                reasons.push('INVALID_RED');
            if (red && green) {
                const r = readJson(safePath(dir, red.log_path)) as {
                    test_sha256: string;
                    observation: ProcessObservation;
                };
                const g = readJson(safePath(dir, green.log_path)) as {
                    test_sha256: string;
                    observation: ProcessObservation;
                };
                if (r.test_sha256 !== g.test_sha256 || g.test_sha256 !== sha256(fs.readFileSync(safePath(fixture.workspace, 'tests/sum.cjs'))))
                    reasons.push('TEST_CHANGED_BETWEEN_PHASES');
                if (red.log_path === green.log_path || Date.parse(green.started_at) < Date.parse(red.started_at) + red.duration_ms)
                    reasons.push('INVALID_PHASE_ORDER');
            }
        }
        else if (contract.validation.strategy === 'REGRESSION_BASELINE' && !m.test_evidence.baseline)
            reasons.push('MISSING_BASELINE');
    }
    catch (error) {
        reasons.push('EVIDENCE_IO:' + (error instanceof Error ? error.message : 'unknown'));
    }
    return [...new Set(reasons)];
}
/** Include names, bytes, modes and symlink targets without following links. */
export function snapshotTree(root: string): string {
    const entries: unknown[] = [];
    function visit(dir: string): void { for (const name of fs.readdirSync(dir).sort()) {
        const file = path.join(dir, name), stat = fs.lstatSync(file);
        const rel = path.relative(root, file);
        entries.push({ path: rel, mode: stat.mode, type: stat.isSymbolicLink() ? 'symlink' : stat.isDirectory() ? 'directory' : 'file', content: stat.isSymbolicLink() ? fs.readlinkSync(file) : stat.isFile() ? sha256(fs.readFileSync(file)) : null });
        if (stat.isDirectory())
            visit(file);
    } }
    visit(root);
    return canonicalHash(entries);
}
