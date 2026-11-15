// Source-only spelling regression model: NOT AttoLang compiler/lexer evidence.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/ownership-bang-aliases-v1.json', import.meta.url)), 'utf8'));
function reference_recognize(source) {
  const bang = /^(mut\s+borrow|copy|take|borrow|share)!(?!=|eq(?![\p{L}0-9_]))([\s\S]*)$/u.exec(source);
  if (bang && bang[2].trim()) {
    const op = bang[1] === 'mut borrow' ? 'mut_borrow' : bang[1];
    return { operation: op, canonical: bang[1].replace(/\s+/g, ' ') + '! ' + bang[2].trim() };
  }
  const legacy = /^rt\s+(borrow\s+mut|mut\s+borrow|copy|take|borrow|share)\s+([\s\S]+)$/.exec(source);
  if (!legacy || !legacy[2].trim()) return null;
  const op = legacy[1].replace(/\s+/g, ' ');
  const name = op === 'borrow mut' || op === 'mut borrow' ? 'mut borrow' : op;
  return { operation: name === 'mut borrow' ? 'mut_borrow' : name, canonical: name + '! ' + legacy[2].trim() };
}
test('preferred spaced/compact ownership forms and legacy spelling normalize', () => {
  for (const c of fixture.accepted) assert.deepEqual(reference_recognize(c.input), {operation:c.operation, canonical:c.canonical}, c.input);
});
test('a gap before the bang, other verbs, inequality, and missing operands are not ownership aliases', () => {
  for (const input of fixture.must_not_recognize_as_ownership) assert.equal(reference_recognize(input), null, input);
});
test('source-only fixture cannot be interpreted as backend execution evidence', () => {
  assert.equal(fixture.status, 'TARGET_SOURCE_ONLY_NOT_BACKEND_VERIFIED');
  assert.equal(fixture.required_compiler_semantic_negative.length >= 7, true);
});
