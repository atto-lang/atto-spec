// Host-only contract checks. This is NOT guest-source compilation or execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const contract = JSON.parse(readFileSync(
  new URL('../conformance/class-proxy-interception-v1.json', import.meta.url),
  'utf8'
));
const knownBackends = ['java','llvm','wasm','forge','net','rust_cranelift','js'];
const expectedIds = [
  'construct-once',
  'virtual-override-once',
  'typed-proceed-once',
  'typed-around-short-circuit',
  'panic-control-not-intercepted',
  'target-self-call-bypass',
  'reject-second-proceed',
  'reject-proceed-escape',
  'reject-effect-narrowing',
  'reject-ambiguous-slot',
  'reject-opaque-return-escape',
  'reject-alias-return-escape',
  'reject-reserved-receiver-shadowing',
  'reject-private-member-export',
  'reject-actor-target',
  'reject-implicit-proxy-to-target',
  'typed-before-hook-constructor-once',
  'typed-before-hook-order',
  'reject-before-hook-noncopyable-argument',
  'reject-before-hook-extra-slot',
  'reject-before-hook-invalid-signature',
  'reject-runtime-hook-inference',
  'typed-before-local-helper-chain',
  'reject-before-recursive-helper',
  'reject-before-indirect-dispatch',
  'reject-before-hidden-suspension',
  'reject-before-shadowed-builtin-stdio',
  'affine-proceed-state-consumption',
  'affine-short-circuit-zero-proceed',
  'affine-reentrant-proceed-rejection',
  'affine-cross-invocation-token-rejection',
  'affine-proceed-capture-rejection',
  'affine-proceed-suspend-rejection',
  'affine-proceed-generation-fence',
  'affine-proceed-concurrent-once',
  'affine-nested-proxy-order',
  'affine-proceed-failure-control',
  'typed-before-multiple-instances-one-class',
  'typed-before-shared-helper-graph',
  'reject-before-oversized-helper-table',
  'reject-before-deep-ast-unbounded-prepass',
  'reject-before-implicit-divide-effects',
  'reject-before-void-helper-parameter',
  'reject-proxy-deep-generic-signature-overflow',
  'preserve-proxy-program-exports',
  'reject-proxy-protected-nominal-collision',
  'reject-proxy-annotated-class-policy',
  'reject-proxy-critical-method',
  'reject-before-shared-helper-depth-cache-bypass'
];

test('proxy interception candidate has stable coverage and no fictitious execution receipt', () => {
  assert.equal(contract.schemaVersion, 1);
  assert.equal(contract.feature, 'class-proxy-virtual-interception');
  assert.equal(contract.status, 'candidate_not_implemented');
  assert.equal(contract.contract, 'language/class-proxy-virtual-interception-v1.md');
  assert.equal(contract.extension, '.atto');
  assert.ok(contract.cases.length >= 58);
  const ids = contract.cases.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'duplicate contract case ID');
  for (const id of expectedIds) assert.ok(ids.includes(id), 'missing: ' + id);
  for (const c of contract.cases) {
    assert.match(c.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(['parse','compile','run'].includes(c.phase), c.id);
    assert.ok(['accept','reject','observe'].includes(c.expect), c.id);
    assert.ok(c.oracle && c.oracle.length > 20, c.id);
    assert.deepEqual(Object.keys(c.backendStatus).sort(), knownBackends.slice().sort());
    assert.ok(Object.values(c.backendStatus).every(s => s === 'not_executed'),
      'no case may claim execution without a real compiler-backed receipt: ' + c.id);
  }
  assert.ok(contract.receiptRequirements.includes('test_steps_executed_nonzero'));
  assert.ok(contract.receiptRequirements.includes('compiler_tree_sha'));
});

test('proxy contract includes success, negative, and runtime observability cases', () => {
  for (const expect of ['accept','reject','observe']) {
    assert.ok(contract.cases.some(c => c.expect === expect), expect);
  }
  assert.ok(contract.cases.some(c => c.phase === 'compile'));
  assert.ok(contract.cases.some(c => c.phase === 'run'));
});

test('affine-proceed protocol has explicit one-shot states but no guest implementation claim', () => {
  const description = readFileSync(
    new URL('../language/class-proxy-affine-proceed-v1.md', import.meta.url), 'utf8'
  );
  for (const state of ['AVAILABLE', 'CLAIMED', 'CONSUMED', 'CLOSED']) {
    assert.ok(description.includes(state), 'missing proceed state: ' + state);
  }
  assert.ok(description.includes('not') || description.includes('NOT'));
  assert.ok(contract.receiptRequirements.includes('affine_proceed_state_trace'));
  assert.ok(contract.cases.filter(c => c.id.startsWith('affine-')).every(
    c => Object.values(c.backendStatus).every(s => s === 'not_executed')
  ), 'no affine proceed case may claim backend execution');
});
