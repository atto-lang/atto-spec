import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const contract = JSON.parse(readFileSync(new URL('../conformance/caret-return-sequences-v1.json', import.meta.url), 'utf8'));
const supportedStatuses = new Set(['passed', 'failed', 'unsupported', 'not_executed']);
const backends = ['rust_wasm','java','llvm','net','forge'];

test('49 unique explicitly unverified normative cases, no default green claims', () => {
  assert.equal(contract.cases.length, 49);
  assert.equal(contract.corpusRevision, 2);
  assert.equal(contract.status, 'normative-proposed-cases-not-executed-as-corpus');
  const ids = new Set();
  for(const c of contract.cases) {
    assert.match(c.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.equal(ids.has(c.id), false, 'duplicate id '+c.id);
    ids.add(c.id);
    assert.ok(['execute','compile','parse','typecheck'].includes(c.phase),c.id);
    assert.ok(['accept','reject'].includes(c.expect),c.id);
    assert.equal(typeof c.source,'string',c.id);
    assert.ok(c.source.endsWith('\n'), c.id+' newline');
    if(c.expect==='reject') assert.ok(c.diagnostic, c.id+' diagnostic category');
    if(c.phase==='execute') assert.equal(typeof c.expectedReturn,'number',c.id+' oracle');
    for(const b of backends) assert.ok(supportedStatuses.has(c.verification?.[b]), c.id+'/'+b);
    for(const b of backends) assert.equal(c.verification[b],'not_executed', c.id+'/'+b+' requires evidence');
  }
});

test('positive external class-method calls explicitly opt into pub visibility', () => {
  for(const id of ['caret-method','end-statement-method-explicit-return','double-colon-method-implicit-return']) {
    const c=contract.cases.find(x=>x.id===id);
    assert.ok(c,c?.id||id);
    assert.match(c.source,/\bpub\s+(?:value|rec1|rec2)\s*\(/);
    assert.match(c.source,/\bnew\s+\w+\s*\(/);
  }
});

test('canonical modes, negative caret-binding and explicit return remain distinct', () => {
  const get=id=>contract.cases.find(x=>x.id===id)?.source;
  assert.match(get('end-statement-method-explicit-return'),/-> int\s+const z: int = 5;\s+\^ z \+ 3;/);
  assert.match(get('double-colon-method-implicit-return'),/-> int ::\s+const z: int = 5,\s+z \+ 5/);
  assert.match(get('reject-double-colon-caret-binding'),/\^ const z: int/);
  assert.match(get('reject-unmarked-comma-body'),/-> int\s+const z: int = 5, z \+ 5/);
  assert.equal(contract.migration.publishedEditionFlag, 'not_defined');
});

test('this corpus is not silently conflated with separately executed Rust CI', () => {
  assert.match(contract.note,/NOT these 49 normative vectors individually/);
  const statuses = Object.values(contract.cases[0].verification);
  assert.deepEqual(statuses,['not_executed','not_executed','not_executed','not_executed','not_executed']);
});
