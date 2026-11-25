import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const doc=readFileSync(new URL('../language/inline-collection-literals-v1.md',import.meta.url),'utf8');
test('parenthesized record target preserves identifier-only keys and distinct named calls',()=>{assert.match(doc,/named_field\s*= IDENT, "=", expression/);assert.match(doc,/field_entry\s*= IDENT, ":", expression/);assert.match(doc,/map_entry\s*= STRING, ":", expression/);assert.ok(doc.includes('`f(foo: 1)`'));assert.ok(doc.includes('`f(foo=1)` is rejected'));assert.ok(doc.includes('`f((foo=1))` passes one'));assert.ok(doc.includes('`()` is **always** `Tuple`'));assert.ok(doc.includes('untyped inference exception is **not valid**'));});


// Specification consistency only: no compiler or guest execution claim.
test('v2 constructor split preserves Entry arrow semantics and static Record names',()=>{
  const v2=readFileSync(new URL('../language/entry-expression-and-record-literals-v1.md',import.meta.url),'utf8').split('## Parentheses and Record constructor interoperability (v2 proposed)')[1];
  assert.ok(v2);
  for(const fragment of [
    'Record.of(a=5, b=true)',
    'Record.of(Pair.of("a", 5), Pair.of("b", true))',
    'Map.of("a" => 5, "b" => 6)',
    'Map.of(Entry.of("a", 5), Entry.of("b", 6))',
    'No Record-specific reinterpretation',
    'same lexical identifier and reserved-name rules as fnc/mtd parameter names',
    'compile-time-proven string',
    'historical flat alternating Map.of(k,v,k,v) overload is legacy-profile-only',
    'Map.of(Pair.of("a",5))',
    'reject Entry inputs',
    'Entry.of(non_hashable_key,5)',
    'TARGET / NOT_EXECUTED',
  ]) assert.ok(v2.includes(fragment),fragment);
  for(const file of ['map-of-entries-and-nominal-structs-v1.md','typed-map-of-entries-and-nominal-structs-v1.md']){
    const old=readFileSync(new URL('../language/'+file,import.meta.url),'utf8');
    assert.ok(old.includes('makes `Map.of` Entry-only in the new profile'));
  }
});
