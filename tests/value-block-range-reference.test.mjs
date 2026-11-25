// HOST ONLY: finite range iterator and candidate registry checks.
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const corpus=JSON.parse(readFileSync(new URL('../contracts/atto-value-block-range-v0.json',import.meta.url),'utf8'));
const min=-(1n<<63n),max=(1n<<63n)-1n;
function* range(a,b,inclusive){if(a<min||a>max||b<min||b>max)throw Error('range bounds');for(let n=a;n<b||(inclusive&&n===b);){yield n;if(n===b)return;n++;}}
test('candidate registry remains uniquely identified and requires actual compiled evidence',()=>{
 assert.equal(corpus.status,'PROPOSED_NOT_COMPILER_VERIFIED');assert.equal(corpus.requires_compiled_guest_for_pass,true);assert.equal(new Set(corpus.cases.map(x=>x.id)).size,corpus.cases.length);
 for(const x of corpus.cases)assert.ok(x.source&&x.expect&&x.kind);
});
test('exclusive/inclusive fixtures match ordered visits and sums',()=>{
 for(const [id,inc] of [['range_exclusive_count',false],['range_inclusive_count',true]]){
  const c=corpus.cases.find(x=>x.id===id);let out=[...range(1n,5n,inc)].map(Number);
  assert.deepEqual(out,c.expect.visited);assert.equal(out.reduce((s,n)=>s+n,0),c.expect.exit_code);
 }
});
test('boundary exhaustion and descending ranges without overflow',()=>{
 assert.deepEqual([...range(max,max,true)],[max]);assert.deepEqual([...range(max,max,false)],[]);
 assert.deepEqual([...range(min,min,true)],[min]);assert.deepEqual([...range(5n,1n,true)],[]);
 assert.deepEqual([...range(max-1n,max,true)],[max-1n,max]);assert.throws(()=>[...range(max+1n,max,true)],/bounds/);
});
