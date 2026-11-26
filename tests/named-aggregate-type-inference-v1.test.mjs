import test from 'node:test';
import assert from 'node:assert/strict';
import {TypeScope} from '../reference-checks/named-aggregate-type-inference-v1.mjs';
const fields = [['a','bool'],['b','string'],['c','int']];
const reversed = [...fields].reverse();
test('named record and tuple are reusable; record field order does not matter',()=>{
  const s=new TypeScope();
  const r=s.infer('Record','T1',fields);
  const t=s.infer('Tuple','T2',['bool','string','int']);
  assert.equal(s.checkLiteral('Record','T1',reversed),r);
  assert.equal(s.child().checkLiteral('Tuple','T2',['bool','string','int']),t);
  assert.throws(()=>s.checkLiteral('Tuple','T2',['int','string','bool']),/E_TYPE_MISMATCH/);
  assert.throws(()=>s.checkLiteral('Tuple','T2',['bool']),/E_TYPE_MISMATCH/);
});
test('struct is nominal, contextual construction retains declared layout',()=>{
  const s=new TypeScope();
  const a=s.infer('struct','T3',fields), b=s.infer('struct','Other',fields);
  assert.notEqual(a,b);
  assert.equal(s.checkLiteral('struct','T3',reversed),a);
  assert.throws(()=>s.checkValue('struct','T3',b),/E_TYPE_MISMATCH/);
  assert.throws(()=>s.checkLiteral('Record','T3',fields),/E_AGGREGATE_KIND/);
});
test('no implicit aliases, bare infer, duplicate or failed publication',()=>{
  const s=new TypeScope();
  s.anonymous('Record',fields);
  assert.throws(()=>s.resolve('T1'),/E_UNKNOWN_TYPE/);
  assert.throws(()=>s.infer('Record',undefined,fields),/E_TYPE_NAME/);
  assert.throws(()=>s.infer('Record','T1',[['a','bool'],['a','int']]),/E_DUPLICATE_FIELD/);
  assert.throws(()=>s.resolve('T1'),/E_UNKNOWN_TYPE/);
  const r=s.infer('Record','T1',fields);
  assert.throws(()=>s.infer('Tuple','T1',['int']),/E_DUPLICATE_TYPE/);
  assert.equal(s.resolve('T1'),r);
  for(const bad of [fields.slice(0,2),[...fields,['d','bool']],[['a','int'],...fields.slice(1)]])
    assert.throws(()=>s.checkLiteral('Record','T1',bad),/E_TYPE_MISMATCH/);
});
test('scope visibility and immutable descriptors',()=>{
  const s=new TypeScope(), child=s.child(), sibling=s.child();
  const r=child.infer('Record','Local',fields);
  assert.equal(child.child().resolve('Local'),r);
  assert.throws(()=>s.resolve('Local'),/E_UNKNOWN_TYPE/);
  assert.throws(()=>sibling.resolve('Local'),/E_UNKNOWN_TYPE/);
  assert.throws(()=>r.fields[0][1]='string',TypeError);
});
