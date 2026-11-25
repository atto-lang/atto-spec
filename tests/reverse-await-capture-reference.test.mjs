// HOST ONLY: checked pipeline value capture, not a guest parser/compiler.
import test from 'node:test';
import assert from 'node:assert/strict';
function capture({kind='val', suspended=true, bind='f', operand='f', type='int', source, transform, loan=false}) {
  if (!['val','let'].includes(kind)||!suspended||bind!==operand||loan) throw Error('admission');
  const value=source.consume();
  const out=transform(value);
  if(type==='int' && typeof out!=='number') throw Error('type');
  return out;
}
function future(value) { let count=0; return {consume(){if(count++)throw Error('moved');return value}, count:()=>count}; }
test('right-associated reverse pipeline matches forward and preserves evaluation order',()=>{
 const log=[];const f=x=>{log.push('f');return x*2},g=x=>{log.push('g');return x+3};
 assert.equal(f(g(4)),14);assert.deepEqual(log,['g','f']);
 log.length=0;assert.equal([g,f].reduce((x,s)=>s(x),4),14);assert.deepEqual(log,['g','f']);
});
test('await capture consumes a future exactly once',()=>{
 const s=future(41); assert.equal(capture({source:s,transform:x=>x+1}),42);assert.equal(s.count(),1);
 assert.throws(()=>capture({source:s,transform:x=>x+1}),/moved/);
});
test('admission rejects const, wrong await binder, non-susp and live loans before evaluation',()=>{
 for(const invalid of [{kind:'const'},{bind:'f',operand:'g'},{suspended:false},{loan:true}]) {
   const s=future(41);assert.throws(()=>capture({source:s,transform:x=>x+1,...invalid}),/admission/);assert.equal(s.count(),0);
 }
});
test('checked read outcome does not silently unwrap',()=>{
 const err={tag:'Err',error:'Closed'};const s=future(err);
 assert.strictEqual(capture({source:s,transform:x=>x,type:'Result'}),err);
 assert.throws(()=>capture({source:future(err),transform:x=>x}),/type/);
});
