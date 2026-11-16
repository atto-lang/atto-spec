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
  assert.equal(cases.length, 99);
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

test("prefix ~ binds the next operand independently of whitespace and trivia", () => {
  for (const [category, tight, spaced] of [
    ["formal", "(~{x: int, y: bool} p)", "(~ {x: int, y: bool} p)"],
    ["pattern", "on is ~{x: int} as val p", "on is ~ {x: int} as val p"],
    ["pattern", "on ~{x: 10, y: _} as val p", "on ~ {x: 10, y: _} as val p"],
    ["pattern", "on ~Point as val p", "on ~ Point as val p"],
    ["argument", "(p: ~value)", "(p: ~ value)"],
    ["argument", "(~(field: 42))", "(~ (field: 42))"],
    ["argument", "(~(key => 42))", "(~ (key => 42))"],
    ["argument", "(~())", "(~ ())"],
    ["pattern", "on ~{}", "on ~ {}"],
  ]) {
    const expected = has(category, tight) ? "accept" : "reject";
    assert.ok(has(category, tight, expected), tight);
    assert.ok(has(category, spaced, expected), spaced);
  }
  assert.ok(has("formal", "(~ /*gap*/ {x: int} p)"));
  assert.ok(has("pattern", "on ~ /*gap*/ {x: 10} as val p"));
  assert.ok(has("argument", "(payload: ~ {x: 10})", "reject"));
});

test("x?: literal is optional presence, y: _ is required presence", () => {
  for (const x of [
    "on ~{ x?: 10, y: _ } as val p",
    "on ~ { x?: 10, y: _ } as val p",
    "on structural {x?: 10, y: _} as val p",
    "on ~{x? : 10, y: _} as val p",
    "on ~{x ? : 10, y: _} as val p",
    "on ~{x?: _, y: _} as val p",
  ]) {
    // x?: _ is tracked independently from both the required y: _ and
    // the values of other pattern fields.
    if (x === "on ~{x?: _, y: _} as val p") continue;
    assert.ok(has("pattern", x), x);
  }
  assert.ok(has("pattern", "on ~{x?: _} as val p"));
  assert.ok(has("pattern", "on ~{x: 10, y?: _} as val p"));
  const target = cases.find(x => x.source === "on ~{ x?: 10, y: _ } as val p");
  assert.deepEqual(target.optional_fields, ["x"]);
  assert.equal(target.pattern_kind, "value_fields");
  for (const invalid of [
    "on ~{x?:}",
    "on ~{x??: 10}",
    "on ~{x?: 10, x: 11}",
    "on ~{x: 10, x?: 10}",
    "on ~{?: 10}",
    "on ~{x?: int}",
    "on is ~{x?: 10}",
    "on is ~{x?: int}",
    "on ~{x?: effectful()}",
    "on ~{x?: null}",
    "on ~{x?: 10,}",
    "on ~{x?: _ , x?: _}",
  ]) {
    assert.ok(has("pattern", invalid, "reject"), invalid);
  }
});
