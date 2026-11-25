import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(path.join(root, "conformance/inherited-field-aliases-v1.json"), "utf8"));

function check_contract(data) {
  assert.equal(data.schema_version, 1);
  assert.equal(data.contract_id, "atto-inherited-field-aliases-v1");
  assert.equal(data.status, "DRAFT_TARGET_NOT_VERIFIED");
  assert.equal(data.canonical_member_qualifier, ".");
  assert.equal(data.forbidden_member_qualifier, "::");
  assert.deepEqual(data.required_backends, ["java", "llvm", "wasm", "forge", "dotnet"]);
  assert.equal(data.evidence_policy.baseline, "NOT_EXECUTED");
  assert.equal(data.evidence_policy.compiler_execution_required, true);
  assert.equal(data.evidence_policy.host_registry_validation_is_not_guest_proof, true);
  assert.equal(data.cases.length, 26);
  const ids = data.cases.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of data.cases) {
    assert.match(c.id, /^[a-z][a-z0-9_]+$/);
    assert.equal(c.status, "NOT_EXECUTED");
    assert.match(c.source, /pub fnc main\(\)/);
    assert.ok(c.source.endsWith("\n"));
    if (c.kind === "compile_and_execute") {
      assert.ok(Number.isInteger(c.expected_exit));
      assert.equal(c.expected_diagnostic_category, null);
      assert.doesNotMatch(c.source, /use\s+\w+::\w+/);
    } else {
      assert.equal(c.kind, "compile_reject");
      assert.equal(c.expected_exit, null);
      assert.match(c.expected_diagnostic_category, /^E_[A-Z_]+$/);
    }
  }
  const by_id = Object.fromEntries(data.cases.map(c => [c.id, c]));
  assert.match(by_id.two_independent_field_slots.source, /use Dog\.age as dog_age;/);
  assert.match(by_id.two_independent_field_slots.source, /use Cat\.age as cat_age;/);
  assert.match(by_id.two_independent_field_slots.source, /return hybrid\.dog_age \+ hybrid\.cat_age;/);
  assert.equal(by_id.two_independent_field_slots.expected_exit, 15);
  assert.match(by_id.cpp_scope_separator_rejected.source, /use Dog::age as dog_age;/);
  assert.equal(by_id.cpp_scope_separator_rejected.expected_diagnostic_category, "E_SYNTAX");
  assert.equal(by_id.unresolved_field_collision.expected_diagnostic_category, "E_AMBIGUOUS_MEMBER");
  assert.equal(by_id.private_inherited_field.expected_diagnostic_category, "E_ALIAS_VISIBILITY");
  assert.equal(by_id.method_target_not_field.expected_diagnostic_category, "E_ALIAS_TARGET");
}

test("dot-qualified alias conformance registry has coherent draft cases", () => {
  check_contract(contract);
});

test("registry validation detects bad separators and false guest certification", () => {
  assert.throws(() => check_contract({ ...contract, canonical_member_qualifier: "::" }));
  assert.throws(() => check_contract({ ...contract, status: "IMPLEMENTED" }));
  const mutated = structuredClone(contract);
  mutated.cases[0].source = mutated.cases[0].source.replace("Dog.age", "Dog::age");
  assert.throws(() => check_contract(mutated));
});

test("registry validation rejects duplicate identifiers and missing diagnostics", () => {
  const duplicate = structuredClone(contract);
  duplicate.cases[1].id = duplicate.cases[0].id;
  assert.throws(() => check_contract(duplicate));
  const missing = structuredClone(contract);
  missing.cases.find(c => c.id === "unknown_field").expected_diagnostic_category = null;
  assert.throws(() => check_contract(missing));
});

test("audit matrix covers namespace, route, layout and authority boundaries", () => {
  const byId = Object.fromEntries(contract.cases.map(c => [c.id, c]));
  for (const [id, code] of [
    ["alias_without_parent", "E_ALIAS_TARGET"],
    ["alias_from_non_ancestor_class", "E_ALIAS_TARGET"],
    ["alias_at_module_root", "E_SYNTAX"],
    ["alias_in_method_body", "E_SYNTAX"],
    ["alias_collides_with_local_method", "E_ALIAS_DUPLICATE"],
    ["alias_shadows_inherited_member", "E_ALIAS_DUPLICATE"],
    ["alias_rejects_private_projection", "E_ALIAS_VISIBILITY"],
    ["alias_rejects_final_write", "E_ALIAS_OWNERSHIP"],
    ["shared_grandparent_ambiguous_route", "E_UNSUPPORTED"],
    ["actor_sealed_state_not_aliased", "E_ALIAS_OWNERSHIP"],
    ["malformed_alias_missing_as", "E_SYNTAX"],
    ["malformed_alias_missing_semicolon", "E_SYNTAX"],
  ]) {
    assert.equal(byId[id].kind, "compile_reject", id);
    assert.equal(byId[id].expected_diagnostic_category, code, id);
  }
  assert.equal(byId.transitive_unique_ancestor_route.expected_exit, 7);
  assert.equal(contract.cases.filter(c => c.kind === "compile_and_execute").length, 3);
  assert.equal(contract.cases.filter(c => c.kind === "compile_reject").length, 23);
});
test("audit matrix rejects inconsistent case provenance, exit codes and guest status", () => {
  const fakeGuest = structuredClone(contract);
  fakeGuest.cases[1].status = "PASS";
  assert.throws(() => check_contract(fakeGuest));
  const badExit = structuredClone(contract);
  badExit.cases.find(c => c.id === "alias_without_parent").expected_exit = 5;
  assert.throws(() => check_contract(badExit));
  const badCode = structuredClone(contract);
  badCode.cases.find(c => c.id === "alias_at_module_root").expected_diagnostic_category = "PASS";
  assert.throws(() => check_contract(badCode));
});
