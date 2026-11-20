// Host-only conservative structural-member witness reference model.
// This never calls an Atto compiler, emits Wasm or proves a guest ABI.
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../conformance/structural-member-witness-v1.json", import.meta.url), "utf8"));
const arr = x => Array.isArray(x) ? x : [];
const fail = code => ({ok:false,code});
const OK = {ok:true};

function compare_method(want, have) {
  if ((have.async ?? false) !== (want.async ?? false) ||
      have.returns !== want.returns ||
      JSON.stringify(have.params ?? []) !== JSON.stringify(want.params ?? []) ||
      JSON.stringify(have.generic_constraints ?? []) !== JSON.stringify(want.generic_constraints ?? []))
    return fail("E_METHOD_SIGNATURE");
  if (want.receiver === "readonly" && have.receiver !== "readonly")
    return fail("E_METHOD_RECEIVER");
  if ((have.ownership ?? "borrow") !== (want.ownership ?? "borrow"))
    return fail("E_METHOD_OWNERSHIP");
  const allowed = new Set(arr(want.effects));
  if (arr(have.effects).some(effect => !allowed.has(effect)))
    return fail("E_METHOD_EFFECT");
  return OK;
}

function witness(required, actual) {
  if (required.kind === "interface" && arr(required.fields).length)
    return fail("E_INTERFACE_DATA");
  if (required.tenant && actual.tenant && required.tenant !== actual.tenant)
    return fail("E_TENANT_BOUNDARY");

  if (required.kind === "tuple") {
    if (actual.kind !== "tuple") return fail("E_TUPLE_KIND");
    const want = arr(required.elements), have = arr(actual.elements);
    if (want.length !== have.length) return fail("E_TUPLE_ARITY");
    if (want.some((t,i) => t !== have[i])) return fail("E_TUPLE_ELEMENT");
  }
  if (required.kind === "map") {
    const mapped = actual.kind === "map" ? actual : actual.mapping;
    if (!mapped || (actual.kind !== "map" && mapped.validated !== true) ||
        mapped.validated === false)
      return fail("E_MAP_ADAPTER");
    if (mapped.key_type !== required.key_type ||
        mapped.value_type !== required.value_type)
      return fail("E_MAP_TYPE");
  }

  for (const wanted of arr(required.fields)) {
    if (wanted.visibility !== "public") continue;
    let found;
    if (actual.kind === "map") {
      const keys = actual.guaranteed_keys ?? {};
      if (!Object.prototype.hasOwnProperty.call(keys, wanted.name))
        return fail("E_MAP_KEY_PROOF");
      if (actual.snapshot_safe !== true)
        return fail("E_MAP_SNAPSHOT");
      found = {name:wanted.name, type:keys[wanted.name], readable:true, visibility:"public"};
    } else {
      found = arr(actual.fields).find(f => f.name === wanted.name);
    }
    if (!found) return fail("E_MISSING_FIELD");
    if (found.visibility !== "public" || found.readable !== true)
      return fail("E_INACCESSIBLE_FIELD");
    if (arr(found.getter_effects).length)
      return fail("E_FIELD_EFFECT");
    if (found.type !== wanted.type)
      return fail("E_FIELD_TYPE");
    if (wanted.writable === true && found.writable !== true)
      return fail("E_FIELD_WRITE");
  }

  for (const wanted of arr(required.methods)) {
    if (wanted.visibility !== "public") continue;
    const sameName = arr(actual.methods).filter(v => v.name === wanted.name);
    const exposed = sameName.filter(v => v.kind === "instance" && v.visibility === "public");
    if (!exposed.length) {
      if (sameName.some(v => v.kind === "instance" && v.visibility !== "public"))
        return fail("E_INACCESSIBLE_METHOD");
      return fail("E_MISSING_METHOD");
    }
    // This deliberately does not guess between several incompatible overloads.
    const results = exposed.map(v => compare_method(wanted,v));
    if (!results.some(v => v.ok)) return results[0];
    if (results.filter(v => v.ok).length !== 1) return fail("E_METHOD_AMBIGUOUS");
  }
  return OK;
}

test("source-free schema is explicit about lack of backend execution", () => {
  assert.equal(fixture.schema, "atto.structural-member-witness.v1");
  assert.equal(fixture.status, "HOST_REFERENCE_ONLY_NOT_GUEST_EXECUTED");
  assert.deepEqual(fixture.alias, ["~Type","structural Type"]);
  assert.equal(fixture.cases.length,43);
  assert.equal(new Set(fixture.cases.map(v=>v.id)).size,fixture.cases.length);
  assert.deepEqual([...new Set(fixture.cases.map(v=>v.required.kind))].sort(),
    ["class","interface","map","record","struct","trait","tuple"]);
  assert.ok(fixture.cases.some(v=>v.expected==="reject"));
  assert.ok(fixture.cases.some(v=>v.expected==="accept"));
});

test("each required exported member is conjunctively satisfied, not merely overlapped", () => {
  for (const {id,required,actual,expected,code} of fixture.cases) {
    const result = witness(required,actual);
    assert.equal(result.ok,expected==="accept",id);
    if (expected==="reject") assert.equal(result.code,code,id);
  }
});

test("tilde and structural spellings share one witness identity in the model", () => {
  const structural = target => ({...target,operator:"structural"});
  const shorthand = target => ({...target,operator:"~"});
  for (const item of fixture.cases) {
    assert.deepEqual(witness(structural(item.required),item.actual),
      witness(shorthand(item.required),item.actual), item.id);
  }
});

test("declaration order, extra public members, and unrelated storage layout do not change readonly structural identity", () => {
  const point = fixture.cases.find(v=>v.id==="SW013");
  assert.equal(witness(point.required,point.actual).ok,true);
  const reordered = {...point.actual,fields:[...point.actual.fields].reverse()};
  assert.equal(witness(point.required,reordered).ok,true);
  assert.equal(witness(point.required,{...point.actual,layout:"different"}).ok,true);
});

test("dynamic Map<string,int> is never evidence that a particular key is present", () => {
  for (const id of ["SW034","SW036","SW037"]) {
    const item = fixture.cases.find(v=>v.id===id);
    assert.equal(witness(item.required,item.actual).ok,false,id);
  }
  const proven = fixture.cases.find(v=>v.id==="SW035");
  assert.equal(witness(proven.required,proven.actual).ok,true);
});
