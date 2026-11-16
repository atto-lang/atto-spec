// Host-only source contract checks; NOT an AttoLang parser, typechecker or guest test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const spec=readFileSync(new URL('../language/return-type-queries-and-inference-v1.md',import.meta.url),'utf8');
test('preserves old typeof forms and contextual infer',()=>{
  for(const phrase of ['#450','#4','typeof fnc','typeof stringify','typeof(tbr)','type<tbr>','infer<T> struct'])
    assert.ok(spec.includes(phrase),phrase);
});
test('specifies cycle, scope, ABI and no-runtime-query safety',()=>{
  for(const phrase of ['dependency graph','outer body block','E_RETURN_INFER_CYCLE','E_TYPE_QUERY_SCOPE',
    'before** interfaces','runtime reflection','NOT_EXECUTED'])
    assert.ok(spec.includes(phrase),phrase);
});