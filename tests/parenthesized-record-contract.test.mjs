import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const doc=readFileSync(new URL('../language/inline-collection-literals-v1.md',import.meta.url),'utf8');
test('parenthesized record target preserves identifier-only keys and distinct named calls',()=>{assert.match(doc,/named_field\s*= IDENT, "=", expression/);assert.match(doc,/field_entry\s*= IDENT, ":", expression/);assert.match(doc,/map_entry\s*= STRING, ":", expression/);assert.ok(doc.includes('`f(foo: 1)`'));assert.ok(doc.includes('`f(foo=1)` is rejected'));assert.ok(doc.includes('`f((foo=1))` passes one'));assert.ok(doc.includes('`()` is **always** `Tuple`'));assert.ok(doc.includes('untyped inference exception is **not valid**'));});
