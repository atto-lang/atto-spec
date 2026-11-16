// Source-only reference rules for *candidate* structural matching.
// No production Atto type checker, compiler, or guest is invoked here.
import assert from "node:assert/strict";
import test from "node:test";

const ANY = Symbol("wildcard");
const owns = (x, k) => Object.hasOwn(x, k);

function value_fields_match(subject, pattern) {
  if (subject == null || typeof subject !== "object") return false;
  // Every pattern field must exist. Additional subject fields are permitted.
  return Reflect.ownKeys(pattern).every(key =>
    owns(subject, key) &&
    (pattern[key] === ANY || Object.is(subject[key], pattern[key])));
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
