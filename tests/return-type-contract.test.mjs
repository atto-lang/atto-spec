// Host-only source contract checks; NOT an AttoLang parser, typechecker or guest test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const spec=readFileSync(new URL('../language/return-type-queries-and-inference-v1.md',import.meta.url),'utf8');
test('preserves old typeof forms and contextual infer',()=>{
  for(const phrase of ['#450','#4','typeof fnc','typeof stringify','typeof(tbr)','typeof tbr','typeof! name','type<tbr>','infer<T> struct'])
    assert.ok(spec.includes(phrase),phrase);
});
test('specifies cycle, scope, ABI and no-runtime-query safety',()=>{
  for(const phrase of ['dependency graph','outer body block','E_RETURN_INFER_CYCLE','E_TYPE_QUERY_SCOPE',
    'before** interfaces','runtime reflection','NOT_EXECUTED'])
    assert.ok(spec.includes(phrase),phrase);
});
test('canonical queries and compatibility grammar are explicit',()=>{
  for(const phrase of ['Canonical output','typeof name','typeof(x)','typeof!foo','typeof fnc(...) => T','type_query        ='])
    assert.ok(spec.includes(phrase),phrase);
  assert.ok(spec.includes('MUST produce `typeof name`'));
});

test('bounded local inference and contextual lambda are explicit target rules',()=>{
  for(const phrase of [
    '## Bounded, bidirectional inference engine',
    'Local synthesis', 'Contextual checking', 'Explicit callable inference',
    'Boundary stability', '|x| -> expression', 'val x = None;',
    'val x: Option<int> = None;', 'val xs = [];',
    'val xs: Array<int> = [];', 'Array<Record>',
    'Option<Result<T,E>>', 'Result<Option<T>,E>',
  ]) assert.ok(spec.includes(phrase), phrase);
});
test('inference is deterministic and cannot erase safety constraints',()=>{
  for(const phrase of [
    'unconstrained global Hindley', 'three-color DFS',
    'unrestricted let-polymorphism', 'E_INFER_BUDGET',
    'partial guest artifact', 're-infer a dependency',
    'Sendable', 'Serializable', 'borrow',
    'MUST NOT choose an overload', 'without writing `infer`',
  ]) assert.ok(spec.includes(phrase), phrase);
});

test('contextual infer struct target semantics', () => {
  for (const phrase of [
    '## Contextual `infer struct` construction',
    'const Point p = infer struct { x: 3, y: 4 };',
    'const empty = infer struct {};',
    'without a usable expected struct type',
    'compiler-private anonymous nominal struct type',
    'zero fields',
    'E_CONST_INIT',
    'E_TYPE_INFER_AMBIGUOUS',
    'Do not use the existing broad `shape_lower` exact-field-set search',
    'not automatically valid',
    'private/public/actor boundary checks',
    'infer<T> struct',
  ]) assert.ok(spec.includes(phrase), phrase);
});
