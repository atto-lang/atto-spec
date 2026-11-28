import test from 'node:test';
import assert from 'node:assert/strict';

// Specification reference only: not an Atto parser, checker, or guest.
function select(input, arms) {
  const subject = input();
  for (const arm of arms) {
    const pre = arm.pattern(subject);
    if (pre === null || !arm.guard(pre)) continue;
    const post = arm.alias(subject);
    return arm.body(pre, post);
  }
  throw new Error('nonexhaustive');
}
const wildcard = () => ({});
const identity = x => x;
const guard = (condition, body) => ({pattern: wildcard, guard: condition, alias: identity, body});

test('guard aliases read the subject, not the predicate result', () => {
  assert.equal(select(() => [10, 20], [guard(() => 10 === 10, (_, [x, y]) => x + y)]), 30);
  assert.equal(select(() => 42, [guard(() => true, (_, x) => x)]), 42);
});
test('pattern before guard, alias after success, subject exactly once', () => {
  const trace = [];
  const arm = (accept) => ({
    pattern: x => { trace.push('pattern'); return {x}; },
    guard: ({x}) => { trace.push('guard'); assert.equal(x, 42); return accept; },
    alias: x => { trace.push('alias'); return x; },
    body: (_, x) => { trace.push('body'); return x; }
  });
  assert.equal(select(() => { trace.push('subject'); return 42; }, [arm(false), arm(true)]), 42);
  assert.deepEqual(trace, ['subject', 'pattern', 'guard', 'pattern', 'guard', 'alias', 'body']);
});
test('transformed subject differs from captured original input', () => {
  const n = 21;
  assert.equal(select(() => n * 2, [guard(() => n === 21, (_, x) => x)]), 42);
});
test('failed pattern suppresses its guard, alias and body', () => {
  const fail = () => { throw new Error('unselected arm evaluated'); };
  assert.equal(select(() => 42, [{pattern: () => null, guard: fail, alias: fail, body: fail}, guard(() => true, (_, x) => x)]), 42);
});
test('classification trichotomy is disjoint at signed integer boundaries', () => {
  const values = [-(1n << 63n), -100n, -1n, 0n, 1n, 100n, (1n << 63n) - 1n];
  for (const n of values) {
    const predicates = [n === 0n, n > 0n, n < 0n];
    assert.equal(predicates.filter(Boolean).length, 1);
    const got = select(() => n, predicates.map((p, i) => guard(() => p, (_, x) => [i, x])));
    assert.deepEqual(got, [n === 0n ? 0 : n > 0n ? 1 : 2, n]);
  }
});
test('classification test detects swapped and cancelling branch errors', () => {
  const oldOracle = v => v.reduce((a, b) => a + b, 0) === 42;
  const newOracle = v => v[0] === 1 && v[1] === 20 && v[2] === 21;
  assert.equal(oldOracle([1, 21, 20]), true);
  assert.equal(oldOracle([2, 19, 21]), true);
  assert.equal(newOracle([1, 21, 20]), false);
  assert.equal(newOracle([2, 19, 21]), false);
  assert.equal(newOracle([1, 20, 21]), true);
});
