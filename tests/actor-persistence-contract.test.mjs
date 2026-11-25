// Host-only contract integrity tests; these DO NOT run an AttoLang compiler or disk runtime.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c = JSON.parse(readFileSync(new URL('../conformance/actor-persistence-v1.json', import.meta.url)));
test('actor persistence fixture contract is explicit and unique', () => {
  assert.equal(c.status, 'TARGET_ONLY_NOT_EXECUTED_BY_BACKEND');
  assert.equal(c.schema, 'atto.actor-persistence.spec-cases.v1');
  const ids = c.cases.map(x => x.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const x of c.cases) {
    assert.ok(['parse','typecheck','runtime'].includes(x.phase), x.id);
    assert.ok(['accept','reject','recover','rollback','guard'].includes(x.expect), x.id);
    assert.ok(x.source || x.scenario, x.id);
    if (x.expect === 'reject') assert.ok(x.diagnostic, x.id);
  }
});
test('language modes cannot be conflated by fixtures', () => {
  const byId = Object.fromEntries(c.cases.map(x => [x.id,x]));
  assert.match(byId['durable-actor-marker'].source, /define durable actor/);
  assert.match(byId['persistent-actor-marker'].source, /define persistent actor/);
  assert.equal(byId['persistent-missing-hooks'].diagnostic, 'E_PERSIST_HOOKS');
  assert.equal(byId['durable-hook-override'].diagnostic, 'E_DURABLE_HOOK_OVERRIDE');
  for (const needed of ['E_NON_PERSISTABLE_STATE','E_CHECKPOINT_BOUNDARY','E_STALE_ACTOR_EPOCH','E_PERSISTENCE_IO'])
    assert.ok(c.cases.some(x => x.diagnostic === needed), needed);
  for (const expected of ['durable-restart-after-commit','durable-restart-before-commit','external-effect-replay'])
    assert.ok(byId[expected], expected);
});
