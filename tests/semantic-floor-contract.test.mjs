import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = JSON.parse(readFileSync(path.join(root, "contracts/attolang-semantic-floor-v1/contract.json"), "utf8"));
const expected = ["llvm", "java", "wasm", "dotnet", "forge", "cranelift"];
test("canonical semantic contract is staged, never a fake backend pass", () => {
  assert.equal(contract.schema_version, 1);
  assert.equal(contract.contract_id, "attolang-semantic-floor-v1");
  assert.equal(contract.status, "DRAFT_TARGET_NOT_VERIFIED");
  assert.deepEqual(contract.required_backends, expected);
  assert.equal(contract.source_policy.canonical_extension, ".atto");
  assert.equal(contract.source_policy.legacy_admission, "versioned_migration_only");
  assert.equal(contract.evidence_policy.baseline, "NOT_EXECUTED");
  assert.equal(contract.evidence_policy.eligible_parity_tier, "ORES_GUEST_EXECUTED");
  assert.ok(contract.evidence_policy.rejected_as_proof.includes("zero_step_job"));
  assert.ok(contract.evidence_policy.rejected_as_proof.includes("host_only_test"));
});
test("each semantic feature is uniquely identified and unverified", () => {
  const ids = contract.features.map(f => f.id);
  assert.equal(ids.length, 9);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes("critical-suspends-effect-separation"));
  assert.ok(ids.includes("canonical-core-std-identity"));
  for (const feature of contract.features) {
    assert.equal(feature.status, "TARGET_NOT_VERIFIED");
    assert.match(feature.spec_chapter, /^\d{2}$/);
    assert.ok(feature.decision.length > 30);
  }
});
test("candidate .atto files exist and targeted rejections have explicit categories", () => {
  assert.equal(contract.fixtures.length, 4);
  const ids = new Set(contract.fixtures.map(f => f.id));
  assert.equal(ids.size, 4);
  for (const f of contract.fixtures) {
    assert.equal(f.status, "AUTHORED_NOT_EXECUTED");
    assert.match(f.path, /^contracts\/attolang-semantic-floor-v1\/fixtures\/[a-z-]+\.atto$/);
    const data = readFileSync(path.join(root, f.path), "utf8");
    assert.ok(data.includes("fnc"));
    assert.ok(data.endsWith("\n"));
    assert.ok(contract.features.some(feature => feature.id === f.feature));
    if (f.kind === "compile_reject") {
      assert.equal(f.expected_exit, null);
      assert.ok(f.expected_diagnostic_category);
    } else {
      assert.equal(f.kind, "compile_and_execute");
      assert.equal(f.expected_exit, 42);
      assert.equal(f.expected_diagnostic_category, null);
    }
  }
  assert.ok(contract.fixtures.every(f => ids.has(f.id)));
});
