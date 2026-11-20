import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const fixture = JSON.parse(readFileSync(new URL("../conformance/namespaced-exports-v1.json", import.meta.url), "utf8"));
const spec = readFileSync(new URL("../language/namespaced-exports-v1.md", import.meta.url), "utf8");
const byId = new Map(fixture.cases.map((c) => [c.id, c]));

test("namespaced export registry is versioned and has no duplicate case ids", () => {
  assert.equal(fixture.schemaVersion, 1);
  assert.equal(fixture.feature, "namespaced-module-exports");
  assert.equal(fixture.contract, "language/namespaced-exports-v1.md");
  assert.equal(fixture.status, "target-not-backend-proof");
  assert.equal(byId.size, fixture.cases.length);
  assert.ok(fixture.cases.length >= 16);
  for (const c of fixture.cases) {
    assert.match(c.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(["parse", "compile", "link"].includes(c.phase), c.id);
    assert.ok(["accept", "reject"].includes(c.expect), c.id);
    if (c.expect === "reject") assert.match(c.diagnostic, /^[a-z][a-z0-9-]+$/, c.id);
    if (c.phase === "link") {
      assert.ok(c.provider?.package && c.provider?.namespace && c.provider?.file && c.provider?.source, c.id);
      assert.ok(c.importRequest?.consumerPackage && c.importRequest?.consumerNamespace && c.importRequest?.name, c.id);
    } else {
      assert.ok(typeof c.source === "string" && c.source.length > 10, c.id);
      assert.equal(c.provider, undefined, c.id);
    }
  }
});

test("file modules are exported, namespace headers are never exportable declarations", () => {
  assert.match(byId.get("public-module-forward").source, /^export pub module Arithmetic;/);
  assert.match(byId.get("public-module-trailing").source, /export pub module Arithmetic;\n/);
  assert.match(byId.get("explicit-namespace-and-function").source, /^use namespace storefront;/);
  assert.equal(byId.get("export-namespace-header").expect, "reject");
  assert.equal(byId.get("export-dotted-member").expect, "reject");
  assert.equal(byId.get("namespace-no-import-reexport").expect, "reject");
  assert.match(spec, /not a value, module, or exportable symbol/);
  assert.match(spec, /No dotted targets in v1/);
});

test("module and member access are gated separately across package identities", () => {
  const cross = byId.get("package-module-cross-package");
  const same = byId.get("package-module-same-package");
  assert.equal(cross.expect, "reject");
  assert.equal(same.expect, "accept");
  assert.equal(cross.provider.package, same.provider.package);
  assert.equal(cross.provider.source, same.provider.source);
  assert.notEqual(cross.importRequest.consumerPackage, cross.provider.package);
  assert.equal(same.importRequest.consumerPackage, same.provider.package);
  for (const id of ["public-module-private-member", "unexported-module-public-member"]) {
    assert.equal(byId.get(id).expect, "reject", id);
    assert.equal(byId.get(id).phase, "link", id);
  }
});

test("diagnostics cover scope, identity, kind, conflict, alias and privacy", () => {
  const forbidden = [
    "module-export-wrong-kind", "module-export-unknown", "module-export-duplicate",
    "nested-module-export", "export-namespace-header", "export-dotted-member",
    "namespace-header-late", "namespace-no-import-reexport", "conflicting-inline-export",
    "namespace-identity-not-leaf-name"
  ];
  for (const id of forbidden) assert.equal(byId.get(id)?.expect, "reject", id);
  assert.equal(byId.get("module-export-duplicate")?.diagnostic, "export-visibility-conflict");
  for (const id of ["module-export-identical-duplicate", "module-export-matching-inline"]) {
    assert.equal(byId.get(id)?.expect, "accept", id);
    assert.equal(byId.get(id)?.phase, "compile", id);
  }
  assert.ok(fixture.receiptRequirements.includes("source_commit_sha"));
  assert.ok(fixture.receiptRequirements.includes("source_tree_sha"));
  assert.ok(fixture.receiptRequirements.includes("linker_result_or_unsupported"));
  assert.match(spec, /Host JSON checks do not establish compiler support/);
});
