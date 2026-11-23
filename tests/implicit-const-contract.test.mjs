import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = relative => readFileSync(path.join(root, relative), "utf8");
const contract = JSON.parse(read("contracts/implicit-const-v1/contract.json"));
const byId = new Map(contract.fixtures.map(f => [f.id, f]));

test("new binding contract is versioned, independent and explicitly unverified", () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.contract_id, "atto-implicit-const-v1");
  assert.equal(contract.status, "PROPOSED_NOT_VERIFIED");
  assert.equal(contract.source_extension, ".atto");
  assert.deepEqual(contract.required_backends, [
    "java", "llvm", "wasm", "dotnet", "forge", "cranelift"
  ]);
  assert.equal(contract.evidence_policy.baseline, "NOT_EXECUTED");
  assert.ok(contract.evidence_policy.reject_evidence.includes("source_only_contract_test"));
  assert.equal(contract.rules.shorthand_equivalence, "type_first_local_equals_explicit_compile_time_const");
  assert.equal(contract.rules.non_const_initializer, "reject_not_val_fallback");
  assert.equal(contract.rules.typed_colon_const, "const_name_colon_type_equivalent_to_const_type_name");
  assert.equal(contract.rules.bare_mut, "reject_missing_binding_qualifier_no_implicit_const_mut");
  assert.equal(contract.rules.global_const_mut, "reject");
  assert.equal(contract.rules.contextual_const, "runtime_immutable_binding_not_compile_time");
  assert.equal(contract.rules.fields, "out_of_scope");
  assert.equal(contract.rules.initialization_policy, "spec_chapter_28_explicit_initialization_no_implicit_defaults");
  assert.equal(contract.rules.local_without_initializer, "reject_even_if_assigned_later");
});

test("fixtures have unique paths and never claim guest execution", () => {
  assert.equal(contract.fixtures.length, 14);
  assert.equal(byId.size, contract.fixtures.length);
  const paths = new Set();
  for (const f of contract.fixtures) {
    assert.equal(f.status, "AUTHORED_NOT_EXECUTED");
    assert.match(f.path, /^contracts\/implicit-const-v1\/fixtures\/[a-z-]+\.atto$/);
    assert.ok(!paths.has(f.path), "duplicate fixture path");
    paths.add(f.path);
    const source = read(f.path);
    assert.ok(source.endsWith("\n"));
    assert.ok(source.includes("fnc main()"), "guest source, not a host model");
    if (f.kind === "compile_reject") {
      assert.equal(f.expected_exit, null);
      assert.match(f.expected_diagnostic_category, /^[a-z_]+$/);
    } else {
      assert.equal(f.kind, "compile_and_execute");
      assert.equal(f.expected_exit, 42);
      assert.equal(f.expected_diagnostic_category, null);
    }
    assert.equal(f.run_id, undefined);
  }
});

test("implicit and explicit constants carry the same positive and negative demands", () => {
  const positive = read(byId.get("implicit-explicit-equivalence-positive").path);
  assert.match(positive, /int left = 40;/);
  assert.match(positive, /const int right = 2;/);
  assert.match(positive, /return check;/);
  for (const id of ["implicit-rebind-reject", "explicit-rebind-reject"]) {
    assert.equal(byId.get(id).expected_diagnostic_category, "immutable_reassignment");
    assert.match(read(byId.get(id).path), /x = 42;/);
  }
  const implicit = byId.get("implicit-nonconst-reject");
  const explicit = byId.get("explicit-nonconst-reject");
  for (const f of [implicit, explicit]) {
    assert.equal(f.expected_diagnostic_category, "non_const_initializer");
    assert.match(read(f.path), /runtime_value\(\)/);
    assert.match(read(f.path), /stdio\.println\(0\)/);
  }
  assert.match(read(byId.get("val-let-runtime-positive").path), /mutable_name = immutable_name \+ 2;/);
});

test("type-right const annotation is explicit const, not runtime val", () => {
  const accepted = byId.get("typed-colon-equivalence-positive");
  assert.equal(accepted.kind, "compile_and_execute");
  const positive = read(accepted.path);
  assert.match(positive, /int shorthand = 10;/);
  assert.match(positive, /const int explicit_type_first = 20;/);
  assert.match(positive, /const explicit_type_right: int = 12;/);
  assert.match(positive, /return shorthand \+ explicit_type_first \+ explicit_type_right;/);

  const runtime = byId.get("typed-colon-nonconst-reject");
  assert.equal(runtime.expected_diagnostic_category, "non_const_initializer");
  assert.match(read(runtime.path), /const value: int = runtime_value\(\);/);
  const rebind = byId.get("typed-colon-rebind-reject");
  assert.equal(rebind.expected_diagnostic_category, "immutable_reassignment");
  assert.match(read(rebind.path), /const x: int = 10;/);
  assert.match(read(rebind.path), /x = 42;/);
});

test("bare mut is not a valid implicit const mut declaration", () => {
  const bare = byId.get("bare-mut-missing-qualifier-reject");
  assert.equal(bare.expected_diagnostic_category, "missing_binding_qualifier");
  assert.match(read(bare.path), /mut int value = 10;/);
  const chapter = read("spec/27-implicit-const-and-const-mut.md");
  assert.match(chapter, /mut T x = e;/);
  assert.match(chapter, /missing_binding_qualifier/);
});

test("const mut is explicit, fixed, scoped, actor-isolated by target contract", () => {
  assert.equal(byId.get("const-mut-scalar-reject").expected_diagnostic_category, "invalid_const_mut_target");
  assert.equal(byId.get("const-mut-rebind-reject").expected_diagnostic_category, "immutable_reassignment");
  assert.equal(byId.get("const-mut-global-reject").expected_diagnostic_category, "const_mut_storage_domain");
  const sample = read(byId.get("const-mut-fresh-instance-positive").path);
  assert.match(sample, /const mut object first/);
  assert.match(sample, /const mut object second/);
  assert.match(sample, /first\.count = 99;/);
  assert.match(sample, /return second\.count \+ 2;/);
  assert.ok(contract.future_required_proofs.includes("const_mut_actor_and_tenant_isolation"));
  assert.ok(contract.future_required_proofs.includes("formatter_idempotence"));
});

test("spec chapters name the semantic split and do not imply backend parity", () => {
  const chapter = read("spec/27-implicit-const-and-const-mut.md");
  assert.match(chapter, /PROPOSED \/ NOT EXECUTED/);
  assert.match(chapter, /non-constant initializer/);
  assert.match(chapter, /fresh actor-\/scope-owned mutable runtime instance/);
  for (const p of [
    "spec/01-source-and-syntax.md",
    "spec/02-types-and-patterns.md",
    "spec/04-ownership-and-memory.md",
    "spec/12-open-questions.md",
    "spec/16-lexical-and-grammar-reference.md",
    "spec/21-semantic-floor-and-parity.md",
    "README.md"
  ]) {
    assert.match(read(p), /27-implicit-const-and-const-mut\.md/);
  }
  const old = JSON.parse(read("contracts/attolang-semantic-floor-v1/contract.json"));
  assert.equal(old.status, "DRAFT_TARGET_NOT_VERIFIED");
  assert.equal(old.fixtures.length, 4);
});
