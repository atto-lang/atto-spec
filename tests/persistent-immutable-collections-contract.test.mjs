// Source-only integrity check. Never report this as guest conformance.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const registry = JSON.parse(readFileSync(resolve(root, 'contracts/persistent-immutable-collections-v1/cases.json'), 'utf8'));

test('immutable collections target registry is complete and honestly unexecuted', () => {
  assert.equal(registry.contract, 'persistent-immutable-collections-v1');
  assert.equal(registry.cases.length, 7);
  const ids = new Set();
  for (const item of registry.cases) {
    assert.match(item.id, /^[a-z][a-z0-9_]*$/);
    assert.ok(!ids.has(item.id));
    ids.add(item.id);
    assert.ok(['guest_success','compile_reject'].includes(item.kind));
    assert.equal(item.status, 'NOT_EXECUTED');
    const src = readFileSync(resolve(root, 'contracts/persistent-immutable-collections-v1', item.path), 'utf8');
    assert.match(src, /TARGET only.*NOT_EXECUTED/);
    assert.match(src, /fnc main\(\) -> int/);
    if (item.kind === 'compile_reject') assert.match(item.diagnostic, /^E_/);
    else assert.ok(Number.isInteger(item.expected_exit));
  }
});

test('spec retains literal, qualifier, ownership, and no-false-pass boundaries', () => {
  const doc = readFileSync(resolve(root, 'language/persistent-immutable-collections-v1.md'), 'utf8');
  for (const token of ['const Vector<int> foo = [];', 'val Vector<int>', 'let Vector<int>', 'const mut Vector<int>', 'append'+'ed', 'updated', 'E_PERSISTENT_OWNERSHIP', 'share!', 'NOT_EXECUTED']) {
    assert.ok(doc.includes(token), 'missing contract token: '+token);
  }
});
