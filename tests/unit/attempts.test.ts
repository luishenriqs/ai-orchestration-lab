import { it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { AttemptStore, processIdentity, processAlive } from '../../src/execution/attempts.js';
import { createFixture, rollbackFixture, verifyFixture } from '../../src/execution/fixtures.js';
import { resolveWorkspaceRoot } from '../../src/contracts/schema-loader.js';
import { git } from '../../src/execution/host.js';
import type { ExecutionAttempt } from '../../src/contracts/types.js';
function setup() {
  const id='unit-'+randomUUID();const root=path.join(resolveWorkspaceRoot(),'runs',id);fs.mkdirSync(root,{recursive:true});
  const a: ExecutionAttempt={schema_version:'0.3-p0',execution_id:id,attempt_id:'A',approval_id:'SYN',approved_contract_sha256:'a'.repeat(64),executor:'synthetic',state:'CREATED',started_at:null,finished_at:null,base_commit:'b'.repeat(40),workspace_root:'/synthetic',process_identity:null,termination_reason:null};
  return {root,a,store:new AttemptStore(root)};
}
it('P1-004 persists CREATED, rejects duplicates and preserves immutable history through valid terminal states',()=>{
  for(const state of ['COMPLETED','FAILED','INTERRUPTED'] as const) {
    const {root,a,store}=setup(); store.create(a);assert.deepEqual(store.load(a.execution_id,'A'),a);assert.throws(()=>store.create(a));
    const proc=processIdentity(process.pid);assert.ok(proc);store.transition(a.execution_id,'A','RUNNING',null,proc);
    const result=store.transition(a.execution_id,'A',state,state==='COMPLETED'?'NORMAL':state==='FAILED'?'PROCESS_FAILURE':'INTERRUPTED');
    assert.equal(result.state,state);assert.ok(result.started_at);assert.ok(result.finished_at);
    assert.throws(()=>store.transition(a.execution_id,'A','RUNNING',null,proc));
    assert.equal(fs.readdirSync(path.join(root,a.execution_id,'attempts/A/events')).length,3);
  }
});
it('P1-004 rejects invalid transitions, reasons, traversal and inconsistent CREATED; blocks before start',()=>{
  const {a,store}=setup();store.create(a);assert.throws(()=>store.transition(a.execution_id,'A','COMPLETED','NORMAL'));
  assert.throws(()=>store.transition(a.execution_id,'A','RUNNING'));
  assert.throws(()=>store.load('../escape','A'));
  const blocked=store.transition(a.execution_id,'A','BLOCKED','AUTH_FAILURE');assert.equal(blocked.started_at,null);assert.ok(blocked.finished_at);
  assert.throws(()=>store.create({...a,attempt_id:'B',started_at:new Date().toISOString()}));
});
it('P1-004 reconciles orphan using real process token, preserves logs and reconstructs stale projection',()=>{
  const {root,a,store}=setup();store.create(a);const proc=processIdentity(process.pid);assert.ok(proc);assert.equal(processAlive(proc),true);
  store.transition(a.execution_id,'A','RUNNING',null,{...proc,process_start_token:'different-start'});
  const dir=path.join(root,a.execution_id,'attempts/A');fs.writeFileSync(path.join(dir,'partial.log'),'partial evidence');
  const projection=path.join(dir,'attempt.json');fs.writeFileSync(projection,JSON.stringify(a));
  assert.equal(new AttemptStore(root).load(a.execution_id,'A').state,'RUNNING');
  assert.equal(store.reconcile(a.execution_id,'A').state,'INTERRUPTED');assert.equal(store.reconcile(a.execution_id,'A').state,'INTERRUPTED');
  assert.equal(fs.readFileSync(path.join(dir,'partial.log'),'utf8'),'partial evidence');
  assert.equal(fs.readdirSync(path.join(root,a.execution_id,'attempts')).length,1);
});
it('P1-004 detects journal tampering and leaves genuinely active process RUNNING',()=>{
  const {root,a,store}=setup();store.create(a);store.transition(a.execution_id,'A','RUNNING',null,processIdentity(process.pid));
  assert.equal(store.reconcile(a.execution_id,'A').state,'RUNNING');
  const event=path.join(root,a.execution_id,'attempts/A/events/000000.json');const data=JSON.parse(fs.readFileSync(event,'utf8'));data.attempt.approval_id='forged';fs.writeFileSync(event,JSON.stringify(data));
  assert.throws(()=>store.load(a.execution_id,'A'));
});
it('P1-004 rollback verifies registration/base/path, archives partial state, restores only owned fixture',()=>{
  const {root,a}=setup();const fixture=createFixture(a.execution_id,'A');verifyFixture(fixture);
  fs.writeFileSync(path.join(fixture.workspace,'src/sum.cjs'),'partial');fs.writeFileSync(path.join(fixture.workspace,'new.txt'),'preserve me');
  assert.throws(()=>rollbackFixture({...fixture,workspace:resolveWorkspaceRoot()},root));
  assert.throws(()=>rollbackFixture({...fixture,base_commit:'f'.repeat(40)},root));
  rollbackFixture(fixture,root);assert.equal(git(fixture.workspace,['status','--porcelain']), '');
  assert.ok(fs.readdirSync(root).some(n=>n.startsWith('rollback-')));
  assert.ok(fs.existsSync(path.join(resolveWorkspaceRoot(),'README.md')));
});
