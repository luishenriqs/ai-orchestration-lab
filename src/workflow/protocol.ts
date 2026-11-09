import { randomUUID } from 'node:crypto';
import { canonicalHash, canonicalize, parseCanonicalJson, sha256 } from '../contracts/integrity.js';
import { createP2Validator } from './validation.js';
import { LEDGER_GENESIS, type AgentMessageInput, type NormalizedAgentMessage } from './types.js';
const validator=createP2Validator();
export interface MessageHostMetadata {readonly sequence:number;readonly previous_event_hash:string;readonly observed_at:string;readonly correlation_id:string;readonly message_id?:string;}
export function normalizeAgentMessage(input:AgentMessageInput,host:MessageHostMetadata):NormalizedAgentMessage {
  if(input.source_event_id===null&&input.source_cursor===null) throw Error('STABLE_SOURCE_ID_REQUIRED');
  if(host.sequence<1||!Number.isSafeInteger(host.sequence)) throw Error('INVALID_SEQUENCE');
  const payload_sha256=sha256(canonicalize(input.payload));
  const body={protocol_version:'2.0-p2' as const,message_id:host.message_id??'msg-'+randomUUID(),workflow_id:input.workflow_id,invocation_id:input.invocation_id,correlation_id:host.correlation_id,reply_to_message_id:input.reply_to_message_id,source_event_id:input.source_event_id,source_cursor:input.source_cursor,sequence:host.sequence,message_type:input.message_type,payload:input.payload,payload_sha256,observed_at:host.observed_at,previous_event_hash:host.previous_event_hash};
  if(Buffer.byteLength(canonicalize(body),'utf8')>1024*1024) throw Error('MESSAGE_TOO_LARGE');
  const message={...body,event_hash:canonicalHash(body)};
  const result=validator.validate('AgentMessage',message);if(!result.valid)throw Error('INVALID_AGENT_MESSAGE:'+result.errors.map(e=>e.keyword).join(','));
  if(host.sequence===1&&message.previous_event_hash!==LEDGER_GENESIS)throw Error('INVALID_PREDECESSOR');
  if(host.sequence>1&&!/^[a-f0-9]{64}$/u.test(message.previous_event_hash))throw Error('INVALID_PREDECESSOR');
  return Object.freeze(message);
}
export function verifyNormalizedMessage(message:NormalizedAgentMessage):boolean {
  const {event_hash,...body}=message;
  return sha256(canonicalize(message.payload))===message.payload_sha256&&canonicalHash(body)===event_hash;
}
export function enforceOutputLimit(chunk:Uint8Array,currentBytes:number,limit=10*1024*1024):number {
  const next=currentBytes+chunk.byteLength;if(next>limit)throw Error('OUTPUT_LIMIT_EXCEEDED');return next;
}
export function parseCompleteUtf8JsonlLine(bytes:Uint8Array,maxBytes=10*1024*1024):unknown {
  if(bytes.byteLength===0||bytes.byteLength>maxBytes||bytes[bytes.byteLength-1]!==0x0a)throw Error('INCOMPLETE_OR_OVERSIZED_JSONL');
  let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw Error('INVALID_UTF8');}
  const line=text.slice(0,-1).replace(/\r$/u,'');if(!line.length)throw Error('EMPTY_JSONL_RECORD');
  try{return parseCanonicalJson(line);}catch{throw Error('INVALID_JSONL_RECORD');}
}
