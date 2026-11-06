import fs from 'node:fs';
import type { TaskContract, ExecutionAttempt, EvidenceManifest, ReviewHandoffPackage } from '../contracts/types.js';
import { validateReviewHandoffPackage } from '../contracts/validator.js';
import { canonicalHash, sha256 } from '../contracts/integrity.js';
import type { Fixture } from '../execution/fixtures.js';
import { safePath, readJson, writeNew } from '../execution/host.js';
import { verifyEvidence } from './collector.js';
/** Explicit conservative patterns, not a guarantee of absence of sensitive data. */
export function secretPatterns(input:string):readonly string[]{
  const rules:[string,RegExp][]=[['PRIVATE_KEY',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['AWS_ACCESS_KEY',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],['TOKEN',/\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,})\b/],['SECRET_ASSIGNMENT',/(?:password|secret|token)\s*[=:]\s*["']?[A-Za-z0-9_+\/-]{16,}/i]];
  return rules.filter(([,pattern])=>pattern.test(input)).map(([name])=>name);
}
export function createHandoff(contract:TaskContract,attempt:ExecutionAttempt,manifest:EvidenceManifest,dir:string):ReviewHandoffPackage {
  const included=[...manifest.evidence_integrity.artifact_hashes,{path:'evidence-manifest.json',sha256:sha256(fs.readFileSync(safePath(dir,'evidence-manifest.json')))}];
  const secrets=included.flatMap(a=>secretPatterns(fs.readFileSync(safePath(dir,a.path),'utf8')));
  const h:ReviewHandoffPackage={schema_version:'0.3-p0',handoff_id:'HANDOFF-'+attempt.attempt_id,execution_id:contract.identity.execution_id,attempt_id:attempt.attempt_id,contract_sha256:canonicalHash(contract),diff_sha256:manifest.git.diff_sha256,workspace_context_id:contract.identity.workspace_context_id,data_classification:'SYNTHETIC_LAB',evidence_manifest_path:'evidence-manifest.json',included_artifacts:included,review_questions:contract.validation.acceptance_checks,sanitization_status:secrets.length?'BLOCKED':'APPROVED',export_authorization_ref:null};
  writeNew(safePath(dir,'review-handoff.json',false),h);return h;
}
export function verifyHandoff(fixture:Fixture,contract:TaskContract,attempt:ExecutionAttempt,manifest:EvidenceManifest,input:unknown,dir:string):readonly string[]{
  const parsed=validateReviewHandoffPackage(input);if(!parsed.valid)return ['INVALID_HANDOFF_SCHEMA'];const h=parsed.value;const reasons=[...verifyEvidence(fixture,contract,attempt,manifest,dir)];
  if(h.workspace_context_id!==contract.identity.workspace_context_id)reasons.push('HANDOFF_CONTEXT');
  if(h.execution_id!==contract.identity.execution_id||h.attempt_id!==attempt.attempt_id||h.contract_sha256!==canonicalHash(contract)||h.diff_sha256!==manifest.git.diff_sha256)reasons.push('HANDOFF_BINDING');
  if(h.data_classification!=='SYNTHETIC_LAB'||h.sanitization_status!=='APPROVED')reasons.push('HANDOFF_DATA_POLICY');
  try {
    if(canonicalHash(readJson(safePath(dir,h.evidence_manifest_path)))!==canonicalHash(manifest))reasons.push('HANDOFF_MANIFEST');
    const required=[...manifest.evidence_integrity.artifact_hashes.map(a=>a.path),h.evidence_manifest_path];
    if(new Set(h.included_artifacts.map(a=>a.path)).size!==h.included_artifacts.length||required.some(p=>!h.included_artifacts.some(a=>a.path===p)))reasons.push('HANDOFF_INCOMPLETE');
    for(const a of h.included_artifacts){const content=fs.readFileSync(safePath(dir,a.path));if(sha256(content)!==a.sha256)reasons.push('HANDOFF_ARTIFACT_INTEGRITY');if(secretPatterns(content.toString('utf8')).length)reasons.push('SECRET_DETECTED');}
    // Diff contains base64 copies of untracked/modified bytes; inspect decoded data too.
    const diff=readJson(safePath(dir,'diff.bundle.json')) as {changes:{content:string|null}[]};
    for(const change of diff.changes)if(change.content&&secretPatterns(Buffer.from(change.content,'base64').toString('utf8')).length)reasons.push('SECRET_DETECTED');
  }catch(error){reasons.push('HANDOFF_IO:'+(error instanceof Error?error.message:'unknown'));}
  return [...new Set(reasons)];
}
