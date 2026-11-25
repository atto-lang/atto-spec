import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const corpus = JSON.parse(readFileSync(
  new URL('../conformance/void-early-return-v1.json', import.meta.url), 'utf8'));
const backends = ['rust_wasm', 'java', 'llvm', 'net', 'forge'];
const byId = new Map(corpus.cases.map(c => [c.id, c]));

test('16 independent proposed vectors retain honest evidence statuses', () => {
  assert.equal(corpus.schemaVersion, 1);
  assert.equal(corpus.status, 'normative-proposed-not-executed');
  assert.equal(corpus.cases.length, 16);
  assert.equal(byId.size, 16, 'case ids must be unique');
  for (const c of corpus.cases) {
    assert.match(c.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(c.source.endsWith('\n'), c.id);
    assert.match(c.source, /\.atto|fnc /, c.id);
    assert.equal(c.expect === 'accept' || c.expect === 'reject', true, c.id);
    if (c.expect === 'accept') {
      assert.equal(c.phase, 'execute');
      assert.equal(c.expectedReturn, 42);
    } else {
      assert.ok(['parse', 'typecheck'].includes(c.phase));
      assert.equal(typeof c.diagnostic, 'string');
    }
    for (const backend of backends) {
      assert.equal(c.verification[backend], 'not_executed',
        c.id + '/' + backend + ': host schema is not guest execution');
    }
  }
});

test('both if families and explicit void are independently covered', () => {
  assert.match(byId.get('brace-bare').source, /if true \{ \^ \}/);
  assert.match(byId.get('brace-explicit').source, /if true \{ \^ void;/);
  assert.match(byId.get('procedural-bare').source, /do if true then \^ fi/);
  assert.match(byId.get('procedural-explicit').source, /do if true then \^ void fi/);
  assert.match(byId.get('keyword-return-void').source, /return void;/);
  assert.match(byId.get('nested-brace-in-fi').source, /if true then if true \{ \^ void; \} fi/);
});

test('void is no expression and must fail in every nonvoid return', () => {
  for (const id of [
    'nonvoid-caret-void',
    'nonvoid-keyword-void',
    'nonvoid-branch-void',
    'nonvoid-procedural-void'
  ]) {
    assert.equal(byId.get(id).expect, 'reject');
    assert.equal(byId.get(id).diagnostic, 'return-type-mismatch');
  }
  for (const id of ['reject-void-value', 'reject-void-plus']) {
    assert.equal(byId.get(id).expect, 'reject');
  }
});
