// Host-only single-operation outcome and admission model.
import test from 'node:test';import assert from 'node:assert/strict';
function read(source,{susp=true,loan=false,expected='Result',discard=false}={}) {
 if(!susp||loan||discard||expected!=='Result')throw Error('admission');
 return source();
}
test('both read spellings preserve checked EOF, data and failure exactly once',()=>{
 for(const v of [{tag:'Ok',value:{tag:'None'}},{tag:'Ok',value:{tag:'Some',value:42}},{tag:'Err',error:'Closed'}]){
  let n=0;const source=()=>{n++;return v};assert.strictEqual(read(source),v);assert.equal(n,1);
 }
});
test('reject incompatible type, discard, live loan or missing suspension before consumption',()=>{
 for(const opts of [{expected:'int'},{discard:true},{loan:true},{susp:false}]){
  let n=0;assert.throws(()=>read(()=>{n++},opts),/admission/);assert.equal(n,0);
 }
});
test('failed or cancelled send retains ownership; admitted send moves it once',()=>{
 function send(owner,outcome){if(outcome==='Ok'){if(!owner.live)throw Error('moved');owner.live=false}return outcome}
 const v={live:true};assert.equal(send(v,'Cancelled'),'Cancelled');assert.equal(v.live,true);
 assert.equal(send(v,'Closed'),'Closed');assert.equal(v.live,true);assert.equal(send(v,'Ok'),'Ok');assert.equal(v.live,false);assert.throws(()=>send(v,'Ok'),/moved/);
});
