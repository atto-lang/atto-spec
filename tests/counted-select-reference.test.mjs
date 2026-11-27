import test from 'node:test';
import assert from 'node:assert/strict';
import { CountedSelect } from '../src/counted-select-reference.mjs';
const channel = () => ({kind:'channel'});
const future = identity => ({kind:'future', identity});
test('count validation, zero and explicit one-element shape', () => {
  for (const n of [-1, 1.2, NaN, Infinity, 1025, Number.MAX_SAFE_INTEGER+1])
    assert.throws(() => new CountedSelect(n,[channel()]), /SelectCountInvalid/);
  assert.deepEqual(new CountedSelect(0,[]).result(),[]);
  const s = new CountedSelect(1,[channel()]);
  s.finish(s.choose([0]),42);
  assert.deepEqual(s.result(),[42]);
});
test('exactly three rounds, no next round before cleanup, no fourth event', () => {
  const s = new CountedSelect(3,[channel(),channel()]);
  for (const [index,value] of [[0,20],[1,40],[0,60]]) {
    const t = s.choose([0,1]);
    assert.equal(t.index,index);
    assert.equal(s.choose([0,1]),null);
    assert.equal(s.result(),null);
    assert.equal(s.finish(t,value),true);
    assert.equal(s.finish(t,999),false);
  }
  assert.deepEqual(s.result(),[20,40,60]);
  assert.equal(s.choose([0,1]),null);
  assert.equal(s.cancel(),false);
  assert.deepEqual(s.commits,[0,1,0]);
});
test('Future aliases retire after one win while channels remain reusable', () => {
  const s = new CountedSelect(3,[future('f'),future('f'),channel()]);
  s.finish(s.choose([0,1,2]),1);
  assert.equal(s.choose([0,1]),null);
  s.finish(s.choose([0,1,2]),2);
  s.finish(s.choose([0,1,2]),3);
  assert.deepEqual(s.commits,[0,2,2]);
  assert.deepEqual(s.result(),[1,2,3]);
});
test('cancel before commit consumes nothing; cancel after commit never rolls back', () => {
  const a = new CountedSelect(3,[channel()]);
  assert.equal(a.cancel(),true);
  assert.equal(a.choose([0]),null);
  assert.deepEqual(a.commits,[]);
  const s = new CountedSelect(3,[channel()]);
  s.finish(s.choose([0]),1);
  const t = s.choose([0]);
  s.cancel();
  assert.equal(s.state,'running');
  assert.equal(s.result(),null);
  s.finish(t,2);
  assert.equal(s.state,'cancelled');
  assert.deepEqual(s.commits,[0,0]);
  assert.deepEqual(s.dropped,[2,1]);
  assert.equal(s.finish(t,2),false);
  assert.equal(s.cancel(),false);
});
test('exhausted prefix and failing arm do not publish partial success', () => {
  for (const terminal of ['exhausted','failed']) {
    const s = new CountedSelect(3,[channel()]);
    s.finish(s.choose([0]),1);
    if (terminal==='exhausted') s.exhaust();
    else s.finish(s.choose([0]),undefined,Error('arm failure'));
    assert.equal(s.state,terminal);
    assert.equal(s.result(),null);
    assert.deepEqual(s.dropped,[1]);
    assert.equal(s.choose([0]),null);
  }
});
test('stale generations and stale round events cannot commit', () => {
  const s = new CountedSelect(2,[channel()],{generation:2});
  assert.equal(s.choose([0],1,0),null);
  const t = s.choose([0],2,0);
  s.finish(t,10);
  assert.equal(s.choose([0],2,0),null);
  assert.equal(s.finish(t,99),false);
  s.finish(s.choose([0],2,1),20);
  assert.deepEqual(s.result(),[10,20]);
});
test('unsupported default/write and policy fail closed; first policy remains lexical', () => {
  for (const kind of ['default','write']) assert.throws(()=>new CountedSelect(2,[{kind}]),/unsupported/);
  const s = new CountedSelect(2,[channel(),channel()],{policy:'first'});
  s.finish(s.choose([0,1]),1);
  s.finish(s.choose([0,1]),2);
  assert.deepEqual(s.commits,[0,0]);
});
