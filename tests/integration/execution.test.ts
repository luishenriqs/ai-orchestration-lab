import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createFixture, RED_TEST } from '../../src/execution/fixtures.js';
import { executeSynthetic, runFixtureTest, probeIsolation, SYNTHETIC_SCENARIOS, sandboxArguments } from '../../src/execution/synthetic.js';
import { runProcess } from '../../src/execution/process.js';
import { processAlive } from '../../src/execution/attempts.js';
function fixture(){return createFixture('exec-'+randomUUID(),'A');}
it('P1-005 preventive isolation denies protected write/chmod/creation/removal and preserves sentinel',async()=>{
  const f=fixture();const probe=await probeIsolation(f);assert.equal(probe.preventive,true);assert.equal(probe.before,probe.after);assert.match(probe.observation.stdout,/PREVENTION_PROVED/);
  assert.throws(()=>sandboxArguments(f,['../escape'],'0'));
  assert.throws(()=>sandboxArguments(f,['.git/config'],'0'));
  assert.throws(()=>sandboxArguments(f,['tests/sum.cjs'],'0'));
});
it('P1-005 RED assertion is legitimate, separate GREEN invocation preserves test bytes',async()=>{
  const f=fixture();const before=fs.readFileSync(path.join(f.workspace,'tests/sum.cjs'),'utf8');assert.equal(before,RED_TEST);
  const red=await runFixtureTest(f);assert.equal(red.exit_code,1);assert.match(red.stderr,/SYN_EXPECT_SUM_3/);
  assert.equal((await executeSynthetic(f,'SYN-001')).exit_code,0);
  const green=await runFixtureTest(f);assert.equal(green.exit_code,0);assert.match(green.stdout,/SYN_TEST_PASS/);
  assert.equal(fs.readFileSync(path.join(f.workspace,'tests/sum.cjs'),'utf8'),before);
});
it('P1-005 all ten synthetic behaviors run in exclusive fixtures; negative operations prevented',async()=>{
  for(const scenario of SYNTHETIC_SCENARIOS) {
    const f=fixture();const observation=await executeSynthetic(f,scenario);
    if(scenario==='SYN-002') {assert.equal(observation.exit_code,2);assert.match(fs.readFileSync(path.join(f.workspace,'src/sum.cjs'),'utf8'),/partial/);}
    else if(scenario==='SYN-003') assert.equal(observation.termination_reason,'TIMEOUT');
    else if(scenario==='SYN-006') assert.equal(observation.termination_reason,'INTERRUPTED');
    else if(['SYN-004','SYN-007','SYN-008','SYN-010'].includes(scenario)) assert.notEqual(observation.exit_code,0);
    else assert.equal(observation.exit_code,0);
    assert.equal(fs.readFileSync(path.join(f.workspace,'protected.txt'),'utf8'),'SYNTHETIC_PROTECTED\n');
  }
});
it('P1-005 process failure, ENOENT, bounded output and timeout/interruption reap process groups',async()=>{
  const options={cwd:process.cwd(),timeout_ms:1000};
  const fail=await runProcess(process.execPath,['-e','process.exit(7)'],options);assert.equal(fail.exit_code,7);assert.equal(fail.termination_reason,'PROCESS_FAILURE');
  assert.equal((await runProcess('/nonexistent/p1-binary',[],options)).termination_reason,'PROCESS_FAILURE');
  const output=await runProcess(process.execPath,['-e',"process.stdout.write('x'.repeat(2*1024*1024))"],options);assert.equal(Buffer.byteLength(output.stdout),1024*1024);assert.equal(output.truncated,true);
  for(const interrupt of [false,true]) {
    const result=await runProcess(process.execPath,['-e',"require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'});setInterval(()=>{},1000)"],{...options,...(interrupt?{interrupt_after_ms:80}:{timeout_ms:80})});
    assert.equal(result.termination_reason,interrupt?'INTERRUPTED':'TIMEOUT');assert.ok(result.process_identity);assert.equal(processAlive(result.process_identity),false);
  }
});
