import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(path.join(root, "contracts/attolang-effects-lifetimes-v1/contract.json"), "utf8"));

test("effects and lifetimes contract remains explicitly unverified", () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.contract_id, "attolang-effects-lifetimes-v1");
  assert.equal(contract.status, "TARGET_NOT_EXECUTED");
  assert.equal(contract.canonical_extension, ".atto");
  assert.deepEqual(contract.required_backends, ["llvm", "java", "wasm", "dotnet", "forge", "cranelift"]);
  assert.equal(contract.evidence.baseline, "NOT_EXECUTED");
  assert.equal(contract.evidence.eligible_tier, "ORES_GUEST_EXECUTED");
  for (const field of ["source_tree", "fixture_blob", "compiler_commit", "runner_id",
                       "executed_non_housekeeping_steps", "run_attempt", "artifact_sha256"]) {
    assert.ok(contract.evidence.required_fields.includes(field), field);
  }
  for (const inadmissible of ["zero_step_job", "host_only_test", "parser_only_test",
                              "generic_parse_error", "unverified_cross_org_mirror"]) {
    assert.ok(contract.evidence.rejected_as_proof.includes(inadmissible), inadmissible);
  }
});

test("semantic axioms never promote effects to ownership authority", () => {
  const m = contract.model;
  assert.equal(m.ownership, "SINGLE_OWNER_WITH_COMPATIBLE_LOANS");
  assert.equal(m.effect_rows, "TRANSITIVE_UPPER_BOUNDS_NOT_CAPABILITIES");
  assert.equal(m.unknown_target_in_strict_profile, "REJECT");
  assert.equal(m.latent_effects, "PRESERVE_THROUGH_CALLBACK_TASK_FUTURE");
  assert.equal(m.move_while_borrowed, "REJECT");
  assert.equal(m.alias_incompatible, "REJECT");
  assert.equal(m.retirement, "PHYSICAL_QUIESCENCE_REQUIRED_AFTER_LOGICAL_COMPLETION");
  assert.equal(m.cross_suspend_loan, "REJECT_UNLESS_PINNED_NONINTERFERING_AND_GENERATION_FENCED");
  assert.equal(m.readers_writer, "MULTIPLE_READERS_OR_ONE_WRITER_FAIR_NONPARKING");
  assert.equal(m.owner_transfer, "ATOMIC_INVALIDATE_PREVIOUS_AUTHORITY");
  assert.deepEqual(m.trap_discharge, ["throw"]);
  assert.deepEqual(m.trap_never_discharges, ["raise", "panic", "cancellation", "io"]);
});

test("candidate fixtures have distinct targeted oracles but no fake passes", () => {
  const cases = contract.cases;
  assert.equal(cases.length, 4);
  assert.equal(new Set(cases.map(c => c.id)).size, cases.length);
  const negative = new Map([
    ["move-while-borrowed-reject", "move_while_borrowed"],
    ["read-write-alias-reject", "incompatible_borrow"],
    ["borrow-across-suspension-reject", "borrow_across_suspension"]
  ]);
  for (const c of cases) {
    assert.equal(c.status, "AUTHORED_NOT_EXECUTED");
    assert.equal(c.path, `contracts/attolang-effects-lifetimes-v1/fixtures/${c.id}.atto`);
    const source = readFileSync(path.join(root, c.path), "utf8");
    assert.ok(source.includes("rt borrow owner"));
    assert.ok(source.endsWith("\n"));
    if (negative.has(c.id)) {
      assert.equal(c.kind, "compile_reject");
      assert.equal(c.diagnostic, negative.get(c.id));
      assert.equal(c.expected_exit, undefined);
    } else {
      assert.equal(c.id, "nll-last-use-positive");
      assert.equal(c.kind, "compile_and_execute");
      assert.equal(c.expected_exit, 42);
      assert.equal(c.diagnostic, null);
    }
  }
});
