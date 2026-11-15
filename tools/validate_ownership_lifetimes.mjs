import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync(new URL('../language/ownership-lifetimes-v1.json',import.meta.url),'utf8'));
assert.equal(d.schema,'atto.ownership.lifetimes.proposal.v1');
assert.equal(d.status,'PROPOSED_NOT_ACCEPTED');
assert.equal(d.implemented,false);
assert.equal(d.compiled_guest_proof,false);
assert.deepEqual(d.backend_targets,['java','llvm','rust-wasm','forge','net']);
assert.ok(Array.isArray(d.cases)&&d.cases.length>=20);
assert.equal(new Set(d.cases.map(x=>x.id)).size,d.cases.length);
const areas=new Set(['box','arc','alias','control-flow','actor','suspension','failure']);
for(const c of d.cases){
  assert.match(c.id,/^[a-z][a-z0-9-]+$/);
  assert.ok(areas.has(c.area),c.id);
  assert.ok(['accept','reject'].includes(c.target),c.id);
  assert.ok(['unverified','partial-rust-wasm'].includes(c.current),c.id);
  assert.ok(typeof c.source==='string'&&c.source.length>12,c.id);
  assert.ok(typeof c.rule==='string'&&c.rule.length>12,c.id);
}
console.log('PASS proposal-only ownership contract inventory: '+d.cases.length+' cases, no implementation claims');
