// HOST-ONLY design-by-contract target registry validation.
// This does NOT execute an AttoLang compiler or a guest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync(new URL('../conformance/design-by-contract-v1.json', import.meta.url), 'utf8'));
const doc = readFileSync(new URL('../language/design-by-contract-v1.md', import.meta.url), 'utf8');
const expectedPhases = new Set(['guest_positive', 'guest_negative_runtime', 'compile_negative']);
const required = [
  'requires_positive', 'ensures_result', 'caret_return', 'bullet_header', 'effect_begin',
  'conditional_return_edges', 'result_early_exit', 'class_invariant', 'sealed_state_invariant',
  'stream_handle_scope', 'release_runtime_check', 'postcondition_failure', 'invariant_failure',
  'actor_control_notice', 'trap_cannot_intercept', 'precondition_not_bool',
  'postcondition_not_bool', 'mutating_predicate', 'io_predicate', 'await_in_contract',
  'ownership_move_contract', 'actor_direct_state', 'shadow_ensures_binder',
  'unbounded_embedded_predicate', 'unsupported_compiler', 'guarantee_all_normal_edges'
];

test('schema is explicit, proposal-only and non-certifying', () => {
  assert.equal(registry.schema, 'atto.design_by_contract.v1');
  assert.equal(registry.version, 1);
  assert.equal(registry.status, 'proposal_only');
  assert.equal(registry.generated_guest_evidence, false);
  assert.equal(registry.guest_runtime_verified, false);
  assert.match(doc, /NOT_EXECUTED/);
});
test('every backend is marked not executed, without implicit default success', () => {
  assert.deepEqual(Object.keys(registry.backends).sort(), [
    'cranelift', 'forge', 'hdl', 'java', 'js', 'llvm', 'net', 'rs', 'wasm'
  ]);
  for (const [name, status] of Object.entries(registry.backends)) {
    assert.match(name, /^[a-z]+$/);
    assert.equal(status, 'not_executed');
  }
});
test('target cases are complete, unique and non-executed', () => {
  assert.equal(registry.cases.length, 26);
  const ids = registry.cases.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const name of required) assert.ok(ids.includes(name), `missing ${name}`);
  for (const entry of registry.cases) {
    assert.match(entry.id, /^[a-z][a-z0-9_]*$/);
    assert.equal(entry.status, 'not_executed');
    assert.equal(entry.source_kind, 'illustrative_fragment_not_runnable');
    assert.ok(expectedPhases.has(entry.phase), `invalid phase: ${entry.id}`);
    assert.ok(entry.snippet.length > 30, entry.id);
    assert.ok(entry.expected.length > 0, entry.id);
  }
});
test('compile negatives specify fail-closed diagnostics', () => {
  const negatives = registry.cases.filter(c => c.phase === 'compile_negative');
  assert.equal(negatives.length, 10);
  for (const c of negatives) assert.match(c.expected, /^E_[A-Z_]+$/, c.id);
  assert.ok(negatives.some(c => c.expected === 'E_CONTRACT_UNSUPPORTED'));
});
test('runtime failures are typed and actor panic cannot be caught by trap', () => {
  const failures = registry.cases.filter(c => c.phase === 'guest_negative_runtime');
  assert.equal(failures.length, 6);
  assert.ok(failures.some(c => c.expected === 'supervisor_priority_CONTROL_panic'));
  assert.ok(failures.some(c => c.expected === 'trap_does_not_catch_contract_panic'));
  assert.ok(failures.some(c => c.expected === 'ContractViolationError'));
});
test('normative document retains full AOT, ownership, streaming and failure boundaries', () => {
  for (const phrase of [
    'callee side', 'every', 'release', 'full-AOT', 'ContractViolationError',
    'supervisor CONTROL', 'sealed state', 'Stream<T>', 'no guest artifact',
    'No `old(expr)` snapshots', 'no runtime codegen'
  ]) assert.ok(doc.includes(phrase), `missing phrase ${phrase}`);
  assert.ok(!doc.includes('assert!(condition)'), 'would compete with std.assert namespace');
});
