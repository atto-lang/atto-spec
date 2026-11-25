import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inspectGuardFixture,runGuardModel} from '../src/guard-else-free-reference.mjs';

const contract=JSON.parse(readFileSync(new URL('../contracts/guard-else-free-v1.json',import.meta.url)));
test('guard contract is proposed and not a compiler execution receipt',()=>{
 assert.equal(contract.schema,'atto.guard.else-free.proposal.v1');
 assert.equal(contract.status,'PROPOSED_SOURCE_FREE_ONLY');
 assert.equal(contract.cases.length,13);
});
test('all proposed source examples have stable, honest admission labels',()=>{
 const ids=new Set();
 for(const c of contract.cases){
   assert.ok(!ids.has(c.id),'duplicate '+c.id);ids.add(c.id);
   assert.match(c.source,/\bguard\b/);
   const admitted=inspectGuardFixture(c.source);
   assert.equal(admitted.admitted,c.expected==='ACCEPT',c.id);
   if(c.expected==='REJECT')assert.equal(admitted.code,c.code,c.id);
 }
});
test('failed guard condition executes early return; success falls through',()=>{
 for(const c of contract.cases.filter(x=>x.expected==='ACCEPT')){
   const events=[];
   const result=runGuardModel(inspectGuardFixture(c.source),c.input,event=>events.push(event));
   assert.equal(result.value,c.value,c.id);
   assert.deepEqual(events,['condition'],c.id);
 }
});
test('false evaluation is fail-arm and no artificial else is required',()=>{
 const source='fnc f(bool ok) -> int {guard ok {return 0;} return 42;}';
 const parsed=inspectGuardFixture(source);
 assert.equal(runGuardModel(parsed,false).exitedEarly,true);
 assert.equal(runGuardModel(parsed,true).exitedEarly,false);
 assert.equal(inspectGuardFixture(source.replace('guard ok {','guard ok else {')).admitted,false);
});
test('non-boolean arguments and oversized source cannot run reference model',()=>{
 const parsed=inspectGuardFixture('fnc f(bool ok) -> int {guard ok {return 0;} return 42;}');
 assert.throws(()=>runGuardModel(parsed,1),/BOOL_INPUT/);
 assert.equal(inspectGuardFixture('x'.repeat(4097)).admitted,false);
 assert.throws(()=>runGuardModel({admitted:false},true),/UNADMITTED_GUARD/);
});
