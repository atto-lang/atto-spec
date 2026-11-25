// Host-only contract regression: classifies a narrow literal surface solely for
// specification review. Not the Atto parser, formatter, type checker or guest.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL('../language/' + name, import.meta.url), 'utf8');

function entries(source) {
  assert.ok(source.startsWith('{') && source.endsWith('}'));
  const input = source.slice(1, -1);
  const parts = [];
  let start = 0, quote = null, escaped = false, nesting = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (quote !== null) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { quote = c; continue; }
    if ('([{'.includes(c)) nesting++;
    if (')]}'.includes(c)) nesting--;
    if (nesting < 0) throw Error('unbalanced');
    if (c === ',' && nesting === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (quote !== null || nesting !== 0) throw Error('unclosed');
  parts.push(input.slice(start).trim());
  return parts;
}

function classify(source) {
  const parts = entries(source);
  if (parts.length === 1 && !parts[0]) throw Error('E_INFER: empty collection requires type');
  const kinds = [];
  for (const item of parts) {
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*:/.test(item)) kinds.push('Record');
    else if (/^(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)\s*:/.test(item)
        || /=>/.test(item)) kinds.push('Map');
    else throw Error('unsupported reference fixture: ' + item);
  }
  if (new Set(kinds).size !== 1) throw Error('E_LITERAL_KIND: Record/Map mixture');
  return kinds[0];
}

test('quoted colon keys and expression arrows are Map; identifier colon is Record', () => {
  for (const source of ['{name:1}', '{name:1, active:true}', '{status_code:200}'])
    assert.equal(classify(source), 'Record', source);
  for (const source of [
    '{"name":1}', "{'name':1}", '{`name`:1}',
    '{"content-type":"json"}', '{"name"=>1}', '{name => 1}',
    '{"name":1, \'other\' => 2}', '{"":1}', '{"a": 1, b => 2}'
  ]) assert.equal(classify(source), 'Map', source);
});

test('mixing Map and Record items fails in either order', () => {
  for (const src of [
    '{name:1, "other":2}', '{"other":2, name:1}',
    '{name:1, other => 2}', '{other => 2, name:1}'
  ]) assert.throws(() => classify(src), /E_LITERAL_KIND/, src);
  assert.throws(() => classify('{}'), /E_INFER/);
});

test('both candidate specification files use corrected Record/Map separation', async () => {
  const [layout, inline] = await Promise.all([
    read('record-struct-layout-v1.md'),
    read('inline-collection-literals-v1.md')
  ]);
  for (const doc of [layout, inline]) {
    assert.match(doc, /atto-spec #133/, 'follow-on quoted-key authority must be named');
    assert.match(doc, /E_LITERAL_KIND/, 'mixed forms must fail closed');
    assert.match(doc, /Map/, 'Map contract required');
    assert.match(doc, /Record/, 'Record contract required');
  }
  assert.match(layout, /\{a:1, status_code:200\}/);
  assert.match(layout, /\{status_code:200, "content-type":"x"\}/);
  assert.match(inline, /identifier-only/);
  assert.match(inline, /\{"content-type": 1, status_code: 2\}/);
  assert.doesNotMatch(inline, /identifiers or quoted string keys/);
  assert.doesNotMatch(inline, /let Record headers =/);
  assert.doesNotMatch(layout, /quoted UTF-8 strings, including/);
});
