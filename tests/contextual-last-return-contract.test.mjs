import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const suite = JSON.parse(readFileSync(
  new URL('../conformance/contextual-last-return-v1.json', import.meta.url), 'utf8'));
const backends=['rust_wasm','java','llvm','net','forge'];

test('contextual caret corpus has unique, evidence-honest vector IDs',()=>{
  assert.equal(suite.feature,'contextual-return-caret-last-sequence');
  assert.equal(suite.status,'draft-not-executed-across-backends');
  assert.equal(suite.cases.length,28);
  const ids=new Set();
  for(const c of suite.cases){
    assert.match(c.id,/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(!ids.has(c.id), 'duplicate '+c.id); ids.add(c.id);
    assert.ok(['execute','compile','parse','typecheck'].includes(c.phase),c.id);
    assert.ok(['accept','reject'].includes(c.expect),c.id);
    assert.ok(c.source.endsWith('\n'),c.id+' missing terminal newline');
    if(c.phase==='execute') assert.equal(typeof c.expectedReturn,'number',c.id);
    if(c.expect==='reject') assert.equal(typeof c.diagnostic,'string',c.id);
    for(const b of backends)assert.equal(c.verification[b],'not_executed',c.id+'/'+b);
  }
});
test('literal return selector, standalone tuple and empty sequence are distinct',()=>{
  const find=id=>suite.cases.find(x=>x.id===id);
  assert.match(find('two-values').source,/return \^ \(1, 42\)/);
  assert.match(find('tuple-ordinary').source,/return \(1, 42\)/);
  assert.match(find('tuple-caret-statement').source,/\^ \(1, 42\)/);
  assert.match(find('tuple-last-value').source,/return \^ \(\(1, 42\)\)/);
  assert.equal(find('empty').diagnostic,'E_EMPTY_SEQUENCE');
  assert.equal(find('empty-whitespace').diagnostic,'E_EMPTY_SEQUENCE');
  assert.equal(find('seq-return-equivalent').expectedReturn,42);
  assert.equal(find('caret-seq-equivalent').expectedReturn,42);
});
test('target tuple vectors never masquerade as executed scalar browser passes',()=>{
  for(const id of ['tuple-ordinary','tuple-caret-statement','tuple-last-value']){
    const c=suite.cases.find(x=>x.id===id);
    assert.ok(c.note.includes('tuple')||c.note.includes('Tuple'),id);
    assert.equal(c.verification.rust_wasm,'not_executed');
  }
});
