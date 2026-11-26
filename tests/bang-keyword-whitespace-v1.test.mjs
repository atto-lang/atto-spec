import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync(new URL('../contracts/bang-keyword-whitespace-v1.json',import.meta.url),'utf8'));
test('complete lexical separator target matrix (not compiler execution)',()=>{
 assert.equal(r.cases.length,176);
 assert.equal(new Set(r.cases.map(c=>c.id)).size,176);
 assert.equal(r.status,'LEXICAL_TARGET_ONLY_NOT_BACKEND_EXECUTED');
 for(const k of r.keywords){
  const rows=r.cases.filter(c=>c.id.startsWith(k.replaceAll('!','-bang')+'-') && (k!=='copy!' || !c.source.startsWith('copy!!')));
  assert.equal(rows.length,11,k);
  for(const c of rows){
   assert.ok(c.source.startsWith(k));
   const separator=c.source.slice(k.length,k.length+1);
   assert.equal(c.expect, /[ \t\r\n\v\f]/.test(separator) ? 'SEPARATOR_OK' : r.rule,c.id);
  }
 }
});
