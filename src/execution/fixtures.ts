import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveWorkspaceRoot } from '../contracts/schema-loader.js';
import { canonicalHash, sha256 } from '../contracts/integrity.js';
import { git, identifier, safePath, readJson, writeNew, within } from './host.js';
export interface Fixture {
    readonly execution_id: string;
    readonly attempt_id: string;
    readonly workspace: string;
    readonly base_commit: string;
    readonly record_path: string;
}
export const RED_TEST = "const assert=require('node:assert/strict');const sum=require('../src/sum.cjs');assert.equal(sum(1,2),3,'SYN_EXPECT_SUM_3');assert.equal(sum(0,0),0);console.log('SYN_TEST_PASS');\n";
export function createFixture(execution: string, attempt: string, testKind: 'functional' | 'tautological' = 'functional'): Fixture {
    const lab = resolveWorkspaceRoot();
    const fixtures = path.join(lab, 'worktrees');
    const parent = safePath(fixtures, `${identifier(execution)}/${identifier(attempt)}`, false);
    fs.mkdirSync(path.dirname(parent), { recursive: true });
    fs.mkdirSync(parent);
    const workspace = path.join(parent, 'workspace');
    fs.mkdirSync(workspace);
    fs.mkdirSync(path.join(workspace, 'src'));
    fs.mkdirSync(path.join(workspace, 'tests'));
    fs.writeFileSync(path.join(workspace, 'src/sum.cjs'), 'module.exports=(a,b)=>0;\n');
    fs.writeFileSync(path.join(workspace, 'tests/sum.cjs'), testKind === 'tautological' ? "console.log('SYN_TEST_PASS');\n" : RED_TEST);
    fs.writeFileSync(path.join(workspace, 'protected.txt'), 'SYNTHETIC_PROTECTED\n');
    git(workspace, ['init', '-q', '--initial-branch=main']);
    git(workspace, ['add', '--', '.']);
    git(workspace, ['commit', '-q', '-m', 'Synthetic deterministic baseline']);
    const fixture: Fixture = { execution_id: execution, attempt_id: attempt, workspace, base_commit: git(workspace, ['rev-parse', 'HEAD']).trim(), record_path: path.join(parent, 'fixture.json') };
    writeNew(fixture.record_path, fixture);
    return fixture;
}
export function verifyFixture(fixture: Fixture): void {
    const fixtures = path.join(resolveWorkspaceRoot(), 'worktrees');
    const parent = safePath(fixtures, `${identifier(fixture.execution_id)}/${identifier(fixture.attempt_id)}`);
    if (fixture.workspace !== path.join(parent, 'workspace') || fixture.record_path !== path.join(parent, 'fixture.json'))
        throw Error('UNREGISTERED_FIXTURE');
    const registered = readJson(safePath(parent, 'fixture.json'));
    if (canonicalHash(registered) !== canonicalHash(fixture))
        throw Error('FIXTURE_IDENTITY_MISMATCH');
    safePath(parent, 'workspace/.git');
    if (git(fixture.workspace, ['rev-parse', '--show-toplevel']).trim() !== fixture.workspace)
        throw Error('FIXTURE_ROOT_MISMATCH');
    if (git(fixture.workspace, ['rev-parse', 'HEAD']).trim() !== fixture.base_commit)
        throw Error('FIXTURE_BASE_MISMATCH');
}
/** Archive every affected byte before individually restoring paths. No reset/clean. */
export function rollbackFixture(fixture: Fixture, evidenceDir: string): void {
    verifyFixture(fixture);
    const evidenceRoot = fs.realpathSync(evidenceDir);
    const lab = resolveWorkspaceRoot();
    if (!within(path.join(lab, 'runs'), evidenceRoot) && !within(path.join(lab, 'docs/evidence'), evidenceRoot))
        throw Error('UNAUTHORIZED_ARCHIVE_ROOT');
    if (within(fixture.workspace, evidenceRoot))
        throw Error('EVIDENCE_MUST_BE_OUTSIDE_FIXTURE');
    const archive = path.join(evidenceRoot, 'rollback-' + randomUUID());
    fs.mkdirSync(archive);
    const tracked = git(fixture.workspace, ['ls-tree', '-r', '--name-only', '-z', fixture.base_commit]).split('\0').filter(Boolean);
    const untracked = git(fixture.workspace, ['ls-files', '--others', '-z']).split('\0').filter(Boolean);
    const artifacts: {
        path: string;
        sha256: string;
        deleted: boolean;
    }[] = [];
    for (const file of [...new Set([...tracked, ...untracked])]) {
        const target = safePath(fixture.workspace, file, false);
        const stat = fs.lstatSync(target, { throwIfNoEntry: false });
        if (stat && !stat.isFile())
            throw Error('ROLLBACK_SPECIAL_FILE');
        const data = stat ? fs.readFileSync(target) : Buffer.alloc(0);
        const name = String(artifacts.length) + '.bin';
        fs.writeFileSync(path.join(archive, name), data);
        artifacts.push({ path: file, sha256: sha256(data), deleted: !stat });
    }
    writeNew(path.join(archive, 'manifest.json'), { fixture, artifacts, diff: git(fixture.workspace, ['diff', '--binary', fixture.base_commit]) });
    for (const file of tracked) {
        const target = safePath(fixture.workspace, file, false);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        // Synthetic fixture files are UTF-8, exclusively created by the host.
        fs.writeFileSync(target, git(fixture.workspace, ['show', `${fixture.base_commit}:${file}`]));
    }
    for (const file of untracked)
        fs.unlinkSync(safePath(fixture.workspace, file));
    git(fixture.workspace, ['add', '--', ...tracked]);
    writeNew(path.join(archive, 'result.json'), { restored: git(fixture.workspace, ['status', '--porcelain']) === '' });
}
