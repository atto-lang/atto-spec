#!/usr/bin/env python3
"""Fail-closed evidence SCHEMA checks for the draft full-AOT feature ledger.

This validates metadata shape only; it cannot authenticate CI, hashes, compiled
Atto guests, or exact-tree mirrors. Independent execution review is required.
"""
import json
import pathlib
import re
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "conformance/full-aot-feature-coverage-v1.json"
AOT_MODE = {
    "java-native-image": "graal-native-image",
    "llvm-native": "llvm-native",
    "dotnet-nativeaot": "dotnet-nativeaot",
    "rust-wasm-precompiled": "rust-wasm-precompiled",
}
HEX40 = re.compile(r"[0-9a-f]{40}\Z")
HEX64 = re.compile(r"[0-9a-f]{64}\Z")
RUN_URL = re.compile(r"https://github\.com/[^/\s]+/[^/\s]+/actions/runs/[1-9][0-9]*\Z")


def fail(message):
    raise ValueError(message)


def required_text(record, key, path):
    value = record.get(key)
    if not isinstance(value, str) or not value.strip():
        fail(f"{path}.{key}: required nonempty string")
    return value


def validate_receipt(backend, receipt, path):
    if backend not in AOT_MODE:
        fail(f"{path}: unknown backend {backend}")
    if not isinstance(receipt, dict):
        fail(f"{path}: receipt must be structured, not a URL/string")
    if required_text(receipt, "aot_mode", path) != AOT_MODE[backend]:
        fail(f"{path}: wrong AOT target/mode")
    repository = required_text(receipt, "source_repository", path)
    if not re.fullmatch(r"atto-lang/[A-Za-z0-9_.-]+", repository):
        fail(f"{path}: source repository must be identified")
    for key, pattern in [("source_sha", HEX40), ("source_tree_sha", HEX40),
                         ("artifact_sha256", HEX64)]:
        if not pattern.fullmatch(required_text(receipt, key, path)):
            fail(f"{path}.{key}: malformed source or artifact digest")
    if not RUN_URL.fullmatch(required_text(receipt, "run_url", path)):
        fail(f"{path}: run URL must identify a concrete Actions run")
    if type(receipt.get("job_id")) is not int or receipt["job_id"] <= 0:
        fail(f"{path}: missing executed job ID")
    if type(receipt.get("executed_steps")) is not int or receipt["executed_steps"] < 3:
        fail(f"{path}: checkout/build/guest steps not executed")
    for key in ("toolchain", "target_triple"):
        required_text(receipt, key, path)
    for key in ("host_only", "jit_required", "runtime_codegen"):
        if receipt.get(key) is not False:
            fail(f"{path}: {key} must explicitly be false")
    if receipt.get("source_tree_verified") is not True:
        fail(f"{path}: exact source tree verification missing")
    if receipt.get("guest_execution") != "PASS":
        fail(f"{path}: source-compiled guest execution not PASS")

    positives = receipt.get("positive_guest_cases")
    negatives = receipt.get("negative_no_artifact_cases")
    if not isinstance(positives, list) or not positives:
        fail(f"{path}: positive compiled guest tests required")
    if not isinstance(negatives, list) or not negatives:
        fail(f"{path}: negative no-artifact compiler tests required")
    seen = set()
    for case in positives:
        if not isinstance(case, dict):
            fail(f"{path}: positive case must be a record")
        key = required_text(case, "fixture", path)
        if key in seen:
            fail(f"{path}: duplicate fixture {key}")
        seen.add(key)
        if case.get("executed") is not True or case.get("result") != "PASS":
            fail(f"{path}: positive guest fixture not executed successfully")
        if not HEX64.fullmatch(required_text(case, "artifact_sha256", path)):
            fail(f"{path}: positive guest artifact digest missing")
    for case in negatives:
        if not isinstance(case, dict):
            fail(f"{path}: negative case must be a record")
        key = required_text(case, "fixture", path)
        if key in seen:
            fail(f"{path}: duplicate fixture {key}")
        seen.add(key)
        if case.get("executed") is not True or type(case.get("artifacts_emitted")) is not int or case["artifacts_emitted"] != 0:
            fail(f"{path}: negative test must execute and emit zero artifacts")
        if case.get("result") != "PASS":
            fail(f"{path}: negative compiler test did not pass")
        if not re.fullmatch(r"E_[A-Z0-9_]+", required_text(case, "diagnostic", path)):
            fail(f"{path}: negative test missing specific diagnostic")


