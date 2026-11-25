import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const c=JSON.parse(readFileSync(new URL('../conformance/standard-assert-module-v1.json',import.meta.url),'utf8'));
class AssertionError extends Error {}
const bool=x=>{if(typeof x!=='boolean')throw new TypeError('bool required');return x};
const pred=(x,wanted)=>{if(bool(x)!==wanted)throw new AssertionError('predicate')};
const eq=(a,b,wanted)=>{const x=a(),y=b();if(typeof x!==typeof y||!['boolean','bigint','string'].includes(typeof x))throw new TypeError('homogeneous supported Eq required');if((x===y)!==wanted)throw new AssertionError('equality')};
test('registry and namespace admission are target only',()=>{
 assert.equal(c.canonical_import,'import namespace assert from std.assert;');
 assert.equal(new Set(c.cases.map(x=>x.id)).size,c.cases.length);
 assert.ok(c.cases.every(x=>x.status==='not_executed'));
 assert.ok(Object.values(c.backend_statuses).every(x=>x==='not_executed'));
 assert.equal(c.cases.find(x=>x.id==='builtin_pkg_denied').expected,'reject');
});
test('strict boolean and typed failure reference',()=>{
 pred(true,true);pred(false,false);
 assert.throws(()=>pred(false,true),AssertionError);assert.throws(()=>pred(true,false),AssertionError);
 assert.throws(()=>pred(1,true),TypeError);
});
test('homogeneous equality, negation and exactly-once source order',()=>{
 const trace=[];eq(()=>{trace.push('expected');return 42n},()=>{trace.push('actual');return 42n},true);
 assert.deepEqual(trace,['expected','actual']);
 eq(()=>42n,()=>43n,false);
 assert.throws(()=>eq(()=>42n,()=>43n,true),AssertionError);
 assert.throws(()=>eq(()=>42n,()=>42n,false),AssertionError);
 assert.throws(()=>eq(()=>42n,()=>'42',true),TypeError);
});
