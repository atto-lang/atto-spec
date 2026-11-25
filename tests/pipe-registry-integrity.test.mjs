// Host-only registry integrity. Does not execute compiler or guest pipelines.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../conformance/pipe-observer-lifecycle-v1.json',import.meta.url),'utf8'));
const IDs=new Set(c.cases.map(x=>x.id));
test('versioned pipeline lifecycle registry is complete and non-duplicated',()=>{
  assert.equal(c.schemaVersion,1);
  assert.equal(c.feature,'checked-pipe-observer-lifecycle');
  assert.equal(c.caseCount,c.cases.length);
  assert.equal(IDs.size,c.cases.length);
  assert.ok(c.cases.length>=30);
  assert.equal(c.status,'candidate-contract-no-guest-parity');
  assert.deepEqual(c.backends,['java','llvm','net','rust-wasm','forge']);
});
test('every scenario has a phase, observed contract and honest evidence state',()=>{
  for(const row of c.cases){
    assert.match(row.id,/^[a-z][a-z0-9-]+$/);
    assert.ok(['parse','compile','runtime'].includes(row.phase));
    assert.ok(['accept','reject','runtime-check'].includes(row.expect));
    assert.equal(row.status,'target-not-verified');
    assert.ok(row.assertion.length>=25,row.id);
    if(row.phase==='runtime')assert.equal(row.expect,'runtime-check',row.id);
  }
});
test('races, ownership, effects, supervision, security, and direction are covered',()=>{
  for(const id of [
    'direction-forward','direction-reverse','direction-io-pipe',
    'observer-terminal-forward','observer-terminal-reverse','event-early',
    'event-late-replay','event-priority','settled-tagged','get-done-shared',
    'first-cause-wins','cancel-barrier','eof-drain-failure',
    'partial-prefix','indeterminate-write','linear-release',
    'data-result-err','trap-async','actor-panic-control','callback-permission'
  ])assert.ok(IDs.has(id),id);
});
test('receipts prohibit counting parser-only and zero-step CI as guest parity',()=>{
  for(const field of [
    'source_commit_sha','source_tree_sha','compiler_version','backend_name',
    'guest_executed_boolean','executed_steps_nonzero',
    'observed_event_sequence','supervisor_control_receipt_if_applicable'
  ])assert.ok(c.receiptRequirements.includes(field),field);
});
