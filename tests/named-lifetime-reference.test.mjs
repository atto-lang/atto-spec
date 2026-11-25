// Host-only provenance relation oracle; no source parsing or guest claim.
import test from 'node:test';import assert from 'node:assert/strict';
function resolve(inputs,origin,named){if(!inputs.includes(origin))throw Error('local escape');if(named!==undefined&&named!==origin)throw Error('relation');if(named===undefined&&inputs.length!==1)throw Error('ambiguous');return origin}
test('borrowed return needs a proven input origin',()=>{assert.equal(resolve(['self'],'self'),'self');assert.equal(resolve(['a','b'],'a','a'),'a');assert.throws(()=>resolve(['a','b'],'a'),/ambiguous/);assert.throws(()=>resolve(['a'],'local','a'),/local escape/);assert.throws(()=>resolve(['a','b'],'b','a'),/relation/)});
test('last use ends loan but never grants ownership',()=>{const loan={origin:'a',live:true,owned:false};loan.live=false;assert.equal(loan.owned,false);assert.equal(loan.origin,'a')});
