import { canonicalHash } from '../contracts/integrity.js';
import { validateApprovalRecord, validateTaskContract } from '../contracts/validator.js';
import { verifyApproval, type TrustedApproval } from '../governance/approval.js';
import type { ApprovalRecord, TaskContract } from '../contracts/types.js';
import type { GateDecision } from '../governance/gates.js';
import type { AgentIdentity, LedgerEvent, SandboxValidationRecord, WorkflowAuthorizationRecord } from './types.js';
import type { AuthorizationProof, GateProof } from './machine.js';
import { createP2Validator } from './validation.js';
const validator=createP2Validator();
const P2_INITIAL_AGENT_PRODUCTS=new Set(['codex','gemini','antigravity']);
const P2_ALLOWED_OPERATIONS=new Set(['READ','WRITE','TEST','LOCAL_COMMIT']);

export interface AuthorizationBinding {readonly workflow_id:string;readonly contract_sha256:string;readonly repository:string;readonly baseline_git:string;readonly worktree:string;}
function pathSegments(value:string):string[]|null {
  if(!value||value.startsWith('/')||value.includes('\\')||value.includes('\0')||/^[A-Za-z]:/u.test(value))return null;
  const parts=value.split('/');if(parts.some(p=>!p||p==='.'||p==='..'||p.toLowerCase()==='.git'))return null;return parts;
}
function withinPath(path:string,base:string):boolean{return path===base||path.startsWith(base.endsWith('/')?base:base+'/');}
function pathsIntersect(a:string,b:string):boolean{return withinPath(a,b)||withinPath(b,a);}
export function validateAuthorizedPaths(paths:readonly string[],contractPaths:readonly string[],forbiddenChanges:readonly string[]):readonly string[] {
  const reasons:string[]=[];
  for(const path of paths){
    if(!pathSegments(path)){reasons.push('PATH_INVALID');continue;}
    if(contractPaths.length&&!contractPaths.some(base=>!!pathSegments(base)&&withinPath(path,base)))reasons.push('AUTHORIZATION_PATH_AMPLIFICATION');
    if(forbiddenChanges.some(forbidden=>pathsIntersect(path,forbidden)))reasons.push('FORBIDDEN_CHANGE_PATH');
  }
  return Object.freeze([...new Set(reasons)]);
}
export function canonicalAgentAuthorizationId(identity:AgentIdentity):string {
  if(identity.status!=='VERIFIED'||!P2_INITIAL_AGENT_PRODUCTS.has(identity.product.toLowerCase())||![identity.provider_id,identity.product,identity.canonical_model_id,identity.version??'unknown'].every(v=>/^[A-Za-z0-9._-]+$/.test(v)))throw Error('AGENT_IDENTITY_NOT_VERIFIED');
  return [identity.provider_id,identity.product,identity.canonical_model_id,identity.version??'unknown'].join('/');
}
export function authorizeWorkflow(record:WorkflowAuthorizationRecord,approval:ApprovalRecord,contract:TaskContract,trusted:readonly TrustedApproval[]):{readonly allowed:boolean;readonly reasons:readonly string[]} {
  const reasons:string[]=[];
  if(!validator.validate('WorkflowAuthorization',record).valid)reasons.push('INVALID_WORKFLOW_AUTHORIZATION');
  if(!validateApprovalRecord(approval).valid||!validateTaskContract(contract).valid) reasons.push('P1_APPROVAL_OR_CONTRACT_INVALID');
  if(record.approval_record_sha256!==canonicalHash(approval))reasons.push('APPROVAL_HASH_MISMATCH');
  if(record.contract_sha256!==canonicalHash(contract))reasons.push('CONTRACT_HASH_MISMATCH');
  if(record.workflow_id!==contract.identity.execution_id)reasons.push('WORKFLOW_BINDING_MISMATCH');
  if(record.repository!==contract.identity.repository||record.baseline_git!==contract.identity.base_commit||record.worktree!==contract.identity.workspace_root)reasons.push('REPOSITORY_BASELINE_OR_WORKTREE_MISMATCH');
  const contractPaths=[...contract.scope.allowed_impl_paths,...contract.scope.allowed_test_paths];
  reasons.push(...validateAuthorizedPaths(record.allowed_paths,contractPaths,contract.scope.forbidden_changes));
  if(record.network_policy!=='DENY')reasons.push('NETWORK_POLICY_NOT_ENFORCEABLE_IN_P2_001');
  if(record.allowed_operations.some(operation=>!P2_ALLOWED_OPERATIONS.has(operation)))reasons.push('OPERATION_NOT_IN_P2_POLICY');
  if(record.allowed_agents.some(agent=>{const parts=agent.split('/');return parts.length!==4||!P2_INITIAL_AGENT_PRODUCTS.has(parts[1]!.toLowerCase());}))reasons.push('AGENT_NOT_IN_P2_POLICY');
  reasons.push(...verifyApproval(contract,approval,{scope:'EXECUTION',trusted}).reasons);
  return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze([...new Set(reasons)])});
}
export function createAuthorizationProof(record:WorkflowAuthorizationRecord,approval:ApprovalRecord,contract:TaskContract,trusted:readonly TrustedApproval[],verifiedAt:string,authority:'P1_TRUSTED_APPROVAL'|'SIMULATED_HOST'='P1_TRUSTED_APPROVAL'):AuthorizationProof {
  const decision=authorizeWorkflow(record,approval,contract,trusted);if(!decision.allowed)throw Error('AUTHORIZATION_REJECTED:'+decision.reasons.join(','));
  if(record.revoked_at!==null||Date.parse(record.expires_at)<=Date.parse(verifiedAt))throw Error('AUTHORIZATION_EXPIRED_OR_REVOKED');
  return Object.freeze({authorization_id:record.authorization_id,workflow_id:record.workflow_id,contract_sha256:record.contract_sha256,verified:true,verified_at:verifiedAt,expires_at:record.expires_at,revoked:false,authority});
}
export function createGateProof(gate:GateProof['gate'],workflowId:string,contractHash:string,decision:Pick<GateDecision,'allowed'|'contract_sha256'>,decidedAt:string,authority:'HOST'|'SIMULATED_HOST'='HOST'):GateProof {
  if(!decision.allowed||decision.contract_sha256!==contractHash||!/^[a-f0-9]{64}$/.test(contractHash)||!Number.isFinite(Date.parse(decidedAt)))throw Error('GATE_PROOF_REJECTED');
  return Object.freeze({gate,workflow_id:workflowId,contract_sha256:contractHash,allowed:true,decided_at:decidedAt,authority});
}
export function checkAuthorization(record:WorkflowAuthorizationRecord,binding:AuthorizationBinding,now:string,operation:string,agent:AgentIdentity,path?:string,forbiddenChanges:readonly string[]=[]):{readonly allowed:boolean;readonly reasons:readonly string[]} {
  const reasons:string[]=[];
  if(!validator.validate('WorkflowAuthorization',record).valid)reasons.push('INVALID_WORKFLOW_AUTHORIZATION');
  if(record.workflow_id!==binding.workflow_id||record.contract_sha256!==binding.contract_sha256||record.repository!==binding.repository||record.baseline_git!==binding.baseline_git||record.worktree!==binding.worktree)reasons.push('AUTHORIZATION_BINDING_CHANGED');
  if(record.revoked_at!==null)reasons.push('AUTHORIZATION_REVOKED');
  if(Date.parse(record.expires_at)<=Date.parse(now))reasons.push('AUTHORIZATION_EXPIRED');
  if(!record.allowed_operations.includes(operation))reasons.push('OPERATION_OUT_OF_SCOPE');
  reasons.push(...validateAuthorizedPaths(record.allowed_paths,[],forbiddenChanges));
  let agentKey:string|null=null;try{agentKey=canonicalAgentAuthorizationId(agent);}catch{reasons.push('AGENT_IDENTITY_UNVERIFIED');}
  if(agentKey===null||!record.allowed_agents.includes(agentKey))reasons.push('AGENT_OUT_OF_SCOPE');
  if(['WRITE','LOCAL_COMMIT'].includes(operation)&&path===undefined)reasons.push('TARGET_PATH_REQUIRED');
  if(path!==undefined){if(!pathSegments(path))reasons.push('PATH_INVALID');else if(!record.allowed_paths.some(p=>!!pathSegments(p)&&withinPath(path,p)))reasons.push('PATH_OUT_OF_SCOPE');if(forbiddenChanges.some(p=>pathsIntersect(path,p)))reasons.push('FORBIDDEN_CHANGE_PATH');}
  return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze(reasons)});
}
export interface ModelCatalogEntry {readonly provider_id:string;readonly product:string;readonly canonical_model_id:string;readonly aliases:readonly string[];readonly version:string|null;}
export interface ModelCatalog {readonly schema_version:'2.0-p2';readonly version:string;readonly source:string;readonly entries:readonly ModelCatalogEntry[];readonly catalog_hash:string;}
export function createModelCatalog(version:string,source:string,entries:readonly ModelCatalogEntry[]):ModelCatalog {
  const seenModels=new Set<string>(),seenAliases=new Set<string>();
  if(!version||!source||!entries.length)throw Error('MODEL_CATALOG_INVALID');
  for(const entry of entries){
    const key=entry.provider_id+'\0'+entry.product+'\0'+entry.canonical_model_id;
    if(!entry.provider_id||!entry.product||!entry.canonical_model_id||seenModels.has(key))throw Error('MODEL_CATALOG_INVALID');seenModels.add(key);
    for(const alias of [entry.canonical_model_id,...entry.aliases]){const aliasKey=entry.provider_id+'\0'+entry.product+'\0'+alias;if(seenAliases.has(aliasKey))throw Error('MODEL_CATALOG_ALIAS_CONFLICT');seenAliases.add(aliasKey);}
  }
  const body={schema_version:'2.0-p2' as const,version,source,entries};return Object.freeze({...body,catalog_hash:canonicalHash(body)});
}
export function resolveIdentity(declared:AgentIdentity,catalog:ModelCatalog,observed:{provider_id:string;product:string;model:string|null;version:string|null}|null):AgentIdentity {
  const {catalog_hash,...catalogBody}=catalog;
  if(canonicalHash(catalogBody)!==catalog_hash)return Object.freeze({...declared,status:'UNKNOWN',catalog_hash});
  const entry=catalog.entries.find(x=>x.provider_id===declared.provider_id&&x.product===declared.product&&(x.canonical_model_id===declared.canonical_model_id||x.aliases.includes(declared.canonical_model_id)));
  if(!entry||!observed)return Object.freeze({...declared,status:'UNKNOWN',catalog_hash});
  const observedEntry=catalog.entries.find(x=>x.provider_id===observed.provider_id&&x.product===observed.product&&(x.canonical_model_id===observed.model||x.aliases.includes(observed.model??'')));
  if(!observedEntry||observedEntry.canonical_model_id!==entry.canonical_model_id||observed.provider_id!==entry.provider_id||observed.product!==entry.product||observed.version!==entry.version||declared.version!==entry.version)return Object.freeze({...declared,status:'UNKNOWN',catalog_hash});
  return Object.freeze({...declared,canonical_model_id:entry.canonical_model_id,status:'VERIFIED',catalog_hash});
}
export function evaluateIndependentReview(author:AgentIdentity,reviewer:AgentIdentity,relation:{readonly reviewerInvocationId:string;readonly artifactAuthorInvocationIds:readonly string[]}):{readonly allowed:boolean;readonly reasons:readonly string[]} {
  const reasons:string[]=[];if(author.status!=='VERIFIED'||reviewer.status!=='VERIFIED')reasons.push('IDENTITY_UNVERIFIED');
  if(!relation.reviewerInvocationId||relation.artifactAuthorInvocationIds.includes(relation.reviewerInvocationId))reasons.push('REVIEWER_AUTHORED_ARTIFACT');
  if(author.status==='VERIFIED'&&reviewer.status==='VERIFIED'&&author.provider_id===reviewer.provider_id&&author.canonical_model_id===reviewer.canonical_model_id)reasons.push('REVIEW_NOT_INDEPENDENT');
  return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze(reasons)});
}
export function evaluateIndependentReviewFromLedger(author:AgentIdentity,reviewer:AgentIdentity,events:readonly LedgerEvent[],artifactHash:string,reviewerInvocationId:string):{readonly allowed:boolean;readonly reasons:readonly string[]} {
  const authors=events.filter(e=>e.event_type==='ARTIFACT_AUTHORED'&&(e.payload as {artifact_sha256?:string}).artifact_sha256===artifactHash).map(e=>(e.payload as {invocation_id:string}).invocation_id);
  const reviewRecorded=events.some(e=>e.event_type==='ARTIFACT_REVIEWED'&&(e.payload as {artifact_sha256?:string;invocation_id?:string}).artifact_sha256===artifactHash&&(e.payload as {invocation_id?:string}).invocation_id===reviewerInvocationId);
  const result=evaluateIndependentReview(author,reviewer,{reviewerInvocationId,artifactAuthorInvocationIds:authors});
  const reasons=[...result.reasons];if(!reviewRecorded)reasons.push('REVIEW_NOT_RECORDED_IN_LEDGER');
  return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze(reasons)});
}
export function evaluateSandboxProof(record:SandboxValidationRecord|null,expected:{readonly provider_id:string;readonly product:string;readonly version:string;readonly configuration_hash:string;readonly profile_hash:string;readonly permissions_hash:string;readonly evidence_hash:string},now:string):{readonly allowed:boolean;readonly reasons:readonly string[]} {
  if(!record)return {allowed:false,reasons:['SANDBOX_PROOF_MISSING']};
  const reasons:string[]=[];
  if(!validator.validate('SandboxValidationRecord',record).valid)reasons.push('SANDBOX_PROOF_SCHEMA_INVALID');
  for(const key of ['provider_id','product','version','configuration_hash','profile_hash','permissions_hash','evidence_hash'] as const)if(record[key]!==expected[key])reasons.push('SANDBOX_PROOF_BINDING_MISMATCH:'+key);
  if(record.status!=='VALID'||Date.parse(record.valid_until)<=Date.parse(now)||Date.parse(record.validated_at)>Date.parse(now))reasons.push('SANDBOX_PROOF_INVALID_OR_EXPIRED');
  return Object.freeze({allowed:reasons.length===0,reasons:Object.freeze(reasons)});
}
