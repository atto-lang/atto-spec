import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../conformance/declarative-exports-v1.json", import.meta.url), "utf8"));
const spec = readFileSync(new URL("../language/declarative-exports.md", import.meta.url), "utf8");
const byId = new Map(fixture.cases.map(c => [c.id,c]));

test("declarative export vectors have unique IDs and consistent outcomes", () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.feature, "declarative-file-exports");
  assert.equal(byId.size, fixture.cases.length);
  for (const c of fixture.cases) {
    assert.ok(["accept","reject"].includes(c.expect), c.id);
    if (c.expect === "reject") assert.match(c.diagnostic, /^[a-z-]+$/, c.id);
  }
});
test("identical source bindings deduplicate while scope conflicts reject", () => {
  const same = byId.get("duplicate-export");
  assert.equal(same.phase, "compile");
  assert.equal(same.expect, "accept");
  assert.equal(same.diagnostic, undefined);
  assert.match(same.source, /export pub Foo;/);
  assert.match(same.source, /export pub class Foo;/);
  const conflicting = byId.get("duplicate-export-conflicting-scope");
  assert.equal(conflicting.phase, "compile");
  assert.equal(conflicting.expect, "reject");
  assert.equal(conflicting.diagnostic, "export-visibility-conflict");
  assert.match(spec, /idempotent/);
  assert.match(spec, /one source\/ABI binding/);
});
