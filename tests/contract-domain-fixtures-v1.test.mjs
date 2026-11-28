import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../conformance/contract-domain-fixtures-v1/',import.meta.url));
const manifest=JSON.parse(readFileSync(join(root,'manifest.json'),'utf8'));
const inventory=JSON.parse(readFileSync(new URL('../conformance/contract-domain-conformance-v1.json',import.meta.url),'utf8'));
function validate(manifest, inventory, files){
  const require=(p,msg)=>{if(!p)throw Error(msg)};
  require(manifest.schema==='atto.contract-domain-fixtures.v1','schema');
  require(manifest.status==='CANDIDATE_NOT_EXECUTED','status');
  require(manifest.backends.length===11 && new Set(manifest.backends).size===11 && manifest.backends.every(b=>Object.hasOwn(inventory.backends,b)),'backends');
  const ids=new Set(),used=new Set();
  for(const c of manifest.cases){
    require(!ids.has(c.id),'duplicate case');ids.add(c.id);
    require(c.status==='NOT_EXECUTED','false evidence');
    require(c.inventory===null || inventory.cases.some(x=>x.id===c.inventory),'unknown inventory');
    require(c.files.length>0 && new Set(c.files).size===c.files.length && c.files.includes(c.entry),'file selection');
    for(const path of c.files){
      require(/^[a-z0-9_-]+\/[a-z0-9_-]+\.atto$/.test(path),'invalid path');
      require(Object.hasOwn(files,path) && files[path].trim().length>0,'missing source');used.add(path);
    }
    require(/\bmain\s*\(/.test(files[c.entry]),'missing entry');
    if(c.phase==='compile_run')require(c.expected.return_int===42 && !c.expected.no_artifact,'positive oracle');
    else require(c.phase==='compile_reject' && c.expected.no_artifact===true && typeof c.expected.diagnostic_family==='string','negative oracle');
  }
  require(used.size===Object.keys(files).length,'untracked source');
  require(ids.size===18,'fixture count');
}
const files=Object.fromEntries(readdirSync(root,{recursive:true}).filter(p=>p.endsWith('.atto')).map(p=>[p,readFileSync(join(root,p),'utf8')]));
test('fixture corpus is closed, explicit and non-certifying',()=>validate(manifest,inventory,files));
test('missing source cannot pass inventory validation',()=>{const missing={...files};delete missing[manifest.cases[0].entry];assert.throws(()=>validate(manifest,inventory,missing),/missing source/);});
test('negative requires semantic diagnostic and no artifact',()=>{const m=structuredClone(manifest);m.cases.find(c=>c.phase==='compile_reject').expected.no_artifact=false;assert.throws(()=>validate(m,inventory,files),/negative oracle/);});
test('case cannot claim execution or duplicate a source selection',()=>{const m=structuredClone(manifest);m.cases[0].status='PASS';assert.throws(()=>validate(m,inventory,files),/false evidence/);const n=structuredClone(manifest);n.cases[0].files.push(n.cases[0].entry);assert.throws(()=>validate(n,inventory,files),/file selection/);});
