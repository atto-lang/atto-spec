import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const path=new URL('../contracts/top-level-defines/v1/cases.json',import.meta.url);
const cases=JSON.parse(await readFile(path,'utf8'));
test('spec cases are proposals and never falsely claim guest execution',()=>{
 assert.equal(cases.schema,'atto.top_level_defines.contract.v1');
 assert.equal(cases.status,'PROPOSED');
 assert.ok(cases.cases.length>=16);
 const names=new Set();
 for(const item of cases.cases){
   assert.match(item.id,/^[a-z][a-z0-9-]+$/);
   assert.ok(!names.has(item.id)); names.add(item.id);
   assert.ok(['COMPILES','REJECTS'].includes(item.expected));
   assert.equal(item.execution_evidence,'NOT_EXECUTED_BY_THIS_CONTRACT');
   assert.ok(typeof item.source==='string'&&item.source.length>10);
   if(item.expected==='REJECTS') assert.match(item.diagnostic,/^E_[A-Z_]+$/);
   else assert.ok(Array.isArray(item.metadata_kinds)&&item.metadata_kinds.length>0);
 }
});
test('proposal explicitly covers required declaration families and removed operators',()=>{
 const sources=cases.cases.map(x=>x.source).join('\n');
 for(const kind of ['class','actor','enum','struct','interface','trait','fnc'])
   assert.ok(sources.includes('define '+kind)||sources.includes('define pub '+kind));
 for(const op of ['%', '^', '^^'])
   assert.ok(cases.cases.some(x=>x.expected==='REJECTS'&&x.source.includes(' '+op+' ')));
 const enumCase=cases.cases.find(x=>x.id==='enum-symbols');
 assert.match(enumCase.source,/#done/);
});
