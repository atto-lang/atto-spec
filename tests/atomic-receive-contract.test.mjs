import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Worker } from "node:worker_threads";

const root = new URL("../", import.meta.url);
const contract = JSON.parse(readFileSync(new URL("contracts/atomic-receive-v1.json", root), "utf8"));

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

/**
 * A specification-only admission model. This is NOT the AttoLang runtime.
 * In particular, a serial qualifier gates receives only, never all methods.
 */
function receiveGate(serial) {
  let tail = Promise.resolve();
  let active = 0;
  let peak = 0;
  const executeReceive = async fn => {
    active += 1;
    peak = Math.max(peak, active);
    try { return await fn(); }
    finally { active -= 1; }
  };
  return {
    receive(fn) {
      if (!serial) return executeReceive(fn);
      const next = tail.then(() => executeReceive(fn));
      tail = next.catch(() => {});
      return next;
    },
    method(fn) { return Promise.resolve().then(fn); },
    get peakReceives() { return peak; },
  };
}

test("contract declares bounded target API and does not attest guest parity", () => {
  assert.equal(contract.schema, "attolang-atomic-receive-v1");
  assert.equal(contract.status, "TARGET");
  assert.equal(contract.standard_library.type, "Atomic<T>");
  assert.equal(contract.standard_library.default_order, "seq_cst");
  assert.equal(contract.standard_library.checked_integer_rmw, true);
  assert.ok(contract.memory_orders.load.includes("acquire"));
  assert.ok(!contract.memory_orders.load.includes("release"));
  assert.ok(!contract.memory_orders.store.includes("acquire"));
  assert.ok(!contract.memory_orders.cas_failure.includes("acq_rel"));
  assert.equal(contract.scheduling.serial_actor_receive, "one_live_invocation_including_suspension");
  assert.equal(contract.scheduling.serial_actor_other_methods, "concurrent_not_gated_by_receive");
  for (const [backend, result] of Object.entries(contract.backends)) {
    assert.ok(["java", "llvm", "net", "wasm", "forge"].includes(backend));
    assert.equal(result.guest_status, "NOT_EXECUTED");
    assert.equal(result.compiler_sha, null);
  }
  const javaAtomic = contract.verified_slices?.java_atomic_i64_interpreter;
  assert.equal(javaAtomic?.status, "PASS");
  assert.equal(javaAtomic.junit_tests_passed, 31);
  assert.match(javaAtomic.source_main_java_tree_sha, /^[a-f0-9]{40}$/);
  assert.match(javaAtomic.fixture_blob_sha, /^[a-f0-9]{40}$/);
  assert.equal(javaAtomic.native_image_status, "NOT_EXECUTED");
  assert.equal(contract.verified_slices?.java_actor_regression?.tests_passed, 104);
  // A verified Java subset must not accidentally certify the combined
  // receive-only concurrency contract for any of the five backends.
  assert.equal(contract.backends.java.guest_status, "NOT_EXECUTED");

  const fixtureIds = new Set();
  for (const f of contract.fixtures) {
    assert.ok(!fixtureIds.has(f.id), "duplicate fixture id: " + f.id);
    fixtureIds.add(f.id);
    assert.ok(f.file.endsWith(".atto"));
    assert.ok(readFileSync(new URL(f.file, root), "utf8").length > 10);
    assert.equal(f.status, "NOT_EXECUTED");
    if (f.kind === "compile_reject") assert.ok(f.expected_diagnostic_category);
    if (f.kind === "compile_and_execute") assert.equal(typeof f.expected_exit, "number");
    if (f.kind === "runtime_harness_required") assert.ok(f.required_observations.length >= 2);
  }
});

test("serial actor model gates only receive, even when it is suspended", async () => {
  const gate = receiveGate(true);
  const hold = deferred();
  const events = [];
  const first = gate.receive(async () => {
    events.push("receive-A-start");
    await hold.promise;
    events.push("receive-A-end");
  });
  const second = gate.receive(async () => {
    events.push("receive-B-start");
  });
  await gate.method(() => events.push("independent-method"));
  assert.deepEqual(events, ["receive-A-start", "independent-method"]);
  assert.equal(gate.peakReceives, 1);
  hold.resolve();
  await Promise.all([first, second]);
  assert.deepEqual(events, ["receive-A-start", "independent-method", "receive-A-end", "receive-B-start"]);
  assert.equal(gate.peakReceives, 1);
});

test("concurrent actor model allows distinct overlapping receive invocations", async () => {
  const gate = receiveGate(false);
  const hold = deferred();
  const started = [];
  const a = gate.receive(async () => { started.push("A"); await hold.promise; });
  const b = gate.receive(async () => { started.push("B"); await hold.promise; });
  assert.deepEqual(started, ["A", "B"]);
  assert.equal(gate.peakReceives, 2);
  hold.resolve();
  await Promise.all([a, b]);
});

test("host worker-thread atomic increment has no lost updates (NOT guest parity)", async () => {
  const memory = new SharedArrayBuffer(BigInt64Array.BYTES_PER_ELEMENT);
  const cell = new BigInt64Array(memory);
  const threads = 4;
  const increments = 5000;
  const code = `
    const { parentPort, workerData } = require("node:worker_threads");
    const cell = new BigInt64Array(workerData.memory);
    for (let i = 0; i < workerData.increments; i++) Atomics.add(cell, 0, 1n);
    parentPort.postMessage("done");
  `;
  const workers = Array.from({ length: threads }, () =>
    new Worker(code, { eval: true, workerData: { memory, increments } }));
  try {
    await Promise.all(workers.map(worker => new Promise((resolve, reject) => {
      worker.once("message", resolve);
      worker.once("error", reject);
      worker.once("exit", code => { if (code !== 0) reject(new Error("worker exit " + code)); });
    })));
    assert.equal(Atomics.load(cell, 0), BigInt(threads * increments));
  } finally {
    await Promise.all(workers.map(worker => worker.terminate()));
  }
});
