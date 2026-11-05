import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {removedOperators,assertCanonicalOperators} from '../scripts/canonical-operators.mjs';
const root=new URL('../contracts/removed-operators-v1/',import.meta.url);
const load=name=>readFileSync(new URL(name,root),'utf8');
test('canonical positive fixture contains no removed operator tokens',()=>{
 assert.equal(assertCanonicalOperators(load('positive.atto')),true);
});
test('targeted percent/xor/double-xor fixtures have distinct lexical errors',()=>{
 for(const [name,token] of [
  ['reject-percent.atto','%'],['reject-xor.atto','^'],
  ['reject-double-xor.atto','^^']
 ]){
  assert.deepEqual(removedOperators(load(name)).map(x=>x.token),[token]);
  assert.throws(()=>assertCanonicalOperators(load(name)),/removed AttoLang operator/);
 }
});
test('nested comments and string/symbol literals cannot forge grammar failures',()=>{
 const sample='// % ^ ^^\n/* %% /* ^^ */ ^ */\nval text = "% ^ ^^";\nval sym = #"^^";';
 assert.equal(removedOperators(sample).length,0);
});
test('unterminated lexical scopes or unsupported interpolated templates fail closed',()=>{
 for(const x of ['/* %','"^','`42 ^ 5`'])
  assert.throws(()=>removedOperators(x),/unterminated|template syntax/);
});
test('mutation: removing an operator must change the negative fixture outcome',()=>{
 const input=load('reject-percent.atto');
 assert.deepEqual(removedOperators(input.replace('%','*')),[]);
});