def validate_manifest_evidence(manifest):
    if not isinstance(manifest, dict):
        fail("ledger must be a JSON object")
    if set(manifest.get("backends", [])) != set(AOT_MODE):
        fail("missing or unknown AOT backend")
    for feature in manifest.get("features", []):
        path = required_text(feature, "id", "features")
        states = feature.get("backends")
        if not isinstance(states, dict) or set(states) != set(AOT_MODE):
            fail(f"{path}: missing/unknown backend column")
        passes = {b for b, status in states.items() if status == "PASS"}
        receipts = feature.get("evidence", {})
        if not isinstance(receipts, dict) or set(receipts) != passes:
            fail(f"{path}: PASS needs exactly matching backend-specific receipts")
        for backend in passes:
            validate_receipt(backend, receipts[backend], f"{path}.evidence.{backend}")
    for section in ("syntax_patterns", "language_inspirations"):
        for item in manifest.get(section, []):
            path = f"{section}.{required_text(item, 'id', section)}"
            receipts = item.get("evidence", {})
            if not isinstance(receipts, dict):
                fail(f"{path}: receipts must be backend-keyed")
            if item.get("status") == "PASS":
                if not receipts:
                    fail(f"{path}: PASS without guest-executed receipts")
            elif receipts:
                fail(f"{path}: evidence only admissible for PASS")
            for backend, receipt in receipts.items():
                validate_receipt(backend, receipt, f"{path}.evidence.{backend}")


def synthetic_receipt():
    return {
        "aot_mode": "llvm-native", "source_repository": "atto-lang/atto-source.llvm",
        "source_sha": "a" * 40, "source_tree_sha": "b" * 40,
        "artifact_sha256": "c" * 64,
        "run_url": "https://github.com/example/atto-ci/actions/runs/123",
        "job_id": 111, "executed_steps": 6,
        "toolchain": "clang 21", "target_triple": "x86_64-unknown-linux-gnu",
        "host_only": False, "jit_required": False, "runtime_codegen": False,
        "source_tree_verified": True, "guest_execution": "PASS",
        "positive_guest_cases": [{"fixture": "ok.atto", "executed": True,
                                  "result": "PASS", "artifact_sha256": "c" * 64}],
        "negative_no_artifact_cases": [{"fixture": "wrong.atto", "executed": True,
                                        "result": "PASS", "diagnostic": "E_TYPE",
                                        "artifacts_emitted": 0}],
    }


class FullAOTReceiptGate(unittest.TestCase):
    def test_actual_draft_ledger_does_not_claim_unverified_pass(self):
        validate_manifest_evidence(json.loads(MANIFEST.read_text(encoding="utf-8")))

    def test_complete_synthetic_receipt_is_structurally_valid_only(self):
        validate_receipt("llvm-native", synthetic_receipt(), "synthetic")

    def test_reject_forged_or_incomplete_pass_receipts(self):
        base = synthetic_receipt()
        mutants = [
            "string", [], {},
            *[dict(base, **{key: value}) for key, value in [
                ("aot_mode", "graal-native-image"), ("source_sha", "short"),
                ("source_tree_sha", "short"), ("artifact_sha256", "not-a-digest"),
                ("run_url", "https://example.com/checks/passed"), ("job_id", 0),
                ("executed_steps", 0), ("host_only", True), ("jit_required", True),
                ("runtime_codegen", True), ("source_tree_verified", False),
                ("guest_execution", "NOT_EXECUTED"), ("positive_guest_cases", []),
                ("negative_no_artifact_cases", []),
            ]],
        ]
        for mutant in mutants:
            with self.subTest(mutant=str(mutant)[:80]), self.assertRaises(ValueError):
                validate_receipt("llvm-native", mutant, "mutant")

    def test_negative_must_prove_no_emission_and_diagnostic(self):
        for changes in ({"artifacts_emitted": 1}, {"artifacts_emitted": False},
                        {"diagnostic": "not sure"}, {"executed": False},
                        {"result": "NOT_EXECUTED"}):
            receipt = synthetic_receipt()
            receipt["negative_no_artifact_cases"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_receipt("llvm-native", receipt, "mutant")

    def test_positive_must_prove_compiled_guest_result(self):
        for changes in ({"executed": False}, {"result": "HOST_ONLY"},
                        {"artifact_sha256": "not-real"}):
            receipt = synthetic_receipt()
            receipt["positive_guest_cases"][0].update(changes)
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                validate_receipt("llvm-native", receipt, "mutant")

    def test_backend_receipt_must_match_passed_backend(self):
        ledger = {"backends": list(AOT_MODE), "features": [
            {"id": "F01", "backends": {name: "NOT_EXECUTED" for name in AOT_MODE}}],
            "syntax_patterns": [], "language_inspirations": []}
        validate_manifest_evidence(ledger)
        ledger["features"][0]["backends"]["llvm-native"] = "PASS"
        with self.assertRaises(ValueError):
            validate_manifest_evidence(ledger)
        ledger["features"][0]["evidence"] = {"llvm-native": synthetic_receipt()}
        validate_manifest_evidence(ledger)
        ledger["features"][0]["evidence"]["java-native-image"] = synthetic_receipt()
        with self.assertRaises(ValueError):
            validate_manifest_evidence(ledger)

    def test_syntax_and_language_pass_cannot_be_only_a_url(self):
        for section in ("syntax_patterns", "language_inspirations"):
            ledger = {"backends": list(AOT_MODE), "features": [],
                      "syntax_patterns": [], "language_inspirations": []}
            ledger[section] = [{"id": "X01", "status": "PASS", "evidence": "https://x"}]
            with self.subTest(section=section), self.assertRaises(ValueError):
                validate_manifest_evidence(ledger)
            ledger[section][0]["evidence"] = {"llvm-native": synthetic_receipt()}
            validate_manifest_evidence(ledger)


if __name__ == "__main__":
    unittest.main()
