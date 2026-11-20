import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

const corpus = JSON.parse(readFileSync(new URL("./guard-v1.json", import.meta.url), "utf8"));

// This is a source-free contract oracle only. It is NOT execution of .atto.
function referenceGuard(checks, failure) {
  for (const check of checks) {
    if (!check()) return failure();
  }
  return "continue";
}

test("versioned guard corpus has unique, explicit case states", () => {
  assert.equal(corpus.schema, "attolang.guard.v1");
  assert.ok(corpus.cases.length >= 12);
  const ids = new Set();
  for (const item of corpus.cases) {
    assert.ok(item.id && item.source.includes("guard "), item.id);
    assert.ok(!ids.has(item.id), item.id);
    ids.add(item.id);
    assert.ok(["execute", "reject", "target-option"].includes(item.kind), item.id);
    if (item.kind === "execute") {
      assert.ok(Number.isInteger(item.expected_exit), item.id);
    } else if (item.kind === "reject") {
      assert.ok(item.reject?.length, item.id);
    } else {
      assert.equal(item.backend_status, "NOT_IMPLEMENTED", item.id);
      assert.ok(item.expected_type, item.id);
    }
  }
});

test("all guard tests run once, left-to-right, on success", () => {
  const trace = [];
  const outcome = referenceGuard([
    () => { trace.push("a"); return true; },
    () => { trace.push("b"); return true; },
    () => { trace.push("c"); return true; },
  ], () => { trace.push("fail"); return "exited"; });
  assert.equal(outcome, "continue");
  assert.deepEqual(trace, ["a", "b", "c"]);
});

test("first failed test short-circuits later tests and runs one failure block", () => {
  const trace = [];
  const outcome = referenceGuard([
    () => { trace.push("a"); return true; },
    () => { trace.push("b"); return false; },
    () => { trace.push("c"); throw Error("must not evaluate"); },
  ], () => { trace.push("fail"); return "exited"; });
  assert.equal(outcome, "exited");
  assert.deepEqual(trace, ["a", "b", "fail"]);
});

test("failure of first test cannot touch an unproven optional payload", () => {
  const trace = [];
  const outcome = referenceGuard([
    () => { trace.push("present"); return false; },
    () => { throw Error("unsafe projection"); },
  ], () => "exited");
  assert.equal(outcome, "exited");
  assert.deepEqual(trace, ["present"]);
});
