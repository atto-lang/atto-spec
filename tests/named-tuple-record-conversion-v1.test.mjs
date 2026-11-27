import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../conformance/named-tuple-record-conversion-v1.json',import.meta.url),'utf8'));
// Host-only selection model, ASCII vectors only. Not an Atto parser or compiler.
function select(entries,policy){
 if(!["reject","first","last"].includes(policy))return "policy";
 const result=new Map();
 for(const entry of entries){
  if(!Array.isArray(entry)||typeof entry[0]!=="string"||!/^[A-Za-z_][A-Za-z_0-9]*$/.test(entry[0]))return "key";
  if(result.has(entry[0])){if(policy==="reject")return "duplicate";if(policy==="first")continue;}
  result.set(entry[0],entry);
 }
 return [...result.values()];
}
for(const [name,entries,policy,expected] of manifest.modelCases) test(name,()=>assert.deepEqual(select(entries,policy),expected));
test('target evidence remains unexecuted',()=>{assert.equal(manifest.status,'TARGET_NOT_EXECUTED');assert.equal(new Set(manifest.sourceCases.map(x=>x.id)).size,manifest.sourceCases.length);});
