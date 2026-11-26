import test from 'node:test';
import assert from 'node:assert/strict';
import {TypeScope,projectParameterField,checkSequenceReturn} from '../reference-checks/named-aggregate-type-inference-v1.mjs';
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

test('signature projections use declared shapes and check tuple order',()=>{
  const s=new TypeScope();
  s.infer('Record','T1',fields);
  const t=s.infer('Tuple','T2',['bool','string','int']);
  const params=new Map([['input',{kind:'Record',alias:'T1'}]]);
  const project=key=>projectParameterField(s,params,'input',key);
  const items=['a','b','c'].map(project);
  assert.equal(project('c'),'int');
  assert.equal(s.checkLiteral('Tuple','T2',items),t);
  assert.equal(checkSequenceReturn(project('c'),items),'int');
  assert.throws(()=>s.checkLiteral('Tuple','T2',['b','a','c'].map(project)),/E_TYPE_MISMATCH/);
  assert.throws(()=>project('missing'),/E_NO_FIELD/);
  assert.throws(()=>projectParameterField(s,params,'other','c'),/E_UNKNOWN_PARAMETER/);
});
test('sequence return checks every static type and the final type only',()=>{
  assert.equal(checkSequenceReturn('int',['bool','string','int']),'int');
  assert.equal(checkSequenceReturn('string',['int','string']),'string');
  assert.equal(checkSequenceReturn('int',['int']),'int');
  for(const items of [[],['int','string'],['unknown','int'],Array(2),Array(129).fill('int')])
    assert.throws(()=>checkSequenceReturn('int',items));
});
test('projection rejects wrong kind and invisible aliases',()=>{
  const s=new TypeScope();
  s.infer('Tuple','T',['int']);
  const params=new Map([['input',{kind:'Record',alias:'T'}]]);
  assert.throws(()=>projectParameterField(s,params,'input','c'),/E_AGGREGATE_KIND/);
  const child=s.child();
  child.infer('Record','Local',fields);
  params.set('input',{kind:'Record',alias:'Local'});
  assert.equal(projectParameterField(child,params,'input','c'),'int');
  assert.throws(()=>projectParameterField(s,params,'input','c'),/E_UNKNOWN_TYPE/);
});

test('sparse aggregate descriptors fail before publishing aliases',()=>{
  const s=new TypeScope();
  for (const [kind,items] of [['Tuple',Array(1)],['Record',Array(1)],['struct',Array(2)]]) {
    assert.throws(()=>s.infer(kind,'Broken',items),/E_TYPE_INFER_AMBIGUOUS/);
    assert.throws(()=>s.resolve('Broken'),/E_UNKNOWN_TYPE/);
  }
  const descriptor=s.infer('Tuple','T',['int']);
  assert.throws(()=>s.checkLiteral('Tuple','T',Array(1)),/E_TYPE_INFER_AMBIGUOUS/);
  assert.equal(s.resolve('T'),descriptor);
});
