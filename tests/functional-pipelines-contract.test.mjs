// Source-contract integrity only. NOT an Atto parser, compiler, guest run, or
// proof of any backend's executable support.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const root = new URL('../conformance/functional-pipelines-v1/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('cases.json', root), 'utf8'));

test('functional pipeline manifest is explicit and nonvacuous', async () => {
  assert.equal(manifest.schema, 'atto.functional-pipelines.v1');
  assert.deepEqual(manifest.positive.map(c=>c.expected_exit), [83,83,42]);
  assert.deepEqual(manifest.negative.map(c=>c.kind), ['type','syntax','syntax']);
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
