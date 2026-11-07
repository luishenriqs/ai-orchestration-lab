import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TaskContract, ApprovalRecord, ExecutionAttempt, ExecutionResult, EvidenceManifest, ReviewHandoffPackage } from '../contracts/types.js';
import { canonicalHash } from '../contracts/integrity.js';
import { resolveWorkspaceRoot } from '../contracts/schema-loader.js';
import { taskReady, validationGate, persistDecision, type GateDecision, type ReadinessPolicy } from '../governance/gates.js';
import { collectEvidence, observeTest, snapshotTree } from '../evidence/collector.js';
import { createHandoff } from '../evidence/handoff.js';
import { AttemptStore, processIdentity, processAlive } from './attempts.js';
import { verifyFixture, type Fixture } from './fixtures.js';
import { executeSynthetic, type SyntheticScenario } from './synthetic.js';
import { safePath, readJson, writeNew } from './host.js';
export interface AttemptOutcome {readonly attempt:ExecutionAttempt;readonly readiness:GateDecision;readonly validation:GateDecision|null;readonly manifest:EvidenceManifest|null;readonly handoff:ReviewHandoffPackage|null;readonly result:ExecutionResult|null;readonly evidence_dir:string}
export async function serialExecution<T>(root:string,callback:()=>Promise<T>):Promise<T>{
  const lock=safePath(root,'.p1-execution-lock',false);
  if(fs.existsSync(lock)){
    const owner=readJson(lock) as {pid:number;process_start_token:string};
    if(processAlive(owner))throw Error('OPERATIONAL_CONFLICT');
    fs.renameSync(lock,lock+'.abandoned-'+randomUUID());
  }
  const own=processIdentity(process.pid);if(!own)throw Error('HOST_IDENTITY_UNAVAILABLE');writeNew(lock,own);
  try{return await callback();}finally{fs.unlinkSync(lock);}
}
export async function executeAttempt(fixture:Fixture,contract:TaskContract,approval:ApprovalRecord|null,policy:ReadinessPolicy,scenario:SyntheticScenario):Promise<AttemptOutcome>{
  const lab=resolveWorkspaceRoot();const runs=path.join(lab,'runs');
  return serialExecution(runs,async()=>{
    verifyFixture(fixture);const store=new AttemptStore(runs);
    const initial:ExecutionAttempt={schema_version:'0.3-p0',execution_id:fixture.execution_id,attempt_id:fixture.attempt_id,approval_id:approval?.approval_id??'MISSING',approved_contract_sha256:canonicalHash(contract),executor:'synthetic',state:'CREATED',started_at:null,finished_at:null,base_commit:fixture.base_commit,workspace_root:fixture.workspace,process_identity:null,termination_reason:null};
    store.create(initial);const dir=safePath(runs,`${fixture.execution_id}/attempts/${fixture.attempt_id}`);
    writeNew(path.join(dir,'contract.json'),contract);writeNew(path.join(dir,'approval.json'),approval);writeNew(path.join(dir,'host-policy.json'),policy);
    const readiness=await taskReady(fixture,contract,approval,initial,policy,dir);persistDecision(dir,'task-ready',readiness);
    if(!readiness.allowed){const attempt=store.transition(fixture.execution_id,fixture.attempt_id,'BLOCKED','AUTH_FAILURE');return {attempt,readiness,validation:null,manifest:null,handoff:null,result:null,evidence_dir:dir};}
    const red=await observeTest(fixture,dir,'red');
    if(red.observed_outcome!=='FAIL'){
      const attempt=store.transition(fixture.execution_id,fixture.attempt_id,'BLOCKED','PROCESS_FAILURE');
      const denied:GateDecision={...readiness,gate:'ValidationGate',allowed:false,reasons:['INVALID_RED'],decided_at:new Date().toISOString()};persistDecision(dir,'validation-gate',denied);
      return {attempt,readiness,validation:denied,manifest:null,handoff:null,result:null,evidence_dir:dir};
    }
    const protectedDirs=['contracts','approvals','schemas','reviews','src','dist/src'];
    const before=protectedDirs.map(p=>({path:p,digest:snapshotTree(path.join(lab,p))}));
    const observation=await executeSynthetic(fixture,scenario,{timeout_ms:contract.execution.timeout_seconds*1000,onStart:identity=>{store.transition(fixture.execution_id,fixture.attempt_id,'RUNNING',null,identity);}});
    writeNew(path.join(dir,'executor-observation.json'),observation);
    const after=protectedDirs.map(p=>({path:p,digest:snapshotTree(path.join(lab,p))}));const intact=canonicalHash(before)===canonicalHash(after);writeNew(path.join(dir,'governance-integrity.json'),{before,after,intact});
    let current=store.load(fixture.execution_id,fixture.attempt_id);
    if(current.state==='CREATED') current=store.transition(fixture.execution_id,fixture.attempt_id,'BLOCKED','PROCESS_FAILURE');
    else current=store.transition(fixture.execution_id,fixture.attempt_id,observation.termination_reason==='INTERRUPTED'?'INTERRUPTED':observation.exit_code===0&&intact?'COMPLETED':'FAILED',!intact?'SCOPE_VIOLATION':observation.termination_reason);
    const result:ExecutionResult={schema_version:'0.3-p0',execution_id:fixture.execution_id,attempt_id:fixture.attempt_id,executor:'synthetic',agent_declared_outcome:observation.stdout.includes('completed')?'completed':'failed',agent_summary:observation.stdout.trim()||'Synthetic executor produced no success declaration',agent_reported_blockers:[]};writeNew(path.join(dir,'execution-result.json'),result);
    const green=current.state==='COMPLETED'?await observeTest(fixture,dir,'green'):null;
    const manifest=collectEvidence(fixture,contract,current,dir,red,green);const handoff=createHandoff(contract,current,manifest,dir);
    const validation=validationGate(fixture,contract,current,manifest,result,dir,handoff);persistDecision(dir,'validation-gate',validation);
    return {attempt:current,readiness,validation,manifest,handoff,result,evidence_dir:dir};
  });
}
