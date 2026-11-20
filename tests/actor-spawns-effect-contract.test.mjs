// Host-only reference obligations: NOT a production AttoLang parser, checker,
// compiled .atto guest test, or backend parity certification.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const registry = JSON.parse(readFileSync(
  new URL('../contracts/actor-spawns-effect-v1.json', import.meta.url), 'utf8'
));

// Closed-world reference model for the *static effect* obligation. Runtime
// permissions are deliberately excluded: a type effect never grants a cap.
function check_effect_graph(nodes) {
  const effects = Object.fromEntries(Object.keys(nodes).map(name => [name, false]));
  // Least fixed point, including mutually recursive call chains.
  let changed = true;
  while (changed) {
    changed = false;
    for (const [name, f] of Object.entries(nodes)) {
      const may_spawn = Boolean(f.direct_spawn) ||
        (f.calls ?? []).some(c => c.kind === 'call' &&
          (c.target ? Boolean(nodes[c.target]?.declares_spawns) || effects[c.target] : Boolean(c.may_spawn)));
      if (may_spawn && !effects[name]) {
        effects[name] = true;
        changed = true;
      }
    }
  }
  const failures = {};
  for (const [name, f] of Object.entries(nodes)) {
    const diag = [];
    if (effects[name] && !f.declares_spawns) diag.push('E_SPAWNS_REQUIRED');
    if (f.declares_spawns && f.pure) diag.push('E_PURE_SPAWNS');
    if (f.duplicate_spawns) diag.push('E_SPAWNS_DUPLICATE');
    if (f.direct_spawn && f.in_critical) diag.push('E_SPAWN_IN_CRITICAL');
    if (diag.length) failures[name] = diag;
  }
  return {effects, failures};
}

test('registry explicitly labels target status, not guest verification', () => {
  assert.equal(registry.schema, 'atto.actor.spawns-effect.contract.v1');
  assert.equal(registry.status, 'TARGET_NOT_COMPILER_OR_GUEST_VERIFIED');
  assert.equal(registry.source_cases.length, 14);
  assert.equal(registry.runtime_cases.length, 5);
  assert.equal(new Set(registry.source_cases.map(c => c.id)).size, 14);
  for (const [backend, status] of Object.entries(registry.verification)) {
    assert.equal(status, 'NOT_EXECUTED', backend);
  }
});

test('all source cases specify target outcomes and negative diagnostics', () => {
  const allowed = new Set(['ACCEPT', 'REJECT']);
  const expectedCodes = new Set([
    'E_SPAWNS_REQUIRED', 'E_PURE_SPAWNS',
    'E_SPAWNS_DUPLICATE', 'E_SPAWNS_EFFECT_MISMATCH',
    'E_SPAWN_IN_CRITICAL'
  ]);
  for (const c of registry.source_cases) {
    assert.ok(c.id && c.source && c.rationale);
    assert.equal(c.phase, 'compiler_source_target');
    assert.ok(allowed.has(c.expected), c.id);
    if (c.expected === 'REJECT') assert.ok(expectedCodes.has(c.code), c.id);
    else assert.equal(c.code, undefined, c.id);
  }
  for (const required of ['reject-unmarked-main', 'reject-unmarked-handler',
    'reject-indirect-helper', 'reject-callback-erasure',
    'reject-inside-critical', 'accept-actor-receive',
    'accept-suspends-alias', 'accept-mailbox-effect-boundary']) {
    assert.ok(registry.source_cases.some(c => c.id === required), required);
  }
});

test('direct, indirect, mutually recursive, and opaque callback effects', () => {
  const r = check_effect_graph({
    creator: {declares_spawns: true, direct_spawn: true},
    helper: {declares_spawns: true, calls: [{kind:'call',target:'creator'}]},
    entry: {declares_spawns: false, calls: [{kind:'call',target:'helper'}]},
    cycle_a: {declares_spawns: false, calls: [{kind:'call',target:'cycle_b'}]},
    cycle_b: {declares_spawns: true, direct_spawn:true,
      calls: [{kind:'call',target:'cycle_a'}]},
    callback: {declares_spawns: false, calls: [{kind:'call',may_spawn:true}]}
  });
  assert.equal(r.effects.creator, true);
  assert.equal(r.effects.entry, true);
  assert.deepEqual(r.failures, {
    entry:['E_SPAWNS_REQUIRED'],
    cycle_a:['E_SPAWNS_REQUIRED'],
    callback:['E_SPAWNS_REQUIRED']
  });
});

test('declared spawns is an upper bound even when the callee does not actually spawn', () => {
  const r = check_effect_graph({
    future_factory: {declares_spawns: true},
    unmarked: {declares_spawns: false, calls:[{kind:'call',target:'future_factory'}]},
    marked: {declares_spawns: true, calls:[{kind:'call',target:'future_factory'}]}
  });
  assert.deepEqual(r.failures, {unmarked:['E_SPAWNS_REQUIRED']});
  assert.equal(r.effects.unmarked,true);
});

test('actor mailbox delivery does not carry handler effects into sender', () => {
  const r = check_effect_graph({
    handler: {declares_spawns:true, direct_spawn:true},
    sender: {declares_spawns:false,
      calls:[{kind:'message',target:'handler'}]}
  });
  assert.equal(r.effects.handler,true);
  assert.equal(r.effects.sender,false);
  assert.deepEqual(r.failures,{});
});

test('declarations cannot bypass purity, duplicates or critical safeguards', () => {
  const r = check_effect_graph({
    pure_creator:{declares_spawns:true,pure:true,direct_spawn:true},
    duplicate:{declares_spawns:true,duplicate_spawns:true},
    critical:{declares_spawns:true,direct_spawn:true,in_critical:true},
    declared_upper_bound:{declares_spawns:true}
  });
  assert.deepEqual(r.failures,{
    pure_creator:['E_PURE_SPAWNS'],
    duplicate:['E_SPAWNS_DUPLICATE'],
    critical:['E_SPAWN_IN_CRITICAL']
  });
  assert.equal(r.effects.declared_upper_bound,false);
});

test('runtime matrix is explicitly unexecuted and fail closed', () => {
  const ids = new Set(registry.runtime_cases.map(c => c.id));
  for (const id of ['tenant-denied','tenant-cross-boundary',
    'quota-exhaustion','parent-retire-race','delivered-not-completed']) {
    assert.ok(ids.has(id),id);
  }
  for (const c of registry.runtime_cases) {
    assert.ok(c.trigger && c.expected && c.assert.length>=1);
  }
});
