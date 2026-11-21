// Source-free contract validation only. NOT actual compiler/guest, GC, or parity certification.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c=JSON.parse(readFileSync(path.join(root,'conformance/control-and-actor-unmanaged-memory-v1.json'),'utf8'));
const required=["atto-source.atto","atto-source.net","atto-source.hdl","atto-source.java","atto-source.realtime","atto-source.rs","atto-source.llvm","atto-source.js","atto-source.forge","atto-source.wasm","atto-source.cranelift"];
assert.equal(c.schemaVersion,1);
assert.equal(c.feature,'control-and-actor-unmanaged-memory-v1');
assert.equal(c.status,'TARGET_ONLY_NOT_EXECUTED');
assert.equal(c.controlPlaneAbiId,'control_generation12_slot20_v1');
assert.deepEqual(Object.keys(c.backendStatus).sort(),required.sort());
for(const v of Object.values(c.backendStatus))assert.equal(v,'NOT_EXECUTED');
assert.deepEqual(c.referenceAbis,['offset8_plus_one','generation20_slot12','generation16_slot16','segmented_handle32']);
assert.equal(c.cases.length,18);
const ids=new Set;
for(const x of c.cases){
  assert.match(x.id,/^CM\d{2}$/);
  assert(!ids.has(x.id),'duplicate case id');
  ids.add(x.id);
  assert(['accept','reject'].includes(x.expect));
  assert(x.requirement.length>35,'must state a material acceptance requirement');
  assert.equal(x.fixture_status,'TARGET_ONLY_NOT_EXECUTED');
  assert.deepEqual(Object.keys(x.backend_status).sort(),required);
  for(const v of Object.values(x.backend_status))assert.equal(v,'NOT_EXECUTED');
}
assert.equal(ids.size,18);
const doc=readFileSync(path.join(root,c.contract),'utf8');
for(const token of ['ControlRef32','ActorRef32','offset8_plus_one','generation20_slot12','generation16_slot16','GC.TryStartNoGCRegion','NOT_EXECUTED']){
  assert(doc.includes(token),`missing contract safeguard: ${token}`);
}
console.log('PASS control-and-actor-unmanaged-memory-v1 18 target-only cases / 11 backends; NO compiled guest or zero-GC claim');
