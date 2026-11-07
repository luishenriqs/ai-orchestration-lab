import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const report=JSON.parse(fs.readFileSync(path.join(root,'docs/evidence/p1-simulation-report.json'),'utf8'));
if(report.results.length!==16||report.passed!==16||report.failed||report.blocked)throw Error('SIMULATION_NOT_COMPLETE');
let files=0;
for(const result of report.results){
  const dir=path.join(root,'docs/evidence/p1-execution/scenarios',report.run_id,result.identifier);
  const record=JSON.parse(fs.readFileSync(path.join(dir,'scenario-result.json'),'utf8'));
  if(record.status!=='PASS'||record.official_number!==result.official_number)throw Error('SCENARIO_RECORD_MISMATCH');
  for(const artifact of record.artifacts){
    const file=path.resolve(dir,artifact.path);if(!file.startsWith(dir+path.sep)||fs.lstatSync(file).isSymbolicLink())throw Error('ARTIFACT_ESCAPE');
    const digest=createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    if(digest!==artifact.sha256)throw Error(`ARTIFACT_HASH_MISMATCH ${result.identifier}/${artifact.path}`);files++;
  }
}
console.log(JSON.stringify({run_id:report.run_id,scenarios:16,artifacts_verified:files,status:'PASS'}));
