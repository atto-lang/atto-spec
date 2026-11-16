// Source-free fixture integrity checks. No AttoLang compiler is invoked here.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";
const fixture = JSON.parse(readFileSync(new URL("../conformance/structural-tilde-v1.json", import.meta.url), "utf8"));
const cases = fixture.cases;
function has(category, source, expect = "accept") {
  return cases.some(v => v.category === category && v.source === source && v.expect === expect);
}
test("contract remains explicitly non-executable and versioned", () => {
  assert.equal(fixture.contract, "atto.structural_tilde.v1");
  assert.equal(fixture.status, "TARGET_NOT_EXECUTED");
  assert.equal(cases.length, 56);
  assert.equal(new Set(cases.map(v => v.id)).size, cases.length);
  for (const v of cases) {
    assert.match(v.id, /^ST\d{3}$/);
    assert.ok(["formal", "argument", "pattern"].includes(v.category));
    assert.ok(["accept", "reject"].includes(v.expect));
    assert.ok(v.source && v.note);
  }
  assert.ok(cases.filter(v => v.expect === "accept").length >= 20);
  assert.ok(cases.filter(v => v.expect === "reject").length >= 15);
});
test("formals and patterns preserve alias-pair acceptance", () => {
  for (const [cat, a, b] of [
    ["formal", "(~Point p)", "(structural Point p)"],
    ["formal", "(p: ~Point)", "(p: structural Point)"],
    ["pattern", "on is ~Point as val p", "on is structural Point as val p"],
    ["pattern", "on ~Point as let p", "on structural Point as let p"],
  ]) {
    assert.ok(has(cat, a), a);
    assert.ok(has(cat, b), b);
  }
});
test("aggregate delimiters remain distinct from named args and structural values", () => {
  assert.ok(has("argument", "(payload: ~(field: 42))"));
  assert.ok(has("argument", "(payload: ~(key => 42))"));
  assert.ok(has("argument", "(p: ~value)"));
  for (const ambiguous of ["(~())", "(~(value))", "(~ (value))", "(~(x: 1, k => 2))"]) {
    assert.ok(has("argument", ambiguous, "reject"), ambiguous);
  }
});
test("regressions include guard, duplicates, type fields and nested colons", () => {
  assert.ok(cases.some(v => v.category === "pattern" && v.expect === "accept" && v.source.includes(" when ")));
  assert.ok(cases.some(v => v.category === "formal" && v.expect === "reject" && v.note.includes("duplicate")));
  assert.ok(cases.some(v => v.category === "argument" && v.expect === "reject" && v.note.includes("positional after")));
  assert.ok(cases.some(v => v.category === "argument" && v.expect === "accept" && v.source.includes(" ? ")));
  assert.ok(cases.some(v => v.category === "formal" && v.expect === "accept" && v.source.includes("~{")));
});

test("is marks structural type checks; omitting it denotes field-value matching", () => {
  const matches = (source, expect = "accept") =>
    cases.filter(c => c.category === "pattern" && c.source === source && c.expect === expect);
  const type = matches("on is ~Point as val p");
  assert.ok(type.some(c => c.pattern_kind === "type_test" && c.context?.Point === "type"));
  const value = matches("on ~Point as val p");
  assert.ok(value.some(c => c.pattern_kind === "value_constant" &&
    c.context?.Point === "immutable_structural_value"));
  assert.ok(matches("on ~Point as val p", "reject")
    .some(c => c.context?.Point === "type-only"));
  assert.ok(matches("on ~Point as val p", "reject")
    .some(c => c.context?.Point === "mutable_value"));
  assert.ok(matches("on is ~Point as val p", "reject")
    .some(c => c.context?.Point === "const_structural_value_only"));
  assert.ok(matches("on ~{x: 10, y: _} as val p")
    .some(c => c.pattern_kind === "value_fields"));
  assert.ok(matches("on structural {x: 10, y: _} as val p")
    .some(c => c.pattern_kind === "value_fields"));
  assert.ok(matches("on ~{x: int} as val p", "reject").length);
  assert.ok(matches("on is ~{x: 10} as val p", "reject").length);
  assert.ok(matches("on ~{}", "reject").length);
  assert.ok(matches("on ~{x: effectful()}", "reject").length);
});
