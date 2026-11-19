import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {applyRule, parseType, printType} from "../src/nested-wrappers.mjs";
const manifest = JSON.parse(readFileSync(new URL("../contracts/v1/nested-wrapper-v1.json", import.meta.url)));

test("normative vector IDs are unique and include both wrappers", () => {
  assert.equal(manifest.schema, "atto.nested-wrappers.v1");
  assert.equal(manifest.status, "NORMATIVE_DESIGN_NOT_GUEST_VERIFIED");
  assert.equal(new Set(manifest.vectors.map(v => v.id)).size, manifest.vectors.length);
  assert.ok(manifest.vectors.length >= 20);
  assert.ok(manifest.vectors.some(v => v.type.startsWith("Option")));
  assert.ok(manifest.vectors.some(v => v.type.startsWith("Future")));
});
for (const v of manifest.vectors) {
  test(v.id + " (type rule, NOT compiled guest)", () => {
    if (v.diagnostic) {
      assert.throws(() => applyRule(v.op, v.type, v.destination),
        e => e.message === v.diagnostic);
    } else {
      assert.equal(applyRule(v.op, v.type, v.destination), v.expect);
    }
  });
}
test("None and Some(None) remain distinct", () => {
  const v = manifest.value_distinctions[0];
  assert.equal(v.not_equal, true);
  assert.notDeepEqual(v.left, v.right);
});
test("mutation and malformed nested generics cannot bypass strictness", () => {
  for (const invalid of ["Future<Future<int>", "Option<>", "Future<int>>",
    "Future<Option<int>, int>", "Option", "Option<Unknown>", "Future<int>garbage",
    "Option<" + "Option<".repeat(17) + "int" + ">".repeat(18)]) {
    assert.throws(() => parseType(invalid), invalid);
  }
  assert.equal(printType(parseType("Option<Future<Option<int>>>")),
    "Option<Future<Option<int>>>");
  assert.throws(() => applyRule("assign", "Option<Option<int>>", "Option<int>"),
    /IMPLICIT_FLATTEN_FORBIDDEN/);
});
