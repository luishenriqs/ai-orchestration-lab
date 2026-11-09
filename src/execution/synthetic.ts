import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { Fixture } from './fixtures.js';
import { verifyFixture, SYNTHETIC_SOURCES } from './fixtures.js';
import { runProcess, type ProcessObservation, type ProcessOptions } from './process.js';
import { safePath, writeNew } from './host.js';
import { sha256 } from '../contracts/integrity.js';
export const SYNTHETIC_SCENARIOS = ['SYN-001', 'SYN-002', 'SYN-003', 'SYN-004', 'SYN-005', 'SYN-006', 'SYN-007', 'SYN-008', 'SYN-009', 'SYN-010'] as const;
export type SyntheticScenario = (typeof SYNTHETIC_SCENARIOS)[number];
export function sandboxArguments(fixture: Fixture, writable: readonly string[], code: string, protectedDir?: string): string[] {
    verifyFixture(fixture);
    const args = ['--die-with-parent', '--new-session', '--unshare-all', '--cap-drop', 'ALL', '--clearenv', '--setenv', 'PATH', '/usr/bin:/bin', '--setenv', 'LANG', 'C', '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin', '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64', '--dir', '/runtime', '--ro-bind', process.execPath, '/runtime/node', '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp', '--ro-bind', fixture.workspace, '/workspace'];
    for (const file of writable) {
        // P1 synthetic executor can only change these exact implementation files.
        if (file !== 'src/sum.cjs')
            throw Error('UNAUTHORIZED_WRITE_MOUNT');
        const target = safePath(fixture.workspace, file);
        if (!fs.statSync(target).isFile())
            throw Error('WRITE_TARGET_NOT_FILE');
        args.push('--bind', target, '/workspace/' + file);
    }
    if (protectedDir)
        args.push('--ro-bind', fs.realpathSync(protectedDir), '/governance');
    args.push('--remount-ro', '/', '--chdir', '/workspace', '--', '/runtime/node', '-e', code);
    return args;
}
const scripts: Record<SyntheticScenario, string> = {
    'SYN-001': "require('node:fs').writeFileSync('src/sum.cjs','module.exports=(a,b)=>a+b;\\n');console.log('completed')",
    'SYN-002': "require('node:fs').writeFileSync('src/sum.cjs','// partial change\\nmodule.exports=()=>0;');console.error('SYN_PARTIAL_FAILURE');process.exit(2)",
    'SYN-003': "setInterval(()=>{},1000)",
    'SYN-004': "require('node:fs').writeFileSync('protected.txt','out-of-scope')",
    'SYN-005': "console.log('completed: all tests pass (UNTRUSTED CLAIM)')",
    'SYN-006': "require('node:fs').writeFileSync('src/sum.cjs','// interrupted\\nmodule.exports=()=>0;');setInterval(()=>{},1000)",
    'SYN-007': "require('node:fs').writeFileSync('/governance/approval.json','forged')",
    'SYN-008': "require('node:fs').writeFileSync('untracked.txt','undeclared')",
    'SYN-009': "console.log('completed: tautological test (UNTRUSTED CLAIM)')",
    'SYN-010': "require('node:fs').writeFileSync('tests/sum.cjs','console.log(\\\"pass\\\")')",
};
export async function executeSynthetic(fixture: Fixture, scenario: SyntheticScenario, options: Pick<ProcessOptions, 'onStart' | 'timeout_ms'> = {}): Promise<ProcessObservation> {
    if (!SYNTHETIC_SCENARIOS.includes(scenario))
        throw Error('UNKNOWN_SYNTHETIC_SCENARIO');
    const protectedDir = path.join(path.dirname(fixture.workspace), 'governance');
    fs.mkdirSync(protectedDir, { recursive: true });
    const approval = path.join(protectedDir, 'approval.json');
    if (!fs.existsSync(approval))
        writeNew(approval, { synthetic: true, authorization: 'host-only' });
    return runProcess('/usr/bin/bwrap', sandboxArguments(fixture, ['src/sum.cjs'], scripts[scenario], protectedDir), { cwd: fixture.workspace, ...options, timeout_ms: scenario === 'SYN-003' ? Math.min(options.timeout_ms ?? 10000, 1000) : options.timeout_ms ?? 10000, ...(scenario === 'SYN-006' ? { interrupt_after_ms: 100 } : {}) });
}
export async function runFixtureTest(fixture: Fixture): Promise<ProcessObservation> {
    // Check the actual mounted bytes in the same read-only sandbox before
    // require(). No executor-controlled code runs for unrecognized programs.
    const code = `const fs=require('node:fs');if(!${JSON.stringify(SYNTHETIC_SOURCES)}.includes(fs.readFileSync('src/sum.cjs','utf8'))){console.error('UNSUPPORTED_SYNTHETIC_SOURCE');process.exit(2)}require('./tests/sum.cjs')`;
    return runProcess('/usr/bin/bwrap', sandboxArguments(fixture, [], code), { cwd: fixture.workspace });
}
export async function probeIsolation(fixture: Fixture): Promise<{
    preventive: boolean;
    observation: ProcessObservation;
    before: string;
    after: string;
}> {
    verifyFixture(fixture);
    const dir = path.join(path.dirname(fixture.workspace), 'probe-governance-' + randomUUID());
    fs.mkdirSync(dir);
    const sentinel = path.join(dir, 'approval.json');
    writeNew(sentinel, { synthetic: 'protected-sentinel' });
    const before = sha256(fs.readFileSync(sentinel));
    const code = `const fs=require('node:fs');let denied=0;for(const op of [()=>fs.writeFileSync('/governance/approval.json','forged'),()=>fs.chmodSync('/governance/approval.json',0o777),()=>fs.unlinkSync('/governance/approval.json'),()=>fs.writeFileSync('/governance/new.json','x'),()=>fs.writeFileSync('protected.txt','x'),()=>fs.writeFileSync('tests/sum.cjs','x'),()=>fs.writeFileSync('.git/config','x'),()=>fs.writeFileSync('/outside','x')]){try{op()}catch(e){if(['EROFS','EACCES','EPERM'].includes(e.code))denied++}}if(denied!==8)process.exit(9);fs.writeFileSync('src/sum.cjs',${JSON.stringify(fs.readFileSync(path.join(fixture.workspace, 'src/sum.cjs'), 'utf8'))});console.log('PREVENTION_PROVED')`;
    const observation = await runProcess('/usr/bin/bwrap', sandboxArguments(fixture, ['src/sum.cjs'], code, dir), { cwd: fixture.workspace });
    const after = sha256(fs.readFileSync(sentinel));
    return { preventive: observation.exit_code === 0 && observation.stdout.includes('PREVENTION_PROVED') && before === after && fs.readdirSync(dir).length === 1, observation, before, after };
}
