import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../language/'+p,import.meta.url),'utf8');
test('canonical Atto example, scoped inferred binder and nominal unwind reconciliation agree',()=>{
  const bang=read('exception-control-bang-spellings-v1.md');
  const syntax=read('imperative-try-blocks-v1.md');
  const unwind=read('defer-recover-unwind-v1.md');
  assert.ok(bang.includes("pub fnc main(): int {\n    try {\n        throw! new Error(\"ordinary failure\");\n    } catch (err) {\n        return 42;\n    }\n}"));
  assert.match(syntax,/owner-selected canonical/);
  assert.match(syntax,/binder is scoped to the handler/);
  assert.match(unwind,/independently proven `Throwable`, `Raisable`/);
  assert.match(unwind,/without that representation must reject/);
  assert.match(unwind,/must not\s+require a tracing collector/);
});
