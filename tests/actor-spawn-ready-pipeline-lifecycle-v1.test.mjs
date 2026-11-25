import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const c = JSON.parse(read('contracts/actor-spawn-ready-pipeline-lifecycle-v1.json'));
const spec = read('language/actor-spawn-ready-pipe-lifecycle-v1.md');

test('every target is explicitly unverified until real guest receipts exist', () => {
 assert.equal(c.schema_version,1);
 assert.equal(c.status,'TARGET_NOT_EXECUTED');
 assert.equal(c.backend_targets.length,11);
 assert.equal(new Set(c.backend_targets.map(x=>x.repo)).size,11);
 assert.equal(c.no_claim_of_backend_parity,true);
 for (const x of c.backend_targets) {
  assert.match(x.repo, /^atto-lang\/atto-source\.[a-z]+$/);
  assert.equal(x.guest_execution,'NOT_EXECUTED');
 }
});

test('normative distinction between spawn, READY, pipe, STOP and DONE is preserved', () => {
 for(const q of ['spawn_publishes_registered_ports_before_return','pipe_admission_never_waits_for_ready','no_data_dispatch_before_receiver_ready','bounded_data_backpressure','failed_startup_never_publishes_ready','failure_propagates_to_pipeline_completion','stop_fences_new_admission_but_drains_accepted_data','done_waits_tear_down_descendants_loans_and_carriers','duplicate_unicast_edge_checked_rollback','tenant_and_generation_checked','future_subscriptions_once_and_late','unsupported_backend_no_guest_artifact']) assert.ok(c.required_invariants.includes(q),q);
 assert.deepEqual(c.forbidden_aliases,['actor.ready','actor.done']);
 for(const phrase of ['get_ready()','get_done()','await spawn','pipe!','rpipe!','stop!','STARTING','READY','DONE','NOT']) assert.ok(spec.includes(phrase),phrase);
 assert.match(spec,/not a claim of executable compiler\/backend parity/i);
});
