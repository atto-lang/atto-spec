// HOST_ONLY bounded place/rights reference; no frontend or runtime proof.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const spec=readFileSync(new URL('../language/field-sensitive-borrow-effects-v1.md',import.meta.url),'utf8');
function overlap(a,b) {
  if(a.root!==b.root) return false; // authenticated distinct roots only
  if(a.unknown||b.unknown) return true;
  return a.path.slice(0,Math.min(a.path.length,b.path.length)).every((v,i)=>v===b.path[i]);
}
function conflict(a,b){return overlap(a,b)&&(a.write||b.write)}
const p=(path,write=false,unknown=false)=>({root:'person',path,write,unknown});
test('siblings, prefixes, whole owner and unknown effects',()=>{
 const loan=p(['name']);
 assert.equal(conflict(loan,p(['age'],true)),false);
 assert.equal(conflict(loan,p(['name'],true)),true);
 assert.equal(conflict(loan,p([],true)),true);
 assert.equal(conflict(loan,p(['age'],true,true)),true);
 assert.equal(conflict(p(['contact']),p(['contact','email'],true)),true);
});
test('multiple readers and exclusive overlapping writers',()=>{
 assert.equal(conflict(p(['age']),p(['age'])),false);
 assert.equal(conflict(p(['age'],true),p(['age'])),true);
 assert.equal(conflict(p(['age'],true),p(['name'],true)),false);
});
function checkGuard(mode,ceiling,writes){return writes.length===0||(mode==='write'&&writes.every(f=>ceiling.includes(f)))}
test('write ceiling is not a guard and read-only is never writable',()=>{
 assert.equal(checkGuard('read',['age'],['age']),false);
 assert.equal(checkGuard('none',['age'],['age']),false);
 assert.equal(checkGuard('write',['age'],['name']),false);
 assert.equal(checkGuard('write',['age'],['age']),true);
});
test('spec retains conservative ownership, NLL and backend evidence gates',()=>{
 assert.match(spec,/whole-object/);assert.match(spec,/deferred cleanup/);
 assert.match(spec,/sealed transitive read\/write\/escape\/suspend summary/);
 assert.match(spec,/whole-state exclusive/);assert.match(spec,/absence of output Wasm artifacts/);
 assert.match(spec,/NOT CERTIFIED ACROSS BACKENDS/);
});
