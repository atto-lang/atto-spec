import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFileSync(path.join(root, relative), "utf8");
const contract = JSON.parse(read("contracts/explicit-initialization-v1/contract.json"));
const byId = new Map(contract.fixtures.map(f => [f.id, f]));

test("explicit-initialization contract is versioned and unverified", () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.contract_id, "atto-explicit-initialization-v1");
  assert.equal(contract.status, "PROPOSED_NOT_VERIFIED");
  assert.equal(contract.spec_chapter, "28");
  assert.equal(contract.evidence_policy.baseline, "NOT_EXECUTED");
  assert.deepEqual(contract.required_backends, [
    "java", "llvm", "wasm", "dotnet", "forge", "cranelift"
  ]);
  assert.equal(contract.rules.implicit_zero_value, "reject");
  assert.equal(contract.rules.implicit_null_or_none, "reject");
  assert.equal(contract.rules.local_without_initializer, "reject_even_if_assigned_later");
  assert.equal(contract.rules.backend_uninitialized_storage, "unobservable_until_fully_initialized");
});

test("fixtures are unique, complete and make no execution claims", () => {
  assert.equal(contract.fixtures.length, 6);
  assert.equal(byId.size, contract.fixtures.length);
  const paths = new Set();
  for (const fixture of contract.fixtures) {
    assert.equal(fixture.status, "AUTHORED_NOT_EXECUTED");
    assert.match(fixture.path, /^contracts\/explicit-initialization-v1\/fixtures\/[a-z-]+\.atto$/);
    assert.ok(!paths.has(fixture.path), "duplicate fixture path");
    paths.add(fixture.path);
    const source = read(fixture.path);
    assert.ok(source.endsWith("\n"));
    assert.match(source, /fnc main\(/);
    if (fixture.kind === "compile_reject") {
      assert.equal(fixture.expected_exit, null);
      assert.match(fixture.expected_diagnostic_category, /^[a-z_]+$/);
    } else {
      assert.equal(fixture.kind, "compile_and_execute");
      assert.equal(fixture.expected_exit, 42);
      assert.equal(fixture.expected_diagnostic_category, null);
    }
    assert.equal(fixture.run_id, undefined);
  }
});

test("explicit scalar and optional values are positive fixtures", () => {
  const scalar = read(byId.get("explicit-scalar-initializers-positive").path);
  assert.match(scalar, /int zero = 0;/);
  assert.match(scalar, /bool disabled = false;/);
  assert.match(scalar, /string empty = "";/);
  const optional = read(byId.get("explicit-optional-values-positive").path);
  assert.match(optional, /Option<int> absent = None;/);
  assert.match(optional, /Option<int> present = Some\(42\);/);
});

test("uninitialized locals are rejected even when assigned before read", () => {
  for (const id of ["uninitialized-let-reject", "uninitialized-type-first-reject"]) {
    const fixture = byId.get(id);
    assert.equal(fixture.expected_diagnostic_category, "missing_initializer");
    const source = read(fixture.path);
    assert.match(source, /count;/);
    assert.match(source, /count = 42;/);
  }
});

test("missing aggregate and constructor values are rejected", () => {
  const struct = byId.get("missing-struct-field-reject");
  assert.equal(struct.expected_diagnostic_category, "missing_field_initializer");
  assert.match(read(struct.path), /Point\{x: 42\}/);
  const ctor = byId.get("incomplete-constructor-reject");
  assert.equal(ctor.expected_diagnostic_category, "incomplete_initialization");
  assert.match(read(ctor.path), /pub final int value;/);
  assert.match(read(ctor.path), /pub constructor \(Counter\)\(\): self/);
});

test("chapter 27 and chapter 28 are linked without conflating binding and initialization", () => {
  const chapter = read("spec/28-explicit-initialization-no-implicit-defaults.md");
  assert.match(chapter, /no implicit default-value or zero-value initialization/i);
  assert.match(chapter, /local storage is initialized as part of the declaration/i);
  assert.match(chapter, /binding.*does \*\*not\*\* define an initializer/is);
  const constChapter = read("spec/27-implicit-const-and-const-mut.md");
  assert.match(constChapter, /28-explicit-initialization-no-implicit-defaults\.md/);
  const readme = read("README.md");
  assert.match(readme, /28 — Explicit initialization and no implicit default values/);
});
