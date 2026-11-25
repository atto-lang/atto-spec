import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const registry = JSON.parse(readFileSync(new URL('../contracts/receivers/constructors-and-state.v1.json', import.meta.url)));

test('constructor/receiver/state registry stays non-executable until actual guests pass', () => {
  assert.equal(registry.schema, 'atto.receiver.constructor.state.contract.v1');
  assert.equal(registry.status, 'TARGET_NOT_EXECUTED');
  assert.equal(registry.evidence, 'SOURCE_ONLY_CASES_NOT_GUEST_EXECUTION');
  assert.equal(registry.cases.length, 34);
  const ids = new Set();
  for (const c of registry.cases) {
    assert.match(c.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(!ids.has(c.id), 'duplicate case: ' + c.id);
    ids.add(c.id);
    assert.ok(['accept', 'reject'].includes(c.expected));
    assert.equal(c.verification, 'TARGET_NOT_EXECUTED');
    assert.ok(c.source.includes(';') || c.source.includes('{}'));
    assert.ok(c.reason.length >= 12);
    assert.ok(!Object.hasOwn(c, 'passed'));
  }
  assert.ok(registry.cases.some(c => c.id === 'struct-ctor-missing-field'));
  assert.ok(registry.cases.some(c => c.id === 'class-state-guard-escape'));
  assert.ok(registry.cases.some(c => c.id === 'receiver-actorref-not-sync'));
});

test('new class and struct contracts are distinct, never generalized named-call equals', () => {
  const byId = Object.fromEntries(registry.cases.map(c => [c.id, c]));
  assert.match(byId['class-constructor-new-call'].source, /new C\(5\)/);
  assert.match(byId['struct-default-literal'].source, /T\{foo:/);
  assert.equal(byId['struct-ctor-new'].expected, 'reject');
  assert.equal(byId['struct-constructor-equals-ambiguous'].expected, 'reject');
});

test('three user-approved constructor spellings identify one nominal header', () => {
  const cases = registry.cases.filter(c => [
    'class-constructor-space-owner',
    'class-constructor-space-two-groups',
    'class-constructor-compact-owner'
  ].includes(c.id));
  assert.equal(cases.length, 3);
  const all = cases.map(c => c.source);
  // This subset deliberately has no string literals or comments. A real
  // compiler still has to check source token/AST and guest binary identity.
  const stripped = all.map(src => src.replace(/\s+/g, ''));
  assert.ok(stripped.every(src => src === stripped[0]),
    'whitespace variants must have exactly the same non-whitespace tokens');
  assert.ok(cases.every(c => c.expected === 'accept' && c.verification === 'TARGET_NOT_EXECUTED'));
  const collision = registry.cases.find(c => c.id === 'class-constructor-duplicate-spacing');
  assert.equal(collision.expected, 'reject');
  assert.match(collision.source, /constructor \(Counter\)\(\): self/);
  assert.match(collision.source, /constructor\(Counter\) \(\): self/);
});
