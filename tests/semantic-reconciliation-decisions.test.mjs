import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('both return-first separators and exact bullet code point are normative', () => {
 const spec=read('language/return-first-and-begin-callables-v1.md');
 for(const text of ['int <- calculate(int x)','int • calculate(int x)','fnc int • calculate(int x)','U+2022'])
   assert.ok(spec.includes(text),text);
 assert.ok(spec.includes('lookalikes'));
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
