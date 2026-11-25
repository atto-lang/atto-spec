import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const load = () => JSON.parse(readFileSync(
  fileURLToPath(new URL('../contracts/object-actor-lifecycle-v1.json', import.meta.url)),
  'utf8'));
const clone = value => structuredClone(value);
const SOURCE = 'SOURCE_ADMISSION';
const RUNTIME = 'GUEST_RUNTIME';
const ARTIFACT = 'LOWERING_ARTIFACT';
const expected = [
  ['reject-actor-constructor', SOURCE],
  ['reject-direct-tear-down', SOURCE],
  ['reject-child-on-panic', SOURCE],
  ['reject-drop-await', SOURCE],
  ['reject-drop-resurrection', SOURCE],
  ['reject-state-loan-escape', SOURCE],
  ['reject-dynamic-hook-aot', SOURCE],
  ['reject-double-drop', SOURCE],
  ['reject-unproven-strict-no-gc', SOURCE],
  ['constructor-partial-unwind', RUNTIME],
  ['class-move-and-drop-once', RUNTIME],
  ['actor-on-start-before-ready', RUNTIME],
  ['actor-graceful-tear-down-once', RUNTIME],
  ['concurrent-receive-shutdown', RUNTIME],
  ['serial-receive-suspended', RUNTIME],
  ['throw-local-hook-fail-closed', RUNTIME],
  ['panic-supervisor-only', RUNTIME],
  ['stop-queued-mail-accounting', RUNTIME],
  ['restart-incarnation-generation', RUNTIME],
  ['pinned-io-ffi-retirement', RUNTIME],
  ['long-lived-actor-scratch-churn', RUNTIME],
  ['late-resume-after-stop', RUNTIME],
  ['drop-glue-control-flow-edges', ARTIFACT],
  ['full-aot-hook-closure', ARTIFACT],
  ['guest-gc-collector-absence', ARTIFACT]
];
const witness = {
  [SOURCE]: 'TARGETED_DIAGNOSTIC_NO_IR',
  [RUNTIME]: 'EXECUTED_GUEST_NONZERO_STEPS',
  [ARTIFACT]: 'ARTIFACT_AND_RUNTIME_DIGEST'
};
const exactKeys = (object, names) => (
  object !== null && typeof object === 'object' &&
  !Array.isArray(object) && Object.getPrototypeOf(object) === Object.prototype &&
  Object.keys(object).sort().join('\0') === names.slice().sort().join('\0')
);

function inspect(m) {
  assert.ok(exactKeys(m, ['schemaVersion','id','status','releaseQualified',
    'compilerBackedPassingCases','artifactVerifiedCases','guestRuntimePassingCases',
    'backends','cases']), 'unexpected contract top-level keys');
  assert.equal(m.schemaVersion, 1);
  assert.equal(m.id, 'atto-object-actor-lifecycle-v1');
  assert.equal(m.status, 'AUTHORED_NOT_EXECUTED');
  assert.equal(m.releaseQualified, false, 'authoring cannot grant release qualification');
  for (const name of ['compilerBackedPassingCases','artifactVerifiedCases',
    'guestRuntimePassingCases']) assert.equal(m[name], 0, name);
  assert.deepEqual(m.backends, ['java-graalvm','llvm','net-nativeaot','wasm','forge']);
  assert.ok(Array.isArray(m.cases));
  assert.equal(m.cases.length, expected.length);
  const ids = new Set();
  for (let i=0; i<expected.length; i++) {
    const item = m.cases[i];
    assert.ok(exactKeys(item, ['id','stage','witness','scenario','status']),
      'unexpected case metadata at index '+i);
    assert.equal(item.id, expected[i][0], 'missing/reordered lifecycle gate');
    assert.equal(item.stage, expected[i][1], 'gate moved to wrong evidence stage');
    assert.equal(item.witness, witness[item.stage], 'unverifiable evidence oracle');
    assert.equal(item.status, 'AUTHORED_NOT_EXECUTED');
    assert.equal(typeof item.scenario, 'string');
    assert.ok(item.scenario.length >= 50 && item.scenario.length <= 300);
    assert.ok(!ids.has(item.id));
    ids.add(item.id);
  }
  return Object.freeze({
    sourceRejections: expected.filter(row=>row[1]===SOURCE).length,
    guestRuntimeGates: expected.filter(row=>row[1]===RUNTIME).length,
    artifactGates: expected.filter(row=>row[1]===ARTIFACT).length,
    qualified: false
  });
}

