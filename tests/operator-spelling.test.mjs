import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

const contract=JSON.parse(await readFile(
  new URL('../contracts/operator-spelling/v1/cases.json',import.meta.url),'utf8'));

test('operator spelling contract is source-only and has unique typed cases',()=>{
  assert.equal(contract.schema,'atto.operator_spelling.contract.v1');
  assert.equal(contract.status,'PROPOSED');
  assert.ok(contract.cases.length>=15);
  const seen=new Set();
  for(const c of contract.cases){
    assert.match(c.id,/^[a-z][a-z0-9-]+$/);
    assert.ok(!seen.has(c.id),c.id);seen.add(c.id);
    assert.ok(['ACCEPT','REJECT'].includes(c.expected));
    assert.equal(c.execution_evidence,'NOT_EXECUTED_BY_THIS_CONTRACT');
    assert.ok(c.source && c.context && c.meaning);
  }
});
test('single caret only returns; double caret only bitwise XOR',()=>{
  const byId=Object.fromEntries(contract.cases.map(c=>[c.id,c]));
  assert.equal(byId['caret-return'].source,'^ 5;');
  assert.equal(byId['caret-return'].meaning,'RETURN');
  assert.equal(byId['explicit-return'].meaning,'RETURN');
  assert.equal(byId['full-function-explicit-return'].source,'pub fnc foo(): int {\n  return 5;\n}');
  assert.equal(byId['full-function-caret-return'].source,'pub fnc foo(): int {\n  ^ 5;\n}');
  assert.equal(byId['full-function-caret-return'].meaning,byId['full-function-explicit-return'].meaning);
  assert.equal(byId['bitwise-xor'].source,'12 ^^ 10');
  assert.equal(byId['bitwise-xor'].reference_result,'6');
  assert.equal(byId['invalid-infix-caret'].expected,'REJECT');
  assert.equal(byId['invalid-bool-bitwise-xor'].expected,'REJECT');
});
test('power API, shifts and stream/channel/trait operations are distinct',()=>{
  const byId=Object.fromEntries(contract.cases.map(c=>[c.id,c]));
  assert.equal(byId['typed-pow-api'].source,'Math.pow(2, 3)');
  assert.equal(byId['left-triple-shift'].source,'8 <<< 2');
  assert.equal(byId['right-triple-shift'].source,'-1 >>> 1');
  for(const id of ['invalid-shift-distance-64','invalid-shift-distance-negative']) {
    assert.equal(byId[id].expected,'REJECT');
    assert.equal(byId[id].meaning,'INVALID_SHIFT_DISTANCE');
  }
  for(const id of ['channel-write','stream-read','trait-write','trait-read'])
    assert.equal(byId[id].expected,'ACCEPT');
  assert.equal(byId['invalid-double-left-shift'].expected,'REJECT');
  assert.equal(byId['invalid-double-right-shift'].expected,'REJECT');
});
