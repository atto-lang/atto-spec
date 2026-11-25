import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const f=JSON.parse(readFileSync(new URL("../conformance/visibility-linkage-final-v1.json",import.meta.url),"utf8"));
const ids=new Map(f.cases.map(x=>[x.id,x]));
test("modifier registry retains unique positive and negative cases",()=>{
 assert.equal(f.schemaVersion,1);
 assert.equal(ids.size,f.cases.length);
 assert.ok(ids.size>=12);
 for(const c of f.cases){
  assert.ok(["parse","compile","link"].includes(c.phase),c.id);
  assert.ok(["accept","reject"].includes(c.expect),c.id);
  if(c.expect==="reject") assert.match(c.diagnostic,/^E_[A-Z_]+$/,c.id);
  assert.ok(c.source.includes("fnc")||c.source.includes("class"),c.id);
 }
});
test("package-public is not internal and foreign declarations grant no runtime ABI",()=>{
 for(const id of ["internal-public-export","internal-package-export","internal-pub-conflict","pub-internal-conflict","external-unlinked-call","external-pub-conflict","external-export","protected-must-not-private-lower"]){
  assert.equal(ids.get(id)?.expect,"reject",id);
 }
 assert.equal(ids.get("internal-package-export").diagnostic,"E_VISIBILITY");
});
test("final initializer and later constructor write have disjoint results",()=>{
 assert.equal(ids.get("final-initialized-read").expect,"accept");
 assert.equal(ids.get("final-constructor-reassignment").diagnostic,"E_IMMUTABLE");
 assert.ok(f.receiptRequirements.includes("linker_result_or_unsupported"));
});
