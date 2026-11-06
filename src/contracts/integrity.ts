import { createHash } from 'node:crypto';

/** RFC8785: UTF-16 key sorting; ECMAScript primitive serialization; UTF-8 hashing. */
export function canonicalize(input: unknown): string {
  const ancestors = new Set<object>();
  function string(value: string): string {
    if (/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) throw new Error('JCS_INVALID_UNICODE');
    return JSON.stringify(value);
  }
  function visit(value: unknown): string {
    if (value === null) return 'null';
    if (typeof value === 'string') return string(value);
    if (typeof value === 'boolean') return String(value);
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new Error('JCS_NONFINITE_NUMBER');
      return JSON.stringify(value);
    }
    if (typeof value !== 'object') throw new Error('JCS_NON_JSON_VALUE');
    if (ancestors.has(value)) throw new Error('JCS_CYCLE');
    const array = Array.isArray(value);
    if (!array && Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) throw new Error('JCS_NON_JSON_OBJECT');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.getOwnPropertySymbols(value).length || Object.values(descriptors).some(d => !('value' in d))) throw new Error('JCS_ACCESSOR_OR_SYMBOL');
    ancestors.add(value);
    try {
      if (array) {
        if (Object.keys(value).length !== value.length) throw new Error('JCS_SPARSE_OR_EXTRA_ARRAY_PROPERTY');
        return '[' + Array.from({length:value.length}, (_,i)=>visit(descriptors[String(i)]?.value)).join(',') + ']';
      }
      if (Object.values(descriptors).some(d=>!d.enumerable)) throw new Error('JCS_NON_ENUMERABLE_PROPERTY');
      return '{' + Object.keys(descriptors).sort().map(key=>string(key)+':'+visit(descriptors[key]!.value)).join(',') + '}';
    } finally { ancestors.delete(value); }
  }
  return visit(input);
}

/** JSON.parse alone discards duplicate names. Check the original token stream too. */
export function parseCanonicalJson(raw: string): unknown {
  const parsed: unknown = JSON.parse(raw);
  const tokens = raw.match(/"(?:[^"\\]|\\.)*"|[{}\[\]:,]|[^\s{}\[\]:,]+/g) ?? [];
  let index = 0;
  function value(): void {
    const token = tokens[index++];
    if (token === '{') {
      const keys = new Set<string>();
      if (tokens[index] === '}') { index++; return; }
      while (true) {
        const key: string = JSON.parse(tokens[index++]!);
        if (keys.has(key)) throw new Error('JCS_DUPLICATE_KEY');
        keys.add(key); index++; value();
        if (tokens[index++] === '}') break;
      }
    } else if (token === '[') {
      if (tokens[index] === ']') {index++; return;}
      while (true) { value(); if (tokens[index++] === ']') break; }
    }
  }
  value();
  canonicalize(parsed);
  return parsed;
}
export function sha256(input: string | Uint8Array): string { return createHash('sha256').update(input).digest('hex'); }
export function canonicalHash(input: unknown): string { return sha256(canonicalize(input)); }
