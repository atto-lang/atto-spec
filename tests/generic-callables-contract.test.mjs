import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const registry = JSON.parse(await readFile(
  new URL('../conformance/generic-callables-v1.json', import.meta.url), 'utf8'
));

test('generic callable contract is a bounded, non-certifying fixture registry', () => {
  assert.equal(registry.contract, 'generic-callables-v1');
  assert.equal(registry.status, 'TARGET_ONLY');
  assert.equal(registry.backend_evidence, 'NOT_EXECUTED');
  assert.ok(registry.cases.length >= 25);
  const ids = new Set();
  const features = new Set();
  const expectations = new Set();
  for (const entry of registry.cases) {
    assert.match(entry.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(!ids.has(entry.id), 'duplicate case id: ' + entry.id);
    ids.add(entry.id);
    assert.ok(['accept','reject','gate'].includes(entry.expectation));
    assert.equal(entry.status, 'NOT_EXECUTED', 'no host-only proof may be marked PASS');
    assert.equal(typeof entry.source, 'string');
    assert.ok(entry.source.length > 10 && entry.source.length < 65536);
    features.add(entry.feature);
    expectations.add(entry.expectation);
  }
  for (const feature of ['colon','arrow','colon_arrow','arrow_end','return',
                         'inference','named','defaults','nested','methods',
                         'binder','constraints','syntax','abi']) {
    assert.ok(features.has(feature), 'missing generic audit dimension: ' + feature);
  }
  assert.deepEqual([...expectations].sort(), ['accept','gate','reject']);
});

test('the two signature spellings and every body style remain distinct cases', () => {
  const byId = Object.fromEntries(registry.cases.map(c => [c.id, c]));
  assert.match(byId.colon_braces.source, /<T>\(T value\): T \{/);
  assert.match(byId.arrow_braces.source, /<T>\(T value\) -> T \{/);
  assert.match(byId.colon_arrow_braces.source, /<T>\(T value\): T -> \{/);
  assert.match(byId.arrow_end_tail.source, /-> T value end/);
  assert.match(byId.arrow_end_double_colon.source, /-> T :: value end/);
  assert.equal(byId.empty_generic_return.expectation, 'reject');
  assert.equal(byId.empty_generic_end.expectation, 'reject');
});


test('Go-style generic-method regression and independent dispatch gates are pinned', () => {
  const byId = Object.fromEntries(registry.cases.map(c => [c.id, c]));
  const accept = ['nongeneric_receiver_generic_method',
    'generic_receiver_independent_method','generic_receiver_uses_two_binders',
    'generic_receiver_static_method','generic_method_with_independent_bound',
    'serial_actor_local_generic_helper'];
  const reject = ['method_reuses_receiver_type_name',
    'duplicate_method_type_parameter','method_unbound_return_type'];
  const gate = ['generic_method_dynamic_interface_witness',
    'generic_method_open_world_interface_call','generic_bound_method_value',
    'uninstantiated_generic_method_value','generic_actor_message_dispatch'];
  for (const id of accept) assert.equal(byId[id]?.expectation, 'accept', id);
  for (const id of reject) assert.equal(byId[id]?.expectation, 'reject', id);
  for (const id of gate) assert.equal(byId[id]?.expectation, 'gate', id);
  for (const id of [...accept,...reject,...gate])
    assert.equal(byId[id]?.status, 'NOT_EXECUTED', id);
  assert.match(byId.generic_receiver_uses_two_binders.source, /Box<T>.*replace<U>\(T old_value,U new_value\)/);
  assert.match(byId.generic_method_open_world_interface_call.source, /target\.transform<U>\(value\)/);
  assert.match(byId.uninstantiated_generic_method_value.source, /return u\.identity;/);
  assert.match(byId.serial_actor_local_generic_helper.source, /define serial actor/);
});
