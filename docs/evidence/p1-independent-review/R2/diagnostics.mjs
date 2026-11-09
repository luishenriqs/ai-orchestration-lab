import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const root='/home/luishenriqs/projects/ai-orchestration-lab';
const imp=p=>import(root+'/dist/src/'+p+'.js');
const {createFixture}=await imp('execution/fixtures');
const {executeAttempt}=await imp('execution/adapter');
const {syntheticContract,syntheticApproval,syntheticReview,runScenario}=await imp('scenarios/p1');
const {trustApproval}=await imp('governance/approval');
const {canonicalHash,sha256}=await imp('contracts/integrity');
const {validationGate,prGate}=await imp('governance/gates');
const {observeTest}=await imp('evidence/collector');
const {parseAndValidateContract}=await imp('contracts/validator');
const out=path.join(root,'docs/evidence/p1-independent-review/R2');
const records=[];
function record(name,value){records.push({name,...value});}
const f=createFixture('independent-r2-'+randomUUID(),'A');
const c=syntheticContract(f.workspace,f.base_commit,f.execution_id),ap=syntheticApproval(c);
const policy={trusted:[trustApproval(ap)],environment_authorized:true,data_classification:'SYNTHETIC_LAB',required_dependencies:[],completed_dependencies:[],conflict:false};
const o=await executeAttempt(f,c,ap,policy,'SYN-001');
const gate=(a=o.attempt,r=o.result,m=o.manifest)=>validationGate(f,c,a,m,r,o.evidence_dir,o.handoff);
assert.equal(gate().allowed,true);record('persisted-positive',gate());
for(const patch of [{execution_id:'UNRELATED'},{approval_id:'NONEXISTENT'},{executor:'codex'},{process_identity:{pid:1,process_start_token:'FAKE'}},{started_at:'2000-01-01T00:00:00Z'},{finished_at:'2099-01-01T00:00:00Z'}]){
 const a={...o.attempt,...patch};const v=gate(a,{...o.result,execution_id:a.execution_id,executor:a.executor});assert.equal(v.allowed,false);record('forged-attempt-'+Object.keys(patch)[0],v);
}
for(const file of ['task-ready.json','approval.json','host-policy.json','contract.json','events/000002.json']){
 const p=path.join(o.evidence_dir,file),bytes=fs.readFileSync(p);fs.renameSync(p,p+'.r2-backup');
 try{const v=gate();assert.equal(v.allowed,false);record('missing-'+file,v);}finally{fs.renameSync(p+'.r2-backup',p);}
}
for(const [file,change] of [['task-ready.json',x=>({...x,allowed:false})],['task-ready.json',x=>({...x,attempt_id:'OTHER'})],['approval.json',x=>({...x,authorized_by:'FORGED'})],['host-policy.json',x=>({...x,trusted:[]})],['executor-observation.json',x=>({...x,process_identity:{pid:1,process_start_token:'FAKE'}})]]){
 const p=path.join(o.evidence_dir,file),bytes=fs.readFileSync(p);fs.writeFileSync(p,JSON.stringify(change(JSON.parse(bytes))));
 try{const v=gate();assert.equal(v.allowed,false);record('tampered-'+file,v);}finally{fs.writeFileSync(p,bytes);}
}
const sourcePath=path.join(f.workspace,'src/sum.cjs'),source=fs.readFileSync(sourcePath);
const malicious=["console.log('SYN_TEST_PASS');process.exit(0);module.exports=()=>999;","require('node:assert/strict').equal=()=>{};module.exports=()=>999;","console.log('SYN_EXPECT_SUM_3');process.exit(1)",source.toString()+'console.log("SYN_TEST_PASS");'];
for(const [i,payload] of malicious.entries()){
 fs.writeFileSync(sourcePath,payload);
 try{
  const dir=path.join(root,'runs',f.execution_id,'r2-spoof-'+i);fs.mkdirSync(dir);
  const test=await observeTest(f,dir,'green');assert.equal(test.observed_outcome,'ERROR');const observation=JSON.parse(fs.readFileSync(path.join(dir,'green.json'))).observation;assert.match(observation.stderr,/UNSUPPORTED_SYNTHETIC_SOURCE/);assert.equal(observation.stdout,'');
  const v=gate();assert.equal(v.allowed,false);record('unknown-source-'+i,{test,gate:v});
 }finally{fs.writeFileSync(sourcePath,source);}
}
for(const severity of ['HIGH','CRITICAL','MEDIUM','LOW'])for(const blocking of [false,true]){
 const review=syntheticReview(c,o);review.verdict='APPROVED_WITH_RECOMMENDATIONS';review.findings=[{finding_id:'R2',severity,category:review.categories_evaluated[0].category,evidence:'Synthetic diagnostic',source_reference:'fixture',recommendation:'Fix',blocking}];
 const merge=syntheticApproval(c,{approval_scope:'MERGE',attempt_id:'A',approved_diff_sha256:o.manifest.git.diff_sha256,review_id:review.review_id});
 const v=prGate(f,c,o.attempt,o.manifest,o.result,o.handoff,review,merge,o.evidence_dir,{trusted_approvals:[trustApproval(merge)],trusted_review_sha256:[canonicalHash(review)],rollback_evaluated:true,risks_treated:true});
 assert.equal(v.allowed,!blocking&&!['HIGH','CRITICAL'].includes(severity));record('review-'+severity+'-'+blocking,v);
}
const raw=JSON.stringify(c),duplicates=[raw.replace('"contract_revision":1','"contract_revision":666,"contract_revision":1'),raw.replace('"contract_revision":1','"contract_\\u0072evision":666,"contract_revision":1'),raw.replace('"execution_id":','"execution_id":"OTHER","execution_id":')];
for(const [i,d] of duplicates.entries()){const v=parseAndValidateContract('TaskContract',d);assert.equal(v.valid,false);record('duplicate-'+i,{valid:v.valid,errors:v.errors});}
assert.equal(parseAndValidateContract('TaskContract',raw).valid,true);
assert.equal(gate().allowed,true);record('restored-positive',gate());
const empty=createFixture('independent-r2-nojournal-'+randomUUID(),'A'),ec=syntheticContract(empty.workspace,empty.base_commit,empty.execution_id);
const a={...o.attempt,execution_id:empty.execution_id,workspace_root:empty.workspace,base_commit:empty.base_commit,approved_contract_sha256:canonicalHash(ec)};
const noJournal=validationGate(empty,ec,a,{...o.manifest,execution_id:empty.execution_id},{...o.result,execution_id:empty.execution_id},o.evidence_dir);assert.equal(noJournal.allowed,false);record('no-journal',noJournal);
fs.writeFileSync(path.join(out,'diagnostics.json'),JSON.stringify({records,controlled_fixture:f,evidence_dir:o.evidence_dir},null,2)+'\n');
console.log(JSON.stringify({diagnostics:records.length,status:'PASS'}));
const scenarioRoot=path.join(out,'scenarios');fs.mkdirSync(scenarioRoot);
const results=[];for(let n=1;n<=16;n++)results.push(await runScenario(n,scenarioRoot));
let hashes=0;for(const r of results){assert.equal(r.status,'PASS');for(const a of r.artifacts){assert.equal(sha256(fs.readFileSync(path.join(r.evidence_directory,a.path))),a.sha256);hashes++;}}
fs.writeFileSync(path.join(out,'scenarios.json'),JSON.stringify({results,hashes_verified:hashes},null,2)+'\n');
console.log(JSON.stringify({scenarios:results.map(r=>({number:r.official_number,status:r.status})),hashes_verified:hashes}));
const hashResults=[];
for(const p of ['docs/evidence/p1-execution/scenarios/run-ddff974f-f26e-4639-9c20-88c565f86da7/report.json','docs/evidence/p1-execution/scenarios/run-1a1b9b49-0474-40d6-a003-bae14371bcb9/report.json']){
 const report=JSON.parse(fs.readFileSync(path.join(root,p)));let count=0;for(const r of report.results){const dir=path.join(root,path.dirname(p),r.identifier);const record=JSON.parse(fs.readFileSync(path.join(dir,'scenario-result.json')));for(const a of record.artifacts){assert.equal(sha256(fs.readFileSync(path.join(dir,a.path))),a.sha256);count++;}}hashResults.push({report:p,artifacts_verified:count});
}
const inventory=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/p1-corrections/corrected-file-hashes.json')));for(const a of inventory.files)assert.equal(sha256(fs.readFileSync(path.join(root,a.path))),a.sha256);
hashResults.push({inventory:'corrected-file-hashes.json',files:inventory.files.length});
fs.writeFileSync(path.join(out,'hash-verification.json'),JSON.stringify(hashResults,null,2)+'\n');console.log(JSON.stringify(hashResults));
