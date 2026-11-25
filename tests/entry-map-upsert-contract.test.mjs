import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const manifest = JSON.parse(readFileSync(new URL("../conformance/entry-map-upsert-v1.json", import.meta.url)));
const guest = readFileSync(new URL("../conformance/entry-map-upsert-v1.atto", import.meta.url), "utf8");

test("Entry/Map contract is explicitly target-only (NOT guest execution)", () => {
  assert.equal(manifest.schema, "atto.entry-map-upsert.v1");
  assert.equal(manifest.status, "TARGET_NOT_EXECUTED");
  assert.equal(manifest.guest_required, true);
  const ids = manifest.vectors.map(v => v.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.length >= 15);
  for (const v of manifest.vectors) {
    assert.ok(v.kind === "positive" || v.kind === "negative");
    assert.ok(v.source || v.fixture);
    if (v.kind === "negative") assert.match(v.diagnostic, /^E_[A-Z_]+$/);
    else assert.ok(v.expect);
  }
});

test("full guest fixture contains actual nominal Entry, typed Map, all three upserts and safe get", () => {
  for (const fragment of [
    'let Entry<string, int> entry = "foo" => 5;',
    'let mut Map<string, int> x',
    'x.set("foo", 6);',
    'x["foo"] = 3;',
    'x.add(entry);',
    'x.get("foo").unwrap()',
    'Expect 5',
  ]) {
    assert.ok(guest.includes(fragment), fragment);
  }
});

test("negative vectors include critical distinct semantic guards", () => {
  for (const id of [
    "entry-nonassociative", "entry-bad-arity", "entry-not-record",
    "entry-immutable-projection", "map-no-mut-authority",
    "map-wrong-value", "map-duplicate-literal", "map-missing-unwrap",
  ]) {
    assert.ok(manifest.vectors.some(v => v.id === id && v.kind === "negative"), id);
  }
});
