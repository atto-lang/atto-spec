// HOST_ONLY scalar reference: not an Atto compiler or guest runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const doc=readFileSync(new URL('../language/map-mutation-api-v1.md',import.meta.url),'utf8');
const none=()=>({tag:'None'}), some=value=>({tag:'Some',value});
class ScalarMap {
  #entries=[];
  get(k){const e=this.#entries.find(e=>e.key===k);return e?some(e.value):none()}
  set(k,v){if(typeof k!=='string'||!Number.isSafeInteger(v))throw Error('E_TYPE');const e=this.#entries.find(e=>e.key===k);const old=e?some(e.value):none();if(e)e.value=v;else this.#entries.push({key:k,value:v});return old}
  add(e){return this.set(e.key,e.value)}
  try_add(e){if(this.get(e.key).tag==='Some')return false;this.add(e);return true}
}
test('upsert returns previous value, insert-only preserves existing value and absence is explicit',()=>{const m=new ScalarMap(),e=Object.freeze({key:'foo',value:5});assert.deepEqual(m.get('foo'),none());assert.deepEqual(m.add(e),none());assert.deepEqual(m.set('foo',6),some(5));assert.equal(m.try_add(e),false);assert.deepEqual(m.get('foo'),some(6));assert.deepEqual(m.add(e),some(6));assert.deepEqual(m.get('foo'),some(5));assert.equal(m.try_add({key:'bar',value:7}),true)});
test('type failure leaves storage unchanged and distinct keys survive',()=>{const m=new ScalarMap();m.set('a',1);m.set('b',2);assert.throws(()=>m.set('a','bad'),/E_TYPE/);assert.deepEqual(m.get('a'),some(1));assert.deepEqual(m.get('b'),some(2));});
test('spec preserves top-level const gate and explicit Option result',()=>{assert.ok(doc.includes('ordinary top-level `let` remains invalid'));assert.ok(doc.includes('Option<V>'));assert.ok(doc.includes('Atomic insert-only'));});
