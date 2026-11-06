import { it } from 'node:test';
import assert from 'node:assert/strict';
import { canonicalize, canonicalHash, parseCanonicalJson, sha256 } from '../../src/contracts/integrity.js';
import { verifyApproval, trustApproval } from '../../src/governance/approval.js';
import { task, approval } from '../helpers/contracts.js';
it('P1-003 RFC8785 recursive ordering, numeric keys, arrays and Unicode UTF16', () => {
  assert.equal(canonicalize({b:[{z:0,a:1}],a:2}), '{"a":2,"b":[{"a":1,"z":0}]}');
  assert.equal(canonicalize({'2':2,'10':10}), '{"10":10,"2":2}');
  assert.equal(canonicalize({'\ufb33':7,'😀':6,'€':5,'ö':4,'\u0080':3,'1':2,'\r':1}), '{"\\r":1,"1":2,"":3,"ö":4,"€":5,"😀":6,"דּ":7}');
});
it('P1-003 RFC8785 appendix B IEEE754 vectors', () => {
  const vectors = [ ['0000000000000000','0'],['8000000000000000','0'],['0000000000000001','5e-324'],['8000000000000001','-5e-324'],['7fefffffffffffff','1.7976931348623157e+308'],['ffefffffffffffff','-1.7976931348623157e+308'],['4340000000000000','9007199254740992'],['c340000000000000','-9007199254740992'],['4430000000000000','295147905179352830000'],['44b52d02c7e14af5','9.999999999999997e+22'],['44b52d02c7e14af6','1e+23'],['44b52d02c7e14af7','1.0000000000000001e+23'],['444b1ae4d6e2ef4e','999999999999999700000'],['444b1ae4d6e2ef4f','999999999999999900000'],['444b1ae4d6e2ef50','1e+21'],['3eb0c6f7a0b5ed8c','9.999999999999997e-7'],['3eb0c6f7a0b5ed8d','0.000001'],['41b3de4355555553','333333333.3333332'],['41b3de4355555554','333333333.33333325'],['41b3de4355555555','333333333.3333333'],['41b3de4355555556','333333333.3333334'],['41b3de4355555557','333333333.33333343'],['becbf647612f3696','-0.0000033333333333333333'],['43143ff3c1cb0959','1424953923781206.2'] ];
  for (const [hex, expected] of vectors) assert.equal(canonicalize(Buffer.from(hex!, 'hex').readDoubleBE()), expected, hex);
});
it('P1-003 rejects non-JSON, nonfinite, lone surrogates, cycles, sparse arrays and accessors', () => {
  const cycle: Record<string,unknown> = {}; cycle.self=cycle;
  for(const input of [undefined, NaN, Infinity, -Infinity, 1n, ()=>0, Symbol(), '\ud800', {'\udfff':0}, {a:undefined}, [undefined], Array(2), cycle, new Date(), {get a(){throw Error('getter invoked');}}]) assert.throws(()=>canonicalize(input));
  assert.notEqual(canonicalHash('é'), canonicalHash('e\u0301'));
});
it('P1-003 rejects duplicate escaped keys, malformed JSON and overflow at ingestion', () => {
  for(const raw of ['{"a":1,"\\u0061":2}', '{"x":{"a":1,"a":2}}', '[1,]', '1e9999', '"\\ud800"']) assert.throws(()=>parseCanonicalJson(raw));
  assert.deepEqual(parseCanonicalJson('{"a":1,"b":[true,null]}'), {a:1,b:[true,null]});
});
it('P1-003 known SHA256 and equivalent input hash, distinct payloads', () => {
  assert.equal(sha256('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(canonicalHash({b:1,a:2}),canonicalHash({a:2,b:1}));
  assert.notEqual(canonicalHash({a:1}), canonicalHash({a:2}));
});
it('P1-003 authentic host record required, exact purpose/revision/hash/identity and revocation', () => {
  const c=task(); const a=approval(canonicalHash(c)); const ctx={scope:'EXECUTION' as const,trusted:[trustApproval(a)]};
  assert.equal(verifyApproval(c,a,ctx).allowed,true);
  for(const [contract, record, context] of [ [c,null,ctx], [{...c,contract_revision:2},a,ctx], [c,{...a,execution_id:'other'},ctx], [c,{...a,approved_contract_sha256:'0'.repeat(64)},ctx], [c,{...a,approval_scope:'PLAN_ONLY'},ctx], [c,a,{...ctx,trusted:[]}], [c,a,{...ctx,trusted:[{...trustApproval(a),revoked:true}]}], [{...c,schema_version:'bad'},a,ctx], [c,{...a,authorized_by:'forged'},ctx] ] as const) assert.equal(verifyApproval(contract,record,context).allowed,false);
});
it('P1-003 MERGE requires exact attempt, diff and review bindings', () => {
  const c=task();const a=approval(canonicalHash(c),{approval_scope:'MERGE',attempt_id:'A',approved_diff_sha256:'f'.repeat(64),review_id:'R'});
  const ctx={scope:'MERGE' as const,trusted:[trustApproval(a)],attempt_id:'A',diff_sha256:'f'.repeat(64),review_id:'R'};
  assert.equal(verifyApproval(c,a,ctx).allowed,true);
  for(const patch of [{attempt_id:'B'},{diff_sha256:'a'.repeat(64)},{review_id:'old'}]) assert.equal(verifyApproval(c,a,{...ctx,...patch}).allowed,false);
});
