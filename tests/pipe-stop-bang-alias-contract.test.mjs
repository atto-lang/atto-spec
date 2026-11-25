import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const contract = JSON.parse(readFileSync(
  new URL('../contracts/pipe-stop-bang-alias-v1.json', import.meta.url), 'utf8'));
const doc = readFileSync(
  new URL('../language/bang-pipeline-and-stop-aliases-v1.md', import.meta.url), 'utf8');

test('the three bang spellings are exact semantic aliases, not separate effects', () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.status, 'TARGET_SOURCE_ONLY_NOT_EXECUTED');
  assert.deepEqual(contract.aliases.map(a => [a.bare, a.bang, a.direction]), [
    ['pipe', 'pipe!', 'LEFT_TO_RIGHT'],
    ['rpipe', 'rpipe!', 'RIGHT_TO_LEFT'],
    ['stop', 'stop!', null]
  ]);
  for (const v of Object.values(contract.invariants)) assert.equal(v, true);
  assert.match(doc, /not an executable-backend parity claim/);
});

test('positive cases preserve original operands and keyword direction', () => {
  assert.equal(contract.positive_fixtures.length, 6);
  const indexed = new Map(contract.aliases.map(a => [a.bang, a.bare]));
  for (const fixture of contract.positive_fixtures) {
    assert.match(fixture.input, /(?:pipe!|rpipe!|stop!)/);
    const normalized = fixture.input.replace(/\b(?:rpipe!|pipe!|stop!)(?![\w])/g,
      found => indexed.get(found));
    assert.equal(normalized, fixture.equivalent, fixture.id);
    assert.notEqual(fixture.context, '');
  }
});

test('negative cases protect lexing, method names and security boundaries', () => {
  const ids = contract.negative_fixtures.map(x => x.id);
  assert.deepEqual(ids, [
    'mixed_directions', 'split_bang', 'split_stop', 'prefix_identifier',
    'suffix_identifier', 'fabricated_factory', 'unrelated_method', 'comment',
    'string', 'quoted_symbol'
  ]);
  for (const fixture of contract.negative_fixtures)
    assert.ok(fixture.input && fixture.reason, fixture.id);
  assert.match(doc, /TenantVM capabilities/);
  assert.match(doc, /force termination/);
  assert.match(doc, /same effect\/return type/);
});
