import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const path = fileURLToPath(new URL('../contracts/aot-zero-gc-stage-gates-v1.json', import.meta.url));
const load = () => JSON.parse(readFileSync(path, 'utf8'));
const clone = x => structuredClone(x);
const SOURCE = 'SOURCE_ADMISSION', LOWER = 'LOWERING_ARTIFACT', RUNTIME = 'RUNTIME_STRESS';
const EXPECTED = [
  ['reject-runtime-eval', SOURCE],
  ['reject-open-class-creation', SOURCE],
  ['reject-unknown-proxy-target', SOURCE],
  ['reject-private-proxy-escalation', SOURCE],
  ['reject-unregistered-reflection', SOURCE],
  ['reject-borrow-across-suspension', SOURCE],
  ['reject-closure-channel-send', SOURCE],
  ['reject-sealed-dynamic-loader', SOURCE],
  ['dispatch-edge-erasure', LOWER],
  ['cleanup-edge-erasure', LOWER],
  ['runtime-interpreter-fallback', LOWER],
  ['proxy-static-instance-confusion', LOWER],
  ['actor-stale-generation', RUNTIME],
  ['cancel-pending-io', RUNTIME],
  ['quota-oom-churn', RUNTIME],
  ['publish-unsubscribe-close', RUNTIME]
];
const PROOF = {
  [SOURCE]: 'TARGETED_DIAGNOSTIC_NO_IR',
  [LOWER]: 'ARTIFACT_IR_MUTATION',
  [RUNTIME]: 'EXECUTED_GUEST_NEGATIVE'
};
function keys(x, wanted) {
  return x && typeof x === 'object' && !Array.isArray(x) &&
    Object.getPrototypeOf(x) === Object.prototype &&
    Object.keys(x).sort().join('\0') === wanted.slice().sort().join('\0');
}
function inspect(m) {
  assert.ok(keys(m, ['schemaVersion','id','status','backends','releaseQualified',
    'compilerBackedPassingCases','artifactVerifiedCases','guestRuntimePassingCases','cases']));
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.id, 'atto-aot-zero-gc-stage-gates-v1');
  assert.equal(m.status, 'AUTHORED_NOT_EXECUTED');
  assert.equal(m.releaseQualified, false);
  for (const field of ['compilerBackedPassingCases','artifactVerifiedCases','guestRuntimePassingCases'])
    assert.equal(m[field], 0, field + ' cannot be minted by a source-only inventory');
  assert.deepEqual(m.backends, ['java-graalvm','llvm','net-nativeaot','wasm','forge','cranelift']);
  assert.ok(Array.isArray(m.cases));
  assert.equal(m.cases.length, EXPECTED.length);
  const seen = new Set();
  for (let i=0; i<EXPECTED.length; i++) {
    const c=m.cases[i];
    assert.ok(keys(c,['id','stage','witness','scenario','status']), 'unexpected case fields');
    assert.equal(c.id, EXPECTED[i][0], 'missing/duplicated/reordered case');
    assert.equal(c.stage, EXPECTED[i][1], 'wrong enforcement stage');
    assert.equal(c.witness, PROOF[c.stage], 'wrong evidence oracle for stage');
    assert.equal(c.status, 'AUTHORED_NOT_EXECUTED');
    assert.equal(typeof c.scenario, 'string');
    assert.ok(c.scenario.length >= 40 && c.scenario.length <= 300);
    assert.ok(!seen.has(c.id), 'duplicate scenario');
    seen.add(c.id);
  }
  return {status:'VALID_SOURCE_ONLY_INVENTORY',sourceNegatives:8,
    loweringMutations:4,runtimeStress:4,releaseQualified:false};
}

test('16 AOT/zero-GC candidates retain three distinct evidence stages', () => {
  assert.deepEqual(inspect(load()), {status:'VALID_SOURCE_ONLY_INVENTORY',
    sourceNegatives:8, loweringMutations:4, runtimeStress:4, releaseQualified:false});
});

for (const [id,stage] of EXPECTED) {
  test('scenario stays in its correct oracle phase: '+id, () => {
    const row=load().cases.find(x=>x.id===id);
    assert.ok(row);
    assert.equal(row.stage,stage);
    assert.equal(row.witness,PROOF[stage]);
    assert.equal(row.status,'AUTHORED_NOT_EXECUTED');
  });
}

test('missing, duplicate and reordered scenarios fail closed', () => {
  const valid=load();
  for (const change of [
    x=>{x.cases.pop();},
    x=>{x.cases.push(clone(x.cases[0]));},
    x=>{x.cases[2]=clone(x.cases[1]);},
    x=>{[x.cases[0],x.cases[1]]=[x.cases[1],x.cases[0]];},
    x=>{x.cases[0].id='unknown-scenario';}
  ]) {
    const x=clone(valid);change(x);
    assert.throws(()=>inspect(x));
  }
});

test('source rejection cannot be substituted by a runtime claim or artifact oracle', () => {
  const valid=load();
  for (const change of [
    x=>{x.cases[0].stage=RUNTIME;},
    x=>{x.cases[0].witness=PROOF[RUNTIME];},
    x=>{x.cases[0].witness=PROOF[LOWER];},
    x=>{x.cases[11].stage=SOURCE;},
    x=>{x.cases[12].stage=LOWER;},
    x=>{x.cases[14].witness=PROOF[SOURCE];},
  ]) {
    const x=clone(valid);change(x);
    assert.throws(()=>inspect(x));
  }
});

test('invented test passes, runtime attestations and extra metadata fail closed', () => {
  const valid=load();
  for (const change of [
    x=>{x.releaseQualified=true;},
    x=>{x.status='VERIFIED';},
    x=>{x.compilerBackedPassingCases=1;},
    x=>{x.artifactVerifiedCases=1;},
    x=>{x.guestRuntimePassingCases=1;},
    x=>{x.cases[0].status='PASS';},
    x=>{x.cases[0].steps=7;},
    x=>{x.cases[0].scenario='short';},
    x=>{x.backends.reverse();},
    x=>{x.untrustedProof='green';}
  ]) {
    const x=clone(valid);change(x);
    assert.throws(()=>inspect(x));
  }
});

test('proto tricks or getters cannot impersonate reviewed JSON inventory', () => {
  const x=load();
  assert.throws(()=>inspect(Object.create(x)));
  Object.defineProperty(x,'releaseQualified',{enumerable:true,get(){throw new Error('spoof');}});
  assert.throws(()=>inspect(x));
});

test('canonical specification reserves all three distinct test stages', () => {
  const chapter=readFileSync(fileURLToPath(new URL('../spec/22-aot-zero-gc-controlled-dynamism.md',import.meta.url)),'utf8');
  const source=chapter.indexOf('**Negative source-admission tests');
  const lower=chapter.indexOf('**Lowering and artifact integrity tests');
  const runtime=chapter.indexOf('**Runtime negative and stress tests');
  assert.ok(source > 0 && lower > source && runtime > lower);
  assert.match(chapter,/runner-admission failure \/ \*\*NOT_EXECUTED\*\*/);
  assert.match(chapter,/no interpreter\/JIT fallback/);
});
