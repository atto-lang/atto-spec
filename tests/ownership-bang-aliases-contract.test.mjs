// Source-only spelling regression model: NOT AttoLang compiler/lexer evidence.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import test from 'node:test';

const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/ownership-bang-aliases-v1.json', import.meta.url)), 'utf8'));
function reference_recognize(source) {
  const bang = /^(mut\s+borrow|copy|take|borrow|share)!(?!=|eq(?![\p{L}0-9_]))[ \t\r\n\v\f]+([\s\S]*)$/u.exec(source);
  if (bang && bang[2].trim()) {
    let operand = bang[2].trim();
    const trailingMut = bang[1] === 'borrow' && /^mut(?=\s|\(|$)/.test(operand);
    if (trailingMut) operand = operand.slice(3).trim();
    if (!operand) return null;
    if (bang[1] !== 'borrow' && bang[1] !== 'mut borrow' && /^mut(?=\s|\(|$)/.test(operand)) return null;
    // Neither borrow! mut mut nor legacy mut borrow! mut may double-qualify.
    if ((trailingMut || bang[1] === 'mut borrow') && /^mut(?=\s|\(|$)/.test(operand)) return null;
    const op = trailingMut || bang[1] === 'mut borrow' ? 'mut_borrow' : bang[1];
    return { operation: op, canonical: op === 'mut_borrow' ? 'borrow! mut ' + operand : bang[1] + '! ' + operand };
  }
  const legacy = /^rt\s+(borrow\s+mut|mut\s+borrow|copy|take|borrow|share|ref|deref|unref)\s+([\s\S]+)$/.exec(source);
  if (!legacy || !legacy[2].trim()) return null;
  if (!legacy[1].includes('borrow') && /^mut(?=\s|\(|$)/.test(legacy[2].trim())) return null;
  const op = legacy[1].replace(/\s+/g, ' ');
  if ((op === 'borrow mut' || op === 'mut borrow') &&
      /^mut(?=\s|\(|$)/.test(legacy[2].trim())) return null;
  const name = op === 'borrow mut' || op === 'mut borrow' ? 'mut borrow' : op;
  return { operation: name === 'mut borrow' ? 'mut_borrow' : name, canonical: name === 'mut borrow' ? 'borrow! mut ' + legacy[2].trim() : (['ref','deref','unref'].includes(name) ? 'rt ' + name + ' ' : name + '! ') + legacy[2].trim() };
}
test('preferred spaced ownership forms and legacy spelling normalize', () => {
  for (const c of fixture.accepted) assert.deepEqual(reference_recognize(c.input), {operation:c.operation, canonical:c.canonical}, c.input);
});
test('a gap before the bang, other verbs, inequality, and missing operands are not ownership aliases', () => {
  for (const input of fixture.must_not_recognize_as_ownership) assert.equal(reference_recognize(input), null, input);
});
test('source-only fixture cannot be interpreted as backend execution evidence', () => {
  assert.equal(fixture.status, 'TARGET_SOURCE_ONLY_NOT_BACKEND_VERIFIED');
  assert.equal(fixture.required_compiler_semantic_negative.length >= 7, true);
});

test('mutable borrows canonically place mut after borrow! while preserving old aliases', () => {
  for (const source of ['borrow! mut value', 'mut borrow! value', 'rt borrow mut value', 'rt mut borrow value']) {
    assert.deepEqual(reference_recognize(source), { operation: 'mut_borrow', canonical: 'borrow! mut value' }, source);
  }
  assert.equal(reference_recognize('borrow! mut'), null);
  assert.equal(reference_recognize('borrow!mut'), null);
});

test('checked-handle rt operations preserve spelling; unapproved bangs fail closed', () => {
  for (const name of ['ref', 'deref', 'unref']) {
    assert.deepEqual(reference_recognize(`rt ${name} h`), {operation:name,canonical:`rt ${name} h`});
    for (const spelling of [`${name}! h`, `${name}!h`]) assert.equal(reference_recognize(spelling), null, spelling);
    assert.equal(reference_recognize(`${name}! mut h`), null);
    assert.equal(reference_recognize(`${name} !h`), null);
  }
});

test('checked-handle semantic-negative gates stay explicit and source-only', () => {
  const mustCheck = [
    'invalid or forged checked handle',
    'stale arena or allocation generation',
    'checked handle wrong actor/domain',
    'checked handle out-of-bounds or misaligned access',
    'double unref release',
    'deref after unref',
    'checked handle escape across actor isolation',
  ];
  for (const gate of mustCheck) assert.ok(fixture.required_compiler_semantic_negative.includes(gate), gate);
  for (const op of ['ref', 'deref', 'unref']) {
    assert.ok(fixture.must_not_recognize_as_ownership.some(s => s.startsWith(`${op}!`)));
    assert.ok(fixture.accepted.some(c => c.input === `rt ${op} h` || c.input === `rt ${op} x`));
  }
});
