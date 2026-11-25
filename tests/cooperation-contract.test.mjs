import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// SOURCE-FREE oracle; passing here does not prove compiled .atto guest execution.
const fixture = JSON.parse(readFileSync(new URL('../contracts/cooperation/checkpoints.v1.json', import.meta.url)));
const permitted = new Set([128, 256, 512]);
const maxAttempts = 8192;

function execute(c) {
  let committed = 0;
  const slowPolls = [];
  let terminal = 'RUNNING';
  let handoffAt;
  let hardCharges = 0;
  for (let attempt = 1; attempt <= c.attempts; attempt++) {
    // UNTRUSTED hard checks precede every bounded unit; dispatch never refills.
    if (c.mode === 'untrusted') {
      if (c.cancelBeforeStep !== undefined && attempt >= c.cancelBeforeStep) {
        terminal = 'CANCELLED_AT_HARD_BOUNDARY';
        break;
      }
      if (hardCharges >= c.hardFuel) {
        terminal = 'FUEL_EXHAUSTED';
        break;
      }
      hardCharges++;
    }
    committed++;
    if (committed % c.interval !== 0) continue;
    slowPolls.push(committed);
    if (c.mode === 'trusted' && c.cancelBeforeStep !== undefined &&
        committed >= c.cancelBeforeStep) {
      terminal = 'CANCELLED_AT_SOFT_POLL';
      break;
    }
    if (committed >= fixture.softFairnessThreshold && c.peerRunnable === true &&
        committed > (c.criticalThroughStep ?? 0) && handoffAt === undefined) {
      handoffAt = committed;
    }
  }
  return {slowPolls, committed, terminal,
    ...(c.mode === 'untrusted' ? {hardCharges} : {}),
    ...(handoffAt !== undefined ? {handoffAt} : {})};
}

function validate(c) {
  assert.match(c.id, /^[a-z0-9][a-z0-9-]{2,80}$/);
  assert.ok(['trusted','untrusted'].includes(c.mode));
  assert.ok(permitted.has(c.interval));
  assert.ok(Number.isSafeInteger(c.attempts) && c.attempts >= 0 && c.attempts <= maxAttempts);
  assert.ok(Array.isArray(c.slowPolls) && c.slowPolls.every(n => Number.isSafeInteger(n)));
  for (const key of ['hardFuel','cancelBeforeStep','criticalThroughStep','dispatchAfterStep'])
    if (c[key] !== undefined) assert.ok(Number.isSafeInteger(c[key]) && c[key] >= 0);
  if (c.mode === 'untrusted') assert.ok(c.hardFuel >= 0 && c.hardCharges >= 0);
  if (c.peerRunnable !== undefined) assert.equal(typeof c.peerRunnable, 'boolean');
  assert.equal(c.evidence, undefined);
}

test('portable proposed contract declares scope, not guest parity', () => {
  assert.equal(fixture.schema, 'atto.cooperation.checkpoint.contract.v1');
  assert.equal(fixture.status, 'PROPOSED');
  assert.equal(fixture.evidence, 'SOURCE_FREE_MODEL_ONLY_NOT_GUEST_EXECUTION');
  assert.equal(fixture.softFairnessThreshold, 512);
  assert.deepEqual(fixture.allowedIntervals, [128,256,512]);
  assert.equal(fixture.cases.length, 18);
});

test('all uniquely identified fixtures match reference event traces', () => {
  const ids = new Set();
  for (const c of fixture.cases) {
    validate(c);
    assert.ok(!ids.has(c.id), `duplicate fixture ID ${c.id}`);
    ids.add(c.id);
    const {id,mode,interval,attempts,hardFuel,cancelBeforeStep,criticalThroughStep,
      dispatchAfterStep,peerRunnable,...expected} = c;
    assert.deepEqual(execute(c), expected, `checkpoint mismatch: ${id}`);
  }
});

test('expensive slow polls remain amortized beyond 512', () => {
  for (const interval of permitted) {
    const r = execute({mode:'trusted',interval,attempts:maxAttempts});
    assert.equal(r.slowPolls.length,maxAttempts/interval);
    assert.equal(r.slowPolls.at(-1),maxAttempts);
    assert.ok(r.slowPolls.every((v,i) => v === interval*(i+1)));
  }
});

test('untrusted hard fuel/cancellation never wait for soft sampling', () => {
  for (const interval of permitted) {
    for (const hardFuel of [0,1,127,128,129,511,512,513,8192]) {
      const r = execute({mode:'untrusted',interval,attempts:hardFuel+1,hardFuel});
      assert.equal(r.committed,hardFuel);
      assert.equal(r.hardCharges,hardFuel);
      assert.equal(r.terminal,'FUEL_EXHAUSTED');
    }
    const cancelled = execute({mode:'untrusted',interval,attempts:8192,
      hardFuel:8192,cancelBeforeStep:513});
    assert.equal(cancelled.committed,512);
    assert.equal(cancelled.terminal,'CANCELLED_AT_HARD_BOUNDARY');
  }
});

test('delayed cancellation and fuel-refill mutants violate the fixtures', () => {
  const c = fixture.cases.find(x => x.id === 'untrusted-cancel-513');
  const correct = execute(c);
  // Mutant: only look at cancellation during a soft poll.
  const delayed = execute({...c,mode:'trusted'});
  assert.equal(correct.committed,512);
  assert.equal(delayed.committed,640);
  const d = fixture.cases.find(x => x.id === 'untrusted-no-refill-on-dispatch');
  const actual = execute(d);
  assert.equal(actual.terminal,'FUEL_EXHAUSTED');
  assert.equal(actual.committed,129);
  // Mutant: the second physical dispatch gets a fresh hard budget.
  const refilled = Math.min(d.attempts,d.dispatchAfterStep+d.hardFuel);
  assert.equal(refilled,130);
  assert.notEqual(refilled,actual.committed);
  assert.deepEqual(execute(fixture.cases.find(x => x.id === 'trusted-640-next-cold')).slowPolls,
    [128,256,384,512,640]);
});
