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
    assert.ok(old.includes('makes `Map.of` accept both Pair and Entry items'));
  }
});


test('portable aggregate v2 fixture registry records target expectations only',()=>{
  const fixture=JSON.parse(readFileSync(new URL('../conformance/aggregate-constructor-v2.json',import.meta.url),'utf8'));
  assert.equal(fixture.schema,'atto.aggregate-constructor-v2');
  assert.equal(fixture.status,'TARGET_NOT_EXECUTED');
  assert.equal(new Set(fixture.vectors.map(v=>v.id)).size,fixture.vectors.length);
  assert.ok(fixture.vectors.filter(v=>v.kind==='accept').length>=17);
  assert.ok(fixture.vectors.filter(v=>v.kind==='reject').length>=25);
  for(const v of fixture.vectors){
    assert.ok(v.source && v.expect,v.id);
    assert.ok(['accept','reject'].includes(v.kind),v.id);
  }
  for(const id of ['map-pair','map-pair-multiple','map-mixed-pair-entry','map-pair-nonidentifier']) assert.equal(fixture.vectors.find(v=>v.id===id)?.kind,'accept',id);
  for(const id of ['record-escape-duplicate','record-dynamic-val','record-nul','record-entry','map-mixed-duplicate','map-pair-unhashable','map-entries-pair','map-pair-empty','record-entry-empty','map-mixed-type','map-flat-v2','tuple-crossed','entry-nonassociative','import-crossed']){
    assert.equal(fixture.vectors.find(v=>v.id===id)?.kind,'reject',id);
  }
});
