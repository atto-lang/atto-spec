import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('both return-first separators and exact bullet code point are normative', () => {
 const spec=read('language/return-first-and-begin-callables-v1.md');
 for(const text of ['int <- calculate(int x)','int • calculate(int x)','fnc int • calculate(int x)','U+2022'])
   assert.ok(spec.includes(text),text);
 assert.ok(spec.includes('lookalikes'));
 for (const phrase of [
  'fnc int <- double_answer(int value) ::',
  'raises Foo ::',
  'raise! new Foo();',
  'physical_newline',
  'older same-line',
  'require `begin`, `::`, or a brace block',
  'a missing body separator after return-first effects',
  'nominal subtype identity and owned payload',
  'a generic raise tag MUST reject a Foo raise',
  'the unqualified `raise! Error(...)` site',
  'subtype identity surviving the return to `recover`',
  'err.is_type(Foo)',
  'distinct module-private Wasm EH tags',
  'widened owned instance handle',
 ]) assert.ok(spec.includes(phrase), phrase);
});
test('core reconciled spec examples are present', () => {
 assert.ok(read('spec/02-types-and-patterns.md').includes('implicit `val`'));
 assert.ok(read('spec/02-types-and-patterns.md').includes('on Status.Pending'));
 assert.ok(read('spec/05-actors-and-state.md').includes('inside `receive`'));
 assert.ok(read('spec/05-actors-and-state.md').includes('Result<Ack, SendError>'));
 assert.ok(read('spec/01-source-and-syntax.md').includes('on Ok(ack)'));
 assert.ok(read('spec/16-lexical-and-grammar-reference.md').includes('on default'));
 assert.ok(read('spec/16-lexical-and-grammar-reference.md').includes('Integer bitwise XOR'));
 assert.ok(read('spec/07-errors-and-failure.md').includes('caller-trap-parity/v1'));
 assert.ok(read('spec/09-modules-and-aot.md').includes('import * as math from "+/lib/math";'));
 assert.ok(read('spec/17-primitives-and-core-types.md').includes('Integer.div_trunc'));
 assert.ok(read('language/bitwise-and-stream-operators-v1.md').includes('checked failure (invalid shift distance)'));
});

test('operator contract does not regress to the superseded caret, Boolean XOR or shift masking rules', () => {
 const rules=read('language/bitwise-and-stream-operators-v1.md');
 const decisions=read('language/semantic-reconciliation-2026-11-20.md');
 const index=read('README.md');
 for(const phrase of [
   '`a ^^ b`', '`^ expression;`', '`Math.pow(a, b)`',
   '`Xor(bool,bool)`', '`0..63`', '`left ^ right` is invalid',
   '`sink << value`', '`source >> val binding`'
 ]) assert.ok(rules.includes(phrase),phrase);
 for(const phrase of [
   '`int ^^ int`', '`Xor(bool,bool)`',
   '`int / int` yields floating-point', '`Integer.div_trunc`'
 ]) assert.ok(decisions.includes(phrase),phrase);
 assert.ok(index.includes('int-only `& | ^^ ~`'));
 assert.ok(decisions.includes('bitwise-backend-status-snapshot-2026-11-20.md'));
 assert.ok(read('language/bitwise-backend-status-snapshot-2026-11-20.md').includes('Historical status report'));
 assert.ok(!index.includes('int-only `& | ^ ~`'));
 assert.ok(!rules.includes('The effective shift count is the low six bits'));
 assert.ok(!rules.includes('`bool ^^ bool` support'));
});
