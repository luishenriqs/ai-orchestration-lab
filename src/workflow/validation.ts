import fs from 'node:fs';
import path from 'node:path';
import { Ajv2020, type ErrorObject, type ValidateFunction } from 'ajv/dist/2020.js';
import addFormatsPlugin from 'ajv-formats';
import { parseCanonicalJson } from '../contracts/integrity.js';
import { resolveSchemasDir } from '../contracts/schema-loader.js';
import { P2_CONTRACT_TYPES, type P2ContractType } from './types.js';
import type { ExecutionAttempt } from '../contracts/types.js';

const FILES: Readonly<Record<P2ContractType, string>> = Object.freeze({
  Workflow:'p2-workflow.schema.json', AgentInvocation:'p2-agent-invocation.schema.json',
  AgentMessage:'p2-agent-message.schema.json', AgentCapability:'p2-agent-capability.schema.json',
  WorkflowAuthorization:'p2-workflow-authorization.schema.json', EffectRecord:'p2-effect-record.schema.json',
  SandboxValidationRecord:'p2-sandbox-validation-record.schema.json',
});
export interface P2Diagnostic { readonly contract_type:P2ContractType; readonly path:string; readonly keyword:string; readonly message:string; }
export interface P2ValidationResult<T=unknown> { readonly valid:boolean; readonly contract_type:P2ContractType; readonly value?:T; readonly errors:readonly P2Diagnostic[]; }
export interface P2Validator { validate<T=unknown>(type:P2ContractType, input:unknown):P2ValidationResult<T>; parseAndValidate<T=unknown>(type:P2ContractType, text:string):P2ValidationResult<T>; }
export function createP2Validator(schemaDir?:string):P2Validator {
  const base=schemaDir ?? resolveSchemasDir();
  const ajv=new Ajv2020({strict:true,allErrors:true,coerceTypes:false,useDefaults:false,removeAdditional:false});
  const addFormats=addFormatsPlugin.default ?? addFormatsPlugin; addFormats(ajv);
  const validators={} as Record<P2ContractType,ValidateFunction>;
  for(const type of P2_CONTRACT_TYPES){
    const file=path.join(base,FILES[type]); if(!fs.existsSync(file)) throw Error('P2_SCHEMA_MISSING:'+type);
    const schema=JSON.parse(fs.readFileSync(file,'utf8')) as object; validators[type]=ajv.compile(schema);
  }
  const validate=<T=unknown>(type:P2ContractType,input:unknown):P2ValidationResult<T>=>{
    const fn=validators[type]; if(!fn) return {valid:false,contract_type:type,errors:[{contract_type:type,path:'',keyword:'unknown-contract',message:'Unknown contract'}]};
    if(fn(input)) return {valid:true,contract_type:type,value:input as T,errors:[]};
    return {valid:false,contract_type:type,errors:(fn.errors ?? []).map((e:ErrorObject)=>({contract_type:type,path:e.instancePath,keyword:e.keyword,message:e.message ?? 'Invalid value'}))};
  };
  const parseAndValidate=<T=unknown>(type:P2ContractType,text:string):P2ValidationResult<T>=>{try{return validate(type,parseCanonicalJson(text));}catch(e){return {valid:false,contract_type:type,errors:[{contract_type:type,path:'',keyword:'json-parse',message:e instanceof Error?e.message:'Invalid JSON'}]};}};
  return Object.freeze({validate,parseAndValidate});
}
export function validateP2Relationships(workflow:unknown, invocation:unknown, message:unknown):readonly string[] {
  const errors:string[]=[];
  const w=workflow as Record<string,unknown>, i=invocation as Record<string,unknown>, m=message as Record<string,unknown>;
  if(!w || !i || !m || i.workflow_id!==w.workflow_id || m.workflow_id!==w.workflow_id || m.invocation_id!==i.invocation_id) errors.push('RELATIONSHIP_ID_MISMATCH');
  if(w?.active_invocation_id!==null && w?.active_invocation_id!==i?.invocation_id) errors.push('ACTIVE_INVOCATION_MISMATCH');
  return Object.freeze(errors);
}
export function validateInvocationAttemptRelationship(invocation:{readonly workflow_id:string;readonly invocation_id:string;readonly execution_attempt_id:string|null},attempt:ExecutionAttempt|null):readonly string[] {
  if(invocation.execution_attempt_id===null)return attempt===null?Object.freeze([]):Object.freeze(['UNLINKED_ATTEMPT_PROVIDED']);
  if(!attempt||attempt.attempt_id!==invocation.execution_attempt_id||attempt.execution_id!==invocation.workflow_id)return Object.freeze(['INVOCATION_ATTEMPT_BINDING_MISMATCH']);
  return Object.freeze([]);
}
