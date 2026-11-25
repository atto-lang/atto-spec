import assert from 'node:assert/strict';
import test from 'node:test';
import {loadRegistry,validateRegistry} from './validate_ownership_lifetimes.mjs';
const baseline=loadRegistry();
const invalid=(name,edit)=>test(name,()=>{
  const d=structuredClone(baseline);edit(d);
  assert.throws(()=>validateRegistry(d),{name:'AssertionError'});
});
test('accepted proposed registry is not proof of compiled guest support',()=>{
  assert.equal(validateRegistry(structuredClone(baseline)),20);
});
invalid('rejects forged implementation and release claims',d=>{d.implemented=true;});
invalid('rejects forged guest execution claim',d=>{d.compiled_guest_proof=true;});
invalid('rejects invented backend success',d=>{d.backend_status['rust-wasm']='PASS';});
invalid('rejects silently missing fixture',d=>{d.cases.pop();});
invalid('rejects duplicate case IDs',d=>{d.cases[1].id=d.cases[0].id;});
invalid('rejects obsolete ambiguous accept/reject label',d=>{d.cases[0].target='accept';});
invalid('rejects falsely executable fragments',d=>{d.cases[0].source_kind='compilable_fixture';});
invalid('rejects runtime send rejection presented as compile rejection',d=>{d.cases.find(c=>c.id==='actor-send-rejected').expected_outcome='compile_reject';});
invalid('rejects lost payload-on-rejection observation',d=>{d.cases.find(c=>c.id==='actor-send-rejected').required_observations.pop();});
invalid('rejects cleanup double-drop obligation weakened',d=>{d.cases.find(c=>c.id==='unwinding-no-double-drop').required_observations[1]='drop_optional';});
invalid('rejects missing runtime observations',d=>{delete d.cases.find(c=>c.id==='panic-control-only').required_observations;});
invalid('rejects an owned child mistaken for a copied scalar',d=>{d.cases.find(c=>c.id==='box-nested-return-escape').source='return r.scalar;';});

invalid('rejects inverted use-after-move expected outcome',d=>{d.cases.find(c=>c.id==='box-use-after-take').expected_outcome='compile_accept';});
invalid('rejects invented cross-backend precedent',d=>{d.cases.find(c=>c.id==='arc-share-immutable').precedent='partial-rust-wasm-pr-139-or-157';});
invalid('rejects loss of proven partial precedent',d=>{delete d.cases.find(c=>c.id==='receiver-nested-alias').precedent;});
