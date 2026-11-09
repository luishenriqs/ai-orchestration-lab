import { randomUUID } from 'node:crypto';
import { canonicalHash } from '../contracts/integrity.js';
import type { EffectRecord } from './types.js';
export function createEffectIntent(workflowId:string,invocationId:string,operation:string,payload:unknown,now:string):EffectRecord {return Object.freeze({schema_version:'2.0-p2',effect_id:'effect-'+randomUUID(),workflow_id:workflowId,invocation_id:invocationId,operation,payload_sha256:canonicalHash(payload),state:'INTENT_RECORDED',created_at:now,observed_at:null});}
export function reconcileEffect(effect:EffectRecord,event:'DISPATCH'|'OBSERVED'|'UNKNOWN'|'CONFIRM'|'BLOCK',observedAt:string|null):EffectRecord {
  if(event==='DISPATCH'&&effect.state!=='INTENT_RECORDED')throw Error('EFFECT_REDISPATCH_FORBIDDEN');
  const next:EffectRecord['state']=event==='DISPATCH'?'DISPATCHED':event==='OBSERVED'?'OBSERVED':event==='UNKNOWN'?'RECONCILIATION_REQUIRED':event==='CONFIRM'?'CONFIRMED':'BLOCKED';
  if(event==='CONFIRM'&&effect.state!=='OBSERVED')throw Error('EFFECT_OBSERVATION_REQUIRED');
  if(event==='OBSERVED'&&effect.state!=='DISPATCHED'&&effect.state!=='RECONCILIATION_REQUIRED')throw Error('EFFECT_NOT_DISPATCHED');
  if(event==='UNKNOWN'&&effect.state!=='DISPATCHED'&&effect.state!=='INTENT_RECORDED')throw Error('EFFECT_NOT_DISPATCHED');
  if(event==='DISPATCH'&&effect.state!=='INTENT_RECORDED')throw Error('EFFECT_REDISPATCH_FORBIDDEN');
  if(['CONFIRMED','BLOCKED'].includes(effect.state))throw Error('EFFECT_TERMINAL');
  return Object.freeze({...effect,state:next,observed_at:observedAt});
}
