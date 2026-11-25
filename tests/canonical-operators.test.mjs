import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {operatorTokens,caretSites} from '../scripts/canonical-operators.mjs';
const load=name=>readFileSync(new URL('../contracts/removed-operators-v1/'+name,import.meta.url),'utf8');
const kinds=s=>caretSites(s).map(x=>x.kind);
const interesting=s=>operatorTokens(s).filter(x=>['^','^^','^^=','^=','%'].includes(x.token)).map(x=>x.token);
test('positive multiplication and contextual caret returns',()=>{
 assert.deepEqual(interesting(load('positive.atto')),[]);
 assert.deepEqual(kinds(load('positive-caret.atto')),['statement-return']);
 assert.deepEqual(kinds(load('positive-contextual-return.atto')),['contextual-return']);
});
test('infix single caret rejects in the bounded scalar shape; integer double caret remains distinct',()=>{
 assert.deepEqual(kinds(load('reject-xor.atto')),['removed-infix']);
 assert.deepEqual(interesting(load('positive-integer-xor.atto')),['^^']);
 assert.equal(12n ^ 10n,6n); // independent host bit-pattern oracle, not guest evidence
 assert.deepEqual(interesting(load('reject-boolean-xor.atto')),['^^']); // typed rejection, not lexical rejection
 assert.deepEqual(interesting('x ^^= 1;'),['^^=']);
 assert.deepEqual(kinds('return 1 ^ 2;'),['removed-infix']);
 assert.deepEqual(kinds('return foo ^ bar;'),['requires-parser']);
});
test('historical percent fixture is only an inventory item, not a portable rejection result',()=>{
 assert.deepEqual(interesting(load('historical-percent.atto')),['%']);
});
test('nested comments and quoted strings cannot forge operator sites',()=>{
 assert.deepEqual(interesting('// ^ ^^ %\n/* %% /* ^^ */ ^ */\nval text = "% ^ ^^";\nval sym = #"^^";'),[]);
});
test('unterminated scopes, unsupported templates, and excessive nesting fail closed',()=>{
 for(const x of ['/* %','"^','`42 ^ 5`','/*'.repeat(129)+'*/'.repeat(129)])
  assert.throws(()=>operatorTokens(x),/unterminated|template syntax|nesting exceeds/);
});
test('mutation changes classification without conflating return and XOR',()=>{
 assert.deepEqual(kinds(load('reject-xor.atto').replace('^','^^')),[]);
 assert.deepEqual(kinds(load('positive-caret.atto').replace('^','return')),[]);
});
