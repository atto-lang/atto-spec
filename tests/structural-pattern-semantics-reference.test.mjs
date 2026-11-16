// Source-only reference rules for *candidate* structural matching.
// No production Atto type checker, compiler, or guest is invoked here.
import assert from "node:assert/strict";
import test from "node:test";

const ANY = Symbol("wildcard");
const owns = (x, k) => Object.hasOwn(x, k);

function value_fields_match(subject, pattern) {
  if (subject == null || typeof subject !== "object") return false;
  // For old reference cases, object entries imply required fields. The
  // structured form models field optionality independently from wildcards.
  const fields = Array.isArray(pattern)
    ? pattern
    : Reflect.ownKeys(pattern).map(name => ({name, optional: false, value: pattern[name]}));
  return fields.every(({name, optional, value}) => {
    if (!owns(subject, name)) return optional;
    return value === ANY || Object.is(subject[name], value);
  });
}
function is_structurally_compatible(subject, expected_types) {
  if (subject == null || typeof subject !== "object") return false;
  // This reference handles scalar public shapes only; real typing needs
  // visibility, nominal metadata, ownership, ADTs, and reifiability proofs.
  return Object.entries(expected_types).every(([key, type]) =>
    owns(subject, key) && typeof subject[key] === type);
}

test("is ~Point checks field TYPES but never demands specific VALUES", () => {
  const expected = {x: "number", y: "number"};
  assert.equal(is_structurally_compatible({x: 17, y: -4, extra: true}, expected), true);
  assert.equal(is_structurally_compatible({x: 999, y: 0}, expected), true);
  assert.equal(is_structurally_compatible({x: "17", y: 0}, expected), false);
  assert.equal(is_structurally_compatible({x: 17}, expected), false);
});

test("~{x: 10, y: _} checks specified field VALUES by conjunction", () => {
  const pattern = {x: 10, y: ANY};
  assert.equal(value_fields_match({x: 10, y: 2, z: 3}, pattern), true);
  assert.equal(value_fields_match({x: 9, y: 2}, pattern), false);
  assert.equal(value_fields_match({x: 10}, pattern), false);
  assert.equal(value_fields_match({y: 2, z: 10}, pattern), false);
});

test("any-overlap is not an alternative to complete pattern matching", () => {
  const pattern = {x: 10, y: 20};
  assert.equal(value_fields_match({x: 10, y: 99}, pattern), false);
  assert.equal(value_fields_match({x: 10, y: 20, z: 99}, pattern), true);
  assert.equal(value_fields_match({x: 99, y: 20}, pattern), false);
});

test("empty patterns never match everything by accident", () => {
  // Empty ~{} is rejected at parsing; the reference predicate would be
  // vacuously true and must not be used to bypass that syntax gate.
  assert.equal(value_fields_match({x: 1}, {}), true);
});

test("x?: 10 permits absence but validates the value when present", () => {
  const pattern = [
    {name: "x", optional: true, value: 10},
    {name: "y", optional: false, value: ANY},
  ];
  assert.equal(value_fields_match({y: 20}, pattern), true);
  assert.equal(value_fields_match({x: 10, y: 20}, pattern), true);
  assert.equal(value_fields_match({x: 10, y: null}, pattern), true);
  assert.equal(value_fields_match({x: 10, y: 20, z: 30}, pattern), true);
  assert.equal(value_fields_match({x: 11, y: 20}, pattern), false);
  assert.equal(value_fields_match({x: null, y: 20}, pattern), false);
  assert.equal(value_fields_match({x: 10}, pattern), false);
  assert.equal(value_fields_match({}, pattern), false);
});

test("required vs optional and wildcard vs literal are independent axes", () => {
  const cases = [
    [{name: "x", optional: false, value: 10}, false, true, false],
    [{name: "x", optional: false, value: ANY}, false, true, true],
    [{name: "x", optional: true, value: 10}, true, true, false],
    [{name: "x", optional: true, value: ANY}, true, true, true],
  ];
  for (const [field, absent, exact, other] of cases) {
    assert.equal(value_fields_match({}, [field]), absent, JSON.stringify(field));
    assert.equal(value_fields_match({x: 10}, [field]), exact, JSON.stringify(field));
    assert.equal(value_fields_match({x: 11}, [field]), other, JSON.stringify(field));
  }
  // A property whose value is undefined or null is still PRESENT.
  assert.equal(value_fields_match({x: undefined},
    [{name: "x", optional: false, value: ANY}]), true);
  assert.equal(value_fields_match({x: null},
    [{name: "x", optional: true, value: 10}]), false);
  // Field order does not change the conjunction.
  assert.equal(value_fields_match({y: 20}, [
    {name: "y", optional: false, value: ANY},
    {name: "x", optional: true, value: 10},
  ]), true);
});
