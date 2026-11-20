// Source-contract integrity only. NOT an Atto parser, compiler, guest run, or
// proof of any backend's executable support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../conformance/functional-pipelines-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));

test('functional pipeline manifest is explicit and nonvacuous', async () => {
  assert.equal(manifest.schema, 'atto.functional-pipelines.v1');
  assert.deepEqual(manifest.positive.map(c=>c.expected_exit), [83,83,42,42]);
  assert.deepEqual(manifest.negative.map(c=>c.kind), ['type','syntax','syntax','syntax']);
  assert.deepEqual(manifest.reporting.states, ['passed','failed','unsupported','not_executed']);
  const names = [...manifest.positive, ...manifest.negative].map(c=>c.file);
  assert.equal(new Set(names).size, names.length);
  for (const item of [...manifest.positive,...manifest.negative]) {
    assert.match(item.file, /^[a-z-]+\.atto$/);
    const source = await readFile(new URL(item.file,root),'utf8');
    assert.ok(source.startsWith('// expect-'));
    assert.ok(source.includes('pub fnc main(): int'));
    assert.ok(source.includes('<|') || item.kind === 'type' || item.kind === 'syntax');
    const label = item.expected_exit == null
      ? '// expect-error: '+item.kind
      : '// expect-exit: '+item.expected_exit;
    assert.ok(source.startsWith(label), item.file+' must pin its outcome');
  }
});

test('both user program shapes are independently locked', async () => {
  const block = await readFile(new URL('block-body.atto',root),'utf8');
  const arrow = await readFile(new URL('inline-arrow-body.atto',root),'utf8');
  for (const code of [block,arrow]) {
    assert.match(code,/20 \|> double \|> increment;/);
    assert.match(code,/double <\| 21;/);
    assert.match(code,/return a \+ b;/);
  }
  assert.match(block,/int \{ return x \* 2; \}/);
  assert.match(arrow,/int -> x \* 2;/);
  assert.match(arrow,/int -> x \+ 1;/);
});


test('seven supplemental edge fixtures are byte-pinned without altering the original eight', async () => {
  const edge = new URL('edge/', root);
  const extension = JSON.parse(await readFile(new URL('cases.json', edge), 'utf8'));
  assert.equal(extension.schema, 'atto.functional-pipelines.edge.v1');
  assert.match(extension.relationship, /original eight-case/);
  assert.deepEqual(extension.positive.map(x => x.expected_main_value),
    ['61','42','-9223372036854775808']);
  assert.equal(extension.runtime_error.length, 1);
  assert.equal(extension.runtime_error[0].error_kind, 'checked-signed-i64-overflow');
  assert.equal(extension.runtime_error[0].expected_normal_main_result, false);
  assert.deepEqual(extension.negative.map(x => x.kind),
    ['literal-range','literal-range','reserved-authority-identifier']);
  const all = [...extension.positive, ...extension.runtime_error, ...extension.negative];
  assert.equal(all.length, 7);
  assert.equal(new Set(all.map(x => x.file)).size, 7);
  for (const entry of all) {
    assert.match(entry.file, /^[a-z0-9-]+\.atto$/);
    assert.match(entry.blob_sha, /^[a-f0-9]{40}$/);
    const bytes = await readFile(new URL(entry.file,edge));
    const actual = createHash('sha1')
      .update(Buffer.from('blob ' + bytes.length + '\0'))
      .update(bytes).digest('hex');
    assert.equal(actual, entry.blob_sha, entry.file + ': Git source blob drift');
    const source = bytes.toString('utf8');
    assert.match(source, /^\/\/ expect-(main-value|runtime-error|error):/);
    assert.match(source,/pub fnc main\(\): int/);
  }
  const argumentsSource = await readFile(new URL('two-argument-61.atto',edge),'utf8');
  assert.match(argumentsSource, /42 \|> subtract\(2\)/);
  assert.match(argumentsSource, /subtract\(1\) <\| 22/);
  const grouped = await readFile(new URL('preapplied-grouped-42.atto',edge),'utf8');
  assert.match(grouped, /sum\(2\) <\| \(20 \|> double\)/);
  const signedMin = await readFile(new URL('signed-i64-min.atto',edge),'utf8');
  assert.match(signedMin, /-9223372036854775808/);
  assert.ok(extension.reporting.executable_guest_required);
  assert.equal(extension.reporting.ci_status, 'not_executed');
});
