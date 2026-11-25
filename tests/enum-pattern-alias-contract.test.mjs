import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const base = new URL("./fixtures/enum-pattern-alias-v1/", import.meta.url);
const fixture = (name) => readFileSync(new URL(name, base), "utf8");

// Source-shape regression tests ONLY. Not an AttoLang compiler, ownership,
// AOT, or guest execution test. A negative fixture passing this test is NOT
// evidence that a compiler rejects the source.
test("canonical do match accepts on variants and whole-value aliases", () => {
  const src = fixture("accept-worker-receive.atto");
  assert.match(src, /define enum WorkerMsg\s*\{/);
  assert.match(src, /do match msg over/);
  assert.match(src, /on Run \{ job_id, payload \} as r ->/);
  assert.match(src, /on Cancel \{ job_id \} as c ->/);
  assert.match(src, /on Stop ->/);
  assert.doesNotMatch(src, /on \.(Run|Cancel|Stop)/);
});

test("shorthand alias and explicit nominal qualification remain distinct", () => {
  const src = fixture("accept-short-and-qualified.atto");
  assert.match(src, /on Run as r ->/);
  assert.match(src, /on WorkerMsg\.Stop ->/);
  assert.match(src, /define enum ServerMsg/);
});

test("negative fixtures preserve specific semantic rejection scenarios", () => {
  assert.match(fixture("reject-alias-collision.atto"), /on Run \{ job_id \} as job_id ->/);
  assert.match(fixture("reject-unknown-variant.atto"), /on Delete ->/);
  assert.match(fixture("reject-field-alias-v1.atto"), /on Run \{ job_id as j \} ->/);
  assert.match(fixture("reject-alias-escape.atto"), /observer\.send\(r\)/);
});
