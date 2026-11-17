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
