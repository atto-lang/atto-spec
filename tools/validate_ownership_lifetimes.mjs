import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const allowedAreas=new Set(['box','arc','alias','control-flow','actor','suspension','failure']);
const outcomes=new Set(['compile_accept','compile_reject','runtime_success','runtime_invariant']);
const mandatoryCaseIds=[
  'box-owner-transfer','box-use-after-take','box-loan-after-drop','box-nested-return-escape',
  'arc-share-immutable','arc-share-mutable','arc-mutate-through-read',
  'receiver-nested-alias','ternary-join-moves','loop-backedge-move',
  'actor-send-owned','actor-send-rejected','actor-send-loan','actor-serializable-not-sendable',
  'await-borrow-live','select-write-loan','critical-write-await',
  'panic-control-only','raise-recover-boundary','unwinding-no-double-drop'
];
const mandatoryEvents=new Map([
  ['actor-send-owned',['mailbox_admission_accepted','sender_transfer_committed_once','receiver_owner_created_once']],
  ['actor-send-rejected',['mailbox_admission_rejected','payload_owned_by_exactly_one_party','sender_recovers_or_retains_payload']],
  ['panic-control-only',['actor_panic','supervisor_control_admit','actor_does_not_intercept_panic']],
  ['raise-recover-boundary',['raise_not_caught_by_try','nearest_recover_invoked','cleanup_run_once']],
  ['unwinding-no-double-drop',['controlled_unwind','drop_count_exactly_one','no_fatal_trap_cleanup_claim']]
]);
export function validateRegistry(d){
  assert.equal(d.schema,'atto.ownership.lifetimes.proposal.v1');
  assert.equal(d.status,'PROPOSED_NOT_ACCEPTED');
  assert.equal(d.implemented,false);
  assert.equal(d.compiled_guest_proof,false);
  assert.equal(d.executable_fixtures,false);
  assert.equal(d.binary_release_approved,false);
  assert.equal(d.evidence_classification,'SPEC_PROPOSAL');
  assert.equal(d.source_of_truth,'language/owned-shared-handles-and-suspension-v1.md');
  assert.equal(d.registry_purpose,'proposed behavioral obligations only; not a compilable fixture suite or backend execution receipt');
  assert.deepEqual(d.backend_targets,['java','llvm','rust-wasm','forge','net']);
  assert.deepEqual(d.backend_status,Object.fromEntries(d.backend_targets.map(b=>[b,'NOT_EXECUTED'])));
  assert.ok(Array.isArray(d.cases));
  assert.deepEqual([...d.cases.map(c=>c.id)].sort(),[...mandatoryCaseIds].sort());
  assert.equal(new Set(d.cases.map(c=>c.id)).size,mandatoryCaseIds.length);
  for(const c of d.cases){
    assert.match(c.id,/^[a-z][a-z0-9-]+$/,c.id);
    assert.ok(allowedAreas.has(c.area),c.id);
    assert.ok(outcomes.has(c.expected_outcome),c.id);
    assert.equal(c.source_kind,'illustrative_fragment',c.id);
    assert.equal(c.proof_state,'NOT_EXECUTED',c.id);
    assert.ok(!('target' in c)&&!('current' in c),c.id+': ambiguous legacy status');
    assert.ok(typeof c.source==='string'&&c.source.length>=15,c.id);
    assert.ok(typeof c.rule==='string'&&c.rule.length>12,c.id);
    if('precedent' in c)assert.equal(c.precedent,'partial-rust-wasm-pr-139-or-157',c.id);
    if(c.expected_outcome.startsWith('runtime_')){
      assert.ok(Array.isArray(c.required_observations)&&c.required_observations.length>=2,c.id);
      assert.equal(new Set(c.required_observations).size,c.required_observations.length,c.id);
      for(const event of c.required_observations)assert.match(event,/^[a-z][a-z0-9_]+$/,c.id);
    } else {
      assert.ok(!('required_observations' in c),c.id);
    }
    if(mandatoryEvents.has(c.id)){
      assert.deepEqual(c.required_observations,mandatoryEvents.get(c.id),c.id);
    }
  }
  const byId=Object.fromEntries(d.cases.map(c=>[c.id,c]));
  assert.equal(byId['actor-send-rejected'].expected_outcome,'runtime_invariant');
  assert.equal(byId['unwinding-no-double-drop'].expected_outcome,'runtime_invariant');
  assert.equal(byId['actor-send-owned'].expected_outcome,'runtime_success');
  assert.equal(byId['box-nested-return-escape'].expected_outcome,'compile_reject');
  assert.match(byId['box-nested-return-escape'].source,/owned_child/);
  assert.match(byId['actor-send-rejected'].rule,/recoverable owner/);
  return d.cases.length;
}
export function loadRegistry(){
  return JSON.parse(readFileSync(new URL('../language/ownership-lifetimes-v1.json',import.meta.url),'utf8'));
}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]){
  const count=validateRegistry(loadRegistry());
  console.log('PASS proposal-only ownership registry: '+count+' unexecuted cases, compiler/runtime outcomes distinguished');
}
