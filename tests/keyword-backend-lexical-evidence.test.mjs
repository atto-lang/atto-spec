import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>JSON.parse(readFileSync(path.join(root,p),"utf8"));
const snapshot=read("contracts/keyword-taxonomy-v1/backend-lexical-evidence-v1.json");
const historical=read(snapshot.baseline_catalog);
const old=new Set(historical.reserved_groups.flatMap(g=>g.words));
const by=Object.fromEntries(snapshot.evidence.map(x=>[x.backend,new Set(x.spellings)]));

test("snapshots are source inspection, not guest/compiler proof",()=>{
 assert.equal(snapshot.status,"SOURCE_INSPECTION_ONLY_NOT_COMPILER_EXECUTED");
 assert.equal(snapshot.schema_version,1);
 assert.equal(snapshot.evidence.length,2);
 for(const entry of snapshot.evidence){
  assert.match(entry.blob_sha,/^[a-f0-9]{40}$/);
  assert.equal(entry.spellings.length,entry.distinct_reserved_count);
  assert.equal(new Set(entry.spellings).size,entry.spellings.length);
  assert.ok(entry.notes.length>=3);
 }
});

test("Java exact map and LLVM reserved-name policy retain distinct semantics",()=>{
 assert.equal(by.java.size,95);
 assert.equal(by.llvm.size,120);
 assert.equal(old.size,93);
 assert.ok(by.java.has("guard")&&by.java.has("unsafe"));
 assert.ok(!old.has("guard")&&!old.has("unsafe"));
 assert.ok(!by.llvm.has("unsafe"));
 for(const word of ["suspend","enum","borrow","and","or","critical-read","nb-select","Some"]){
  assert.ok(by.llvm.has(word),word);
  assert.ok(!by.java.has(word),word);
 }
});

test("all set differences and historical exceptions are exact",()=>{
 const java=by.java,llvm=by.llvm;
 const sorted=x=>[...x].sort();
 assert.deepEqual(snapshot.comparisons.common,sorted([...java].filter(x=>llvm.has(x))));
 assert.deepEqual(snapshot.comparisons.java_only,sorted([...java].filter(x=>!llvm.has(x))));
 assert.deepEqual(snapshot.comparisons.llvm_only,sorted([...llvm].filter(x=>!java.has(x))));
 assert.deepEqual(snapshot.comparisons.historical_catalog_missing_java,sorted([...java].filter(x=>!old.has(x))));
 assert.deepEqual(snapshot.comparisons.historical_catalog_missing_llvm,sorted([...llvm].filter(x=>!old.has(x))));
 assert.deepEqual(snapshot.comparisons.historical_catalog_orphan_java,sorted([...old].filter(x=>!java.has(x))));
 assert.deepEqual(snapshot.comparisons.historical_catalog_orphan_llvm,sorted([...old].filter(x=>!llvm.has(x))));
 assert.deepEqual(snapshot.comparisons.historical_catalog_missing_java,["guard","unsafe"]);
});

test("lexer and parser boundaries are not mislabeled as equivalent tokens",()=>{
 const java=snapshot.evidence.find(x=>x.backend==="java");
 const llvm=snapshot.evidence.find(x=>x.backend==="llvm");
 assert.ok(java.semantics.includes("Token.Type"));
 assert.ok(llvm.semantics.includes("parser-level reserved-name policy"));
 assert.ok(java.notes.some(s=>s.includes("NB and SELECT")));
 assert.ok(llvm.notes.some(s=>s.includes("Kind::Identifier")));
 assert.ok(java.notes.some(s=>s.includes("Unicode")));
 assert.ok(llvm.notes.some(s=>s.includes("ASCII")));
});
