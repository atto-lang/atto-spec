import test from 'node:test';
import assert from 'node:assert/strict';

// Host-only finite-state reference model. Not the Atto compiler or a formal proof.
const KINDS = ['throw', 'raise', 'panic'];
const newIncident = (kind) => ({
  id: 'i-1', originKind: kind, mode: kind,
  payload: Object.freeze({ marker: 'same-original-object' }),
  owner: 'frame', resolution: null, steps: 0,
});
function invariant(s, original) {
  assert.equal(s.id, original.id, 'incident identity changed');
  assert.equal(s.originKind, original.originKind, 'source kind erased');
  assert.equal(s.payload, original.payload, 'source payload replaced');
  assert.equal(s.owner === null, s.resolution !== null,
    'exactly one live owner OR one terminal resolution required');
  if (s.owner !== null) assert.ok(['frame', 'caller', 'result', 'supervisor'].includes(s.owner));
  if (s.resolution !== null) assert.ok(['caught', 'recovered', 'observed', 'supervised'].includes(s.resolution));
}
function step(s, op) {
  if (s.resolution !== null) return null; // terminal cannot resolve twice
  switch (op) {
    case 'forward': return {...s, owner: 'caller', steps:s.steps + 1};
    case 'trap': return s.mode === 'throw'
      ? {...s, owner:'result', mode:'returned-err', steps:s.steps + 1} : null;
    case 'catch': return s.mode === 'throw'
      ? {...s, owner:null, resolution:'caught', steps:s.steps + 1} : null;
    case 'recover': return ['throw', 'raise'].includes(s.mode)
      ? {...s, owner:null, resolution:'recovered', steps:s.steps + 1} : null;
    case 'delegate': return ['throw', 'raise'].includes(s.mode)
      ? {...s, owner:'caller', steps:s.steps + 1} : null;
    case 'route-supervisor': return s.mode === 'panic'
      ? {...s, owner:'supervisor', steps:s.steps + 1} : null;
    case 'supervise': return s.mode === 'panic' && s.owner === 'supervisor'
      ? {...s, owner:null, resolution:'supervised', steps:s.steps + 1} : null;
    case 'consume-result': return s.mode === 'returned-err' && s.owner === 'result'
      ? {...s, owner:null, resolution:'observed', steps:s.steps + 1} : null;
    default: throw new Error('unknown action');
  }
}
const ACTIONS = ['forward','trap','catch','recover','delegate','route-supervisor','supervise','consume-result'];
function explore(kind, depth) {
  const origin = newIncident(kind);
  let layer = [origin], checked = 0;
  const key = s => JSON.stringify([s.originKind,s.mode,s.owner,s.resolution]);
  const seen = new Set();
  for (let i=0;i<=depth;i++) {
    const next = [];
    for (const state of layer) {
      invariant(state,origin);
      checked++;
      for (const action of ACTIONS) {
        const moved = step(state, action);
        if (moved) {
          invariant(moved,origin);
          if (!seen.has(key(moved))) {
            seen.add(key(moved));
            next.push(moved);
          }
        }
      }
    }
    layer = next;
  }
  return checked;
}

test('bounded reachability preserves single-owner accountability for every failure kind',()=>{
  for (const kind of KINDS) assert.ok(explore(kind,8)>0);
});
test('ordinary trap makes a checked result owner, not a success',()=>{
  const src=newIncident('throw'); const out=step(src,'trap');
  assert.equal(out.owner,'result'); assert.equal(out.mode,'returned-err');
  assert.equal(out.originKind,'throw'); invariant(out,src);
  assert.equal(step(out,'catch'),null);
  assert.equal(step(out,'consume-result').resolution,'observed');
});
test('raise/panic cannot be consumed by catch or trap',()=>{
  for(const kind of ['raise','panic']) {
    for(const op of ['catch','trap']) assert.equal(step(newIncident(kind),op),null);
  }
});
test('panic cannot be locally recovered and needs supervisor policy',()=>{
  const s=newIncident('panic');
  assert.equal(step(s,'recover'),null);
  const routed=step(s,'route-supervisor');
  assert.equal(routed.owner,'supervisor');
  assert.equal(step(routed,'supervise').resolution,'supervised');
});
test('delegating recover retains pending ownership rather than resolving',()=>{
  const s=newIncident('raise');
  const delegated=step(s,'delegate');
  assert.equal(delegated.resolution,null);
  assert.equal(delegated.owner,'caller');
});
test('a terminal incident cannot be resolved twice',()=>{
  const handled=step(newIncident('throw'),'catch');
  for(const op of ACTIONS) assert.equal(step(handled,op),null);
});
test('malicious dropped, duplicated, reclassified and replaced incidents violate the invariant',()=>{
  for (const mutate of [
    s=>({...s,owner:null}),
    s=>({...s,owner:'frame',resolution:'caught'}),
    s=>({...s,originKind:'panic'}),
    s=>({...s,payload:{marker:'same-original-object'}}),
  ]) {
    const initial=newIncident('throw');
    assert.throws(()=>invariant(mutate(initial),initial));
  }
});
test('a live unobserved Result remains pending, not falsely certified resolved',()=>{
  const original=newIncident('throw');
  const s=step(original,'trap');
  invariant(s,original);
  assert.equal(s.owner,'result');
  assert.equal(s.resolution,null);
  assert.notEqual(s.resolution,'observed');
});
