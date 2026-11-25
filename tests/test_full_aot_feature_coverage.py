#!/usr/bin/env python3
"""Source-only schema guard, not native guest execution."""
import json
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
DOC = ROOT / "language/full-aot-feature-coverage-v1.md"
MANIFEST = ROOT / "conformance/full-aot-feature-coverage-v1.json"
BACKENDS = {"java-native-image","llvm-native","dotnet-nativeaot","rust-wasm-precompiled"}
STATES = {"PASS","FAIL","UNSUPPORTED","NOT_EXECUTED"}

class AOTCoverageSchemaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.m = json.loads(MANIFEST.read_text(encoding="utf-8"))
    def test_25_plus_25(self):
        self.assertEqual(len(self.m["features"]), 25)
        self.assertEqual(len(self.m["syntax_patterns"]), 25)
        self.assertEqual({x["id"] for x in self.m["features"]}, {f"F{i:02d}" for i in range(1,26)})
        self.assertEqual({x["id"] for x in self.m["syntax_patterns"]}, {f"S{i:02d}" for i in range(1,26)})
    def test_50_language_inspirations(self):
        self.assertEqual(len(self.m["language_inspirations"]), 50)
        self.assertEqual({x["id"] for x in self.m["language_inspirations"]}, {f"L{i:02d}" for i in range(1,51)})
        self.assertEqual(len({x["language"] for x in self.m["language_inspirations"]}), 50)
        for x in self.m["language_inspirations"]:
            self.assertTrue(x["aot_adaptation"].strip())
            self.assertIn(x["status"], STATES)
            if x["status"] == "PASS":
                self.assertTrue(x.get("evidence"), f"{x['id']}: PASS without evidence")
    def test_explicit_aot_targets_and_fail_closed_status(self):
        self.assertEqual(set(self.m["backends"]), BACKENDS)
        self.assertEqual(set(self.m["statuses"]), STATES)
        for f in self.m["features"]:
            self.assertTrue(f["aot_strategy"].strip())
            self.assertIn(f["priority"], {"P0","P1","P2"})
            self.assertEqual(set(f["backends"]), BACKENDS)
            self.assertTrue(set(f["backends"].values()) <= STATES)
            # Any claimed PASS must have an inspectable exact-head receipt.
            if "PASS" in f["backends"].values():
                self.assertTrue(f.get("evidence"), f"{f['id']}: PASS without evidence")
    def test_all_statuses_grounded(self):
        for s in self.m["syntax_patterns"]:
            self.assertIn(s["status"], STATES)
            if s["status"] == "PASS":
                self.assertTrue(s.get("evidence"), f"{s['id']}: PASS without evidence")
    def test_mandatory_aot_prohibitions_and_doc(self):
        prohibitions = " ".join(self.m["non_negotiable"]).lower()
        for phrase in ["runtime", "jit", "eval", "generic", "macro", "artifact"]:
            self.assertIn(phrase, prohibitions)
        content = DOC.read_text(encoding="utf-8")
        for token in ["NativeAOT","Native Image","LLVM","NOT_EXECUTED","No source repo should claim"]:
            self.assertIn(token, content)
        for f in self.m["features"]:
            self.assertIn(f["id"], content)
        for s in self.m["syntax_patterns"]:
            self.assertIn(s["id"], content)
        for x in self.m["language_inspirations"]:
            self.assertIn(x["id"], content)

if __name__ == "__main__":
    unittest.main()
