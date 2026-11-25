import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const registry=JSON.parse(readFileSync(new URL("../conformance/anonymous-structural-shapes-v1.json",import.meta.url),"utf8"));
const cases=registry.cases;
const find=(category,source,expect)=>cases.find(x=>x.category===category && x.source===source && x.expect===expect);

test("registry has unique bounded IDs and never advertises executable results",()=>{
  assert.equal(registry.contract,"atto.anonymous_structural_shapes.v1");
  assert.equal(registry.status,"TARGET_SOURCE_ONLY_NOT_EXECUTED");
  assert.equal(cases.length,50);
  assert.equal(new Set(cases.map(x=>x.id)).size,cases.length);
  for(const [i,x] of cases.entries()){
    assert.equal(x.id,`AS${String(i+1).padStart(3,"0")}`);
    assert.ok(["formal","pattern","argument","semantic"].includes(x.category));
    assert.ok(["accept","reject"].includes(x.expect));
    assert.ok(x.note && x.source);
  }
  assert.ok(cases.filter(x=>x.expect==="accept").length>=15);
  assert.ok(cases.filter(x=>x.expect==="reject").length>=15);
});
test("bare, tilde and long spelling of anonymous structural formals remain equivalent",()=>{
  for(const source of [
    "fnc inspect({foo: string} p): int { return 42; }",
    "fnc inspect(~{foo: string} p): int { return 42; }",
    "fnc inspect(p: structural {foo: string}): int { return 42; }"
  ]) assert.ok(cases.some(c=>c.source===source && c.expect==="accept"),source);
});
test("pattern 'is' discriminant and optional type vs value fields are enforced",()=>{
  for(const x of [
    ["on {foo: \"dog\"} as val p","accept"],
    ["on is {foo: \"dog\"} as val p","accept"],
    ["on is {foo: string | int} as val p","accept"],
    ["on {foo: string} as val p","reject"],
    ["on is {foo?: string} as val p","reject"],
    ["on {foo?: \"dog\", status: _} as val p","accept"]
  ]) assert.ok(find("pattern",x[0],x[1]),x.join(": "));
});
test("removed tilde record/map forms rejected and canonical Type.of retained",()=>{
  for(const x of ["f(p: ~(foo: \"dog\"))","f(p: ~ (k => \"dog\"))"])
    assert.ok(find("argument",x,"reject"),x);
  for(const x of ["f(p: Record.of(foo: \"dog\"))","f(p: Map.of(\"foo\", \"dog\"))"])
    assert.ok(find("argument",x,"accept"),x);
});
test("map, class, struct, record, ownership and effect proofs have positive/negative oracles",()=>{
  const joined=cases.filter(x=>x.category==="semantic").map(x=>x.source+" "+x.expect).join("\n");
  for(const word of ["Map<string, string>","private","actor_sealed","mutable","writable","effectful","narrowing","mutable_key_change","loan","recursive"]) {
    assert.ok(joined.includes(word),word);
  }
  assert.ok(cases.some(c=>c.category==="semantic"&&c.expect==="accept"&&c.source.includes("map_with_proven")));
});
