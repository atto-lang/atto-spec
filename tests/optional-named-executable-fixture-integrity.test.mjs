// Verify source-file Git blob identity with an implementation slice.
// This host-only test is NOT compiler/guest-execution evidence.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import test from 'node:test';
const m = JSON.parse(readFileSync(new URL('../contracts/optional-named-parameters-v1/guest-rust-slice-v1/manifest.json', import.meta.url), 'utf8'));
test('versioned optional-argument guest corpus is byte pinned without claiming guest parity', () => {
  assert.equal(m.schema, 'attolang.optional-named-guest-slice.v1');
  assert.equal(m.status, 'AUTHORED_NOT_EXECUTED_ON_NEW_HEAD');
  assert.match(m.rust_source_head, /^[0-9a-f]{40}$/);
  assert.match(m.rust_source_tree, /^[0-9a-f]{40}$/);
  assert.equal(m.cases.length, 15);
  assert.equal(new Set(m.cases.map(c => c.id)).size, 15);
  assert.ok(Object.values(m.backends).every(s => !s.includes('VERIFIED')));
  const tallies = {guest_exit: 0, compiler_error: 0};
  for (const c of m.cases) {
    assert.ok(c.path.startsWith('contracts/optional-named-parameters-v1/guest-rust-slice-v1/'));
    assert.ok(c.source_path.startsWith('tests/fixtures/'));
    const bytes = readFileSync(new URL('../' + c.path, import.meta.url));
    const sha = createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(sha, c.blob_sha, c.id + ': upstream Git blob drift');
    const src = bytes.toString('utf8');
    assert.ok(src.includes('pub fnc main(): int'), c.id + ': guest entrypoint');
    if (c.expected.kind === 'guest_exit') {
      assert.equal(c.kind, 'pass');
      assert.equal(c.expected.exit, 42);
      assert.ok(src.includes('// expect-exit: 42'));
    } else {
      assert.equal(c.kind, 'fail');
      assert.match(c.expected.code, /^E_[A-Z_]+$/);
      assert.ok(src.includes('// expect-error: ' + c.expected.code));
    }
    tallies[c.expected.kind]++;
  }
  assert.deepEqual(tallies, {guest_exit: 8, compiler_error: 7});
});
