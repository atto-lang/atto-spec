import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const catalog=read('language/core-alloc-std-libraries-v1.md');
const prelude=read('language/automatic-prelude-v1.md');
const semantics=read('docs/CANONICAL_BOOLEAN_OPERATORS_V1.md');
const entry=catalog.split('\n').find(s=>s.startsWith('* `core/bool`:'));
assert.ok(entry,'core/bool must be catalogued');
for(const gate of ['And','Or','Xor']){
  assert.ok(entry.includes('`'+gate+'`'),gate);
  assert.ok(prelude.includes('`'+gate+'`'),gate);
  assert.match(semantics,new RegExp('\\| `'+gate+'` \\| two or more bools'));
}
assert.match(prelude,/core prelude callable bindings from `atto.core\/bool`/);
assert.match(semantics,/Explicit imports of `atto.core\/bool` must bind the same compiler-recognized identities/);
assert.match(semantics,/ordinary declarations\/imports first/i);
assert.match(semantics,/Reduction itself is read-only/);
assert.match(entry,/No hidden allocation/);
assert.match(semantics,/a normal eager forwarding function is not equivalent/);
console.log('CORE_BOOL_CONTRACT_CONSISTENCY_PASS (documentation only)');