test('25 lifecycle cases are only an authored, non-certified inventory', () => {
  assert.deepEqual(inspect(load()), {
    sourceRejections: 9, guestRuntimeGates: 13, artifactGates: 3, qualified: false
  });
});

test('every gate has an immutable evidence stage and status', () => {
  for (const [id, stage] of expected) {
    const found = load().cases.find(item=>item.id===id);
    assert.ok(found, 'missing '+id);
    assert.equal(found.stage, stage);
    assert.equal(found.witness, witness[stage]);
    assert.equal(found.status, 'AUTHORED_NOT_EXECUTED');
  }
});

test('missing, duplicated, unknown and reordered cases are rejected', () => {
  for (const mutate of [
    x=>{x.cases.pop();},
    x=>{x.cases.push(clone(x.cases[0]));},
    x=>{x.cases[2]=clone(x.cases[1]);},
    x=>{[x.cases[0],x.cases[1]]=[x.cases[1],x.cases[0]];},
    x=>{x.cases[0].id='unknown-hook';}
  ]) {
    const candidate=load(); mutate(candidate);
    assert.throws(()=>inspect(candidate));
  }
});

test('source, runtime, and artifact evidence are not interchangeable', () => {
  for (const mutate of [
    x=>{x.cases[0].stage=RUNTIME;},
    x=>{x.cases[0].witness=witness[ARTIFACT];},
    x=>{x.cases[15].stage=SOURCE;},
    x=>{x.cases[22].stage=RUNTIME;},
    x=>{x.cases[24].witness=witness[SOURCE];}
  ]) {
    const candidate=load(); mutate(candidate);
    assert.throws(()=>inspect(candidate));
  }
});

test('do not fabricate passes, receipts, or runner successes', () => {
  for (const mutate of [
    x=>{x.releaseQualified=true;},
    x=>{x.compilerBackedPassingCases=1;},
    x=>{x.artifactVerifiedCases=1;},
    x=>{x.guestRuntimePassingCases=1;},
    x=>{x.status='PASS';},
    x=>{x.cases[0].status='VERIFIED';},
    x=>{x.cases[0].steps=100;},
    x=>{x.cases[0].scenario='short';},
    x=>{x.backends.reverse();},
    x=>{x.unreviewedEvidence='PASS';}
  ]) {
    const candidate=load(); mutate(candidate);
    assert.throws(()=>inspect(candidate));
  }
});

test('prototype spoofing cannot impersonate a reviewed contract', () => {
  const x=load();
  assert.throws(()=>inspect(Object.create(x)));
  Object.defineProperty(x,'status',{enumerable:true,get(){throw new Error('spoof');}});
  assert.throws(()=>inspect(x));
});

test('chapter separates concurrent receivers, single-flight lifecycle and host GC', () => {
  const doc = readFileSync(fileURLToPath(
    new URL('../spec/27-root-object-actor-lifecycle.md', import.meta.url)), 'utf8');
  assert.match(doc, /concurrent-by-default actors/);
  assert.match(doc, /reserved single-flight lifecycle lane/);
  assert.match(doc, /PANIC bypasses all actor guest hooks/);
  assert.match(doc, /Java\/Graal and \.NET/);
  assert.match(doc, /AUTHORED_NOT_EXECUTED|NOT_EXECUTED/);
  assert.match(doc, /\.atto/);
});
