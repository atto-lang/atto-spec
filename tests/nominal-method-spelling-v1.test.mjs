import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const m=JSON.parse(readFileSync(new URL('../conformance/nominal-method-spelling-v1.json',import.meta.url),'utf8'));
test('method spelling corpus covers every backend without certifying execution',()=>{
  assert.equal(m.status,'CANDIDATE_NOT_EXECUTED');
  assert.deepEqual(Object.keys(m.compiler_targets).sort(),['atto','cranelift','forge','hdl','java','js','llvm','net','realtime','rs','wasm']);
  assert.ok(Object.values(m.compiler_targets).every(v=>v==='NOT_EXECUTED'));
  assert.equal(m.cases.length,12);
  assert.equal(new Set(m.cases.map(c=>c.id)).size,12);
  for(const kind of ['interface','trait']){
    for(const spelling of ['bare','fnc','mtd']){
      const p=m.cases.find(c=>c.id===kind+'.'+spelling+'.positive');
      const n=m.cases.find(c=>c.id===kind+'.'+spelling+'.missing');
      assert.equal(p.expected_return_int,42);
      assert.equal(n.expect,'semantic_reject');
      assert.equal(n.no_artifact,true);
      assert.equal(n.diagnostic_family,'MISSING_INSTANCE_OBLIGATION');
      assert.equal(p.source.split('\n')[0],n.source.split('\n')[0]);
      assert.equal(p.status,'NOT_EXECUTED');
      assert.equal(n.status,'NOT_EXECUTED');
    }
  }
});
