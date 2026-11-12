import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import test from "node:test";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=p=>JSON.parse(readFileSync(path.join(root,p),"utf8"));
const fixtures=read("tests/fixtures/keyword-semantic-context-v1.json");
const catalog=read("contracts/keyword-taxonomy-v1/catalog.json");
const reserved=new Set(catalog.reserved_groups.flatMap(g=>g.words));
const proposed=new Set([...catalog.documented_not_reserved,...catalog.candidate_spellings].map(x=>x.spelling));
const knownRoles=new Set([
 "declaration_keyword","entity_keyword","actor_type_identifier","contract_type_identifier",
 "target_declaration_marker","namespace_identifier","modifier_keyword","target_method_marker",
 "method_identifier","target_state_marker","target_relation_marker","binding_keyword",
 "variable_identifier","concurrency_keyword","target_pipeline_marker","pipeline_operator",
 "string_literal","symbol_literal","target_ownership_marker","target_critical_access_marker",
 "operator","invalid_unicode_dash"
]);

test("context fixtures identify target assumptions and never imply a compiler pass",()=>{
 assert.equal(fixtures.schema_version,1);
 assert.equal(fixtures.status,"DRAFT_PARSER_CONTEXT_EXPECTATIONS_NOT_IMPLEMENTATION_EVIDENCE");
 assert.equal(fixtures.offset_encoding,"UTF-16");
 assert.equal(catalog.basis.guest_executions,0);
 assert.ok(fixtures.cases.length>=12);
 assert.equal(new Set(fixtures.cases.map(x=>x.id)).size,fixtures.cases.length);
 assert.ok(fixtures.cases.filter(x=>x.status==="TARGET_NOT_EXECUTED").length>=7);
});

for(const fixture of fixtures.cases){
 test("annotated semantic context: "+fixture.id,()=>{
  assert.ok(["TARGET_NOT_EXECUTED","DOCUMENTED_SYNTAX_NOT_EXECUTED"].includes(fixture.status));
  const spans=[...fixture.expected].sort((a,b)=>a.start-b.start);
  for(const t of spans){
   assert.ok(knownRoles.has(t.role),t.role);
   assert.equal(fixture.source.slice(t.start,t.start+t.length),t.text);
   assert.ok(t.length>0 && t.start>=0);
  }
  for(let i=1;i<spans.length;i++)assert.ok(spans[i-1].start+spans[i-1].length<=spans[i].start,"no overlapping roles");
 });
}

test("context-sensitive identifiers are not silently promoted to Java reserved words",()=>{
 for(const word of ["declare","state","pipe","sealed","singleton","final"]){
  assert.ok(!reserved.has(word),word);
  assert.ok(proposed.has(word),word);
 }
 assert.ok(reserved.has("stop") && reserved.has("do") && reserved.has("done"));
 const c=fixtures.cases.find(x=>x.id==="reserved-callable-context");
 assert.deepEqual(c.expected.filter(x=>["stop","do","done"].includes(x.text)).map(x=>x.role),[
  "method_identifier","method_identifier","method_identifier"
 ]);
});

test("namespace and actor state expectations are design-only, not Java parser output",()=>{
 const byId=new Map(fixtures.cases.map(x=>[x.id,x]));
 for(const id of ["target-declare-actor","use-namespace-header","namespace-method","sealed-actor-state","critical-state-compound"]){
  assert.equal(byId.get(id)?.status,"TARGET_NOT_EXECUTED",id);
 }
 assert.ok(fixtures.purpose.includes("not produced by a compiler"));
});
