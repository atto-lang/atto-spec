import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const root=new URL("../",import.meta.url);
const m=JSON.parse(readFileSync(new URL("../contracts/optional-named-parameters-v1/guest-target.json",import.meta.url),"utf8"));
test("canonical .atto candidates are authored but not certified by host tests",()=>{
  assert.equal(m.schema,"attolang.optional-named-guest-target.v1");
  assert.equal(m.status,"AUTHORED_NOT_EXECUTED");
  assert.equal(m.fixtures.length,17);
  assert.ok(Object.values(m.backends).every(x=>x==="NOT_EXECUTED"));
  assert.equal(new Set(m.fixtures.map(f=>f.path)).size,17);
  for(const f of m.fixtures){
    assert.match(f.path,/^contracts\/optional-named-parameters-v1\/fixtures\/[a-z_0-9]+\.atto$/);
    assert.equal(f.status,"AUTHORED_NOT_EXECUTED");
    const source=readFileSync(new URL("../"+f.path,import.meta.url),"utf8");
    assert.ok(source.includes("pub fnc main()"),f.path);
    assert.ok(source.includes("fnc "),f.path);
    assert.ok(source.endsWith("\n"),f.path);
    if(f.kind==="execute"){
      assert.equal(f.expected_exit,f.path.endsWith('/namefirst_calculate_default_30.atto')?30:42);
      assert.equal(f.expected_diagnostic_category,null);
    }else{
      assert.equal(f.kind,"reject");
      assert.equal(f.expected_exit,null);
      assert.ok(f.expected_diagnostic_category);
    }
  }
});
