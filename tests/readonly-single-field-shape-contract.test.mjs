import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const m=JSON.parse(readFileSync(new URL("../conformance/readonly-single-field-shape-abi-v0.json",import.meta.url),"utf8"));
test("bounded readonly single-field ABI registry integrity, not guest execution",()=>{
  assert.equal(m.version,"readonly-single-field-structural-call-v0");
  assert.equal(m.source_parser_only,true);
  assert.equal(m.cases.length,18);
  const ids=new Set();
  for(const c of m.cases){
    assert.ok(/^RSF\d{3}$/.test(c.id));
    assert.ok(!ids.has(c.id),"duplicate case "+c.id);ids.add(c.id);
    assert.ok(["accept","reject"].includes(c.expected));
    assert.ok(c.reason.length >= 5 && (c.source.includes("fnc ") || c.source.includes("routine ")));
  }
  assert.equal(m.cases.filter(x=>x.expected==="accept").length,5);
  assert.equal(m.cases.filter(x=>x.expected==="reject").length,13);
  for(const required of ["RSF004","RSF011","RSF012","RSF014","RSF017","RSF018"])
    assert.ok(ids.has(required));
});
