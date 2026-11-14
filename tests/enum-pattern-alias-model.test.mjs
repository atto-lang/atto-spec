import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Source-free semantic reference model for the TARGET contract.
// This is NOT AttoLang parsing, compiler execution, AOT or runtime evidence.
const cases = new Map([
  ["WorkerMsg", new Map([
    ["Run", ["job_id", "payload"]],
    ["Cancel", ["job_id"]],
    ["Stop", []],
  ])],
  ["ServerMsg", new Map([["Stop", []]])],
]);

const fixture = (filename) => readFileSync(
  new URL("./fixtures/enum-pattern-alias-v1/" + filename, import.meta.url), "utf8");

function bind_arm(head, scrutinee_enum = "WorkerMsg") {
  const m = /^on\s+(?:(\w+)\.)?([A-Za-z_]\w*)(?:\s*\{([^{}]*)\})?(?:\s+as\s+([A-Za-z_]\w*))?\s*->$/.exec(head.trim());
  if (!m) throw new Error("invalid enum arm pattern");
  const [, qualified, variant, raw_fields, alias] = m;
  if (!cases.has(scrutinee_enum)) throw new Error("unknown scrutinee enum");
  if (qualified && qualified !== scrutinee_enum) throw new Error("cross-enum variant");
  const variants = cases.get(scrutinee_enum);
  if (!variants.has(variant)) throw new Error("unknown enum variant");
  const field_specs = variants.get(variant);
  const fields = raw_fields === undefined ? [] : raw_fields.split(",").map(x => x.trim()).filter(Boolean);
  const bound = new Set();
  for (const field of fields) {
    if (!/^[A-Za-z_]\w*$/.test(field)) throw new Error("field-level rename or invalid pattern");
    if (!field_specs.includes(field)) throw new Error("missing variant field");
    if (bound.has(field)) throw new Error("duplicate payload binding");
    bound.add(field);
  }
  if (alias && bound.has(alias)) throw new Error("alias collides with field binding");
  if (raw_fields !== undefined && field_specs.length === 0 && fields.length > 0) {
    throw new Error("unit variant cannot have payload fields");
  }
  return Object.freeze({
    type: scrutinee_enum + "." + variant,
    alias: alias ?? null,
    mode: "shared-borrow",
    fields,
    variant,
  });
}

function arm_heads(source) {
  return source.split("\n")
    .map(x => x.trim())
    .filter(x => x.startsWith("on "))
    .map(x => x.split("->")[0].trim() + " ->");
}

function validate_closed_match(arm_headers, enum_name = "WorkerMsg") {
  const seen = new Set();
  for (const head of arm_headers) {
    const arm = bind_arm(head, enum_name);
    if (seen.has(arm.variant)) throw new Error("duplicate or unreachable variant");
    seen.add(arm.variant);
  }
  const missing = [...cases.get(enum_name).keys()].filter(v => !seen.has(v));
  if (missing.length) throw new Error("non-exhaustive variants: " + missing.join(", "));
}

class WholeVariantLoan {
  #active = true;
  #borrow_count = 1;
  constructor(variant_type) { this.variant_type = variant_type; }
  project(field) {
    if (!this.#active) throw new Error("use-after-arm");
    if (!field) throw new Error("invalid projection");
    return { field, variant_type: this.variant_type, mode: "shared-borrow" };
  }
  copy_scalar(value) {
    if (!this.#active) throw new Error("use-after-arm");
    return value;
  }
  take_field() {
    if (!this.#active) throw new Error("use-after-arm");
    if (this.#borrow_count > 0) throw new Error("move conflicts with a live alias");
  }
  send_borrow() { throw new Error("borrowed alias cannot cross actor mailbox"); }
  suspend() {
    if (this.#active && this.#borrow_count > 0)
      throw new Error("loan cannot cross suspension without a separate proof");
  }
  end_arm() { this.#borrow_count = 0; this.#active = false; }
}

test("canonical variants narrow the borrowed alias without copying", () => {
  const result = bind_arm("on Run { job_id, payload } as r ->");
  assert.deepEqual(result, {
    type: "WorkerMsg.Run",
    alias: "r",
    mode: "shared-borrow",
    fields: ["job_id", "payload"],
    variant: "Run",
  });
  assert.equal(bind_arm("on Run as r ->").type, "WorkerMsg.Run");
  assert.equal(bind_arm("on WorkerMsg.Stop ->").type, "WorkerMsg.Stop");
  assert.equal(bind_arm("on Stop as s ->").type, "WorkerMsg.Stop");
});

test("nominal matching, field validation and alias collisions fail closed", () => {
  for (const [head, expected] of [
    ["on Delete ->", /unknown enum variant/],
    ["on ServerMsg.Stop ->", /cross-enum variant/],
    ["on Run { imaginary_field } as r ->", /missing variant field/],
    ["on Run { job_id, job_id } ->", /duplicate payload binding/],
    ["on Run { job_id } as job_id ->", /alias collides/],
    ["on Run { job_id as j } ->", /invalid enum arm pattern/],
    ["on .Run ->", /invalid enum arm pattern/],
    ["on Stop { job_id } ->", /missing variant field/],
  ]) assert.throws(() => bind_arm(head), expected, head);
});

test("known closed variants must be covered; repeated arm is unreachable", () => {
  validate_closed_match([
    "on Run as r ->",
    "on Cancel { job_id } as c ->",
    "on Stop ->",
  ]);
  assert.throws(() => validate_closed_match(["on Run ->", "on Stop ->"]), /non-exhaustive/);
  assert.throws(() => validate_closed_match(["on Run ->", "on Run as r ->", "on Cancel ->", "on Stop ->"]), /duplicate or unreachable/);
});

test("matching fixtures preserve intended source patterns", () => {
  validate_closed_match(arm_heads(fixture("accept-worker-receive.atto")));
  validate_closed_match(arm_heads(fixture("accept-short-and-qualified.atto")).filter(x => x !== "on WorkerMsg.Stop ->").concat(["on Stop ->"]));
  for (const [file, expected] of [
    ["reject-alias-collision.atto", /alias collides/],
    ["reject-unknown-variant.atto", /unknown enum variant/],
    ["reject-field-alias-v1.atto", /invalid enum arm pattern/],
    ["reject-duplicate-payload-binding.atto", /duplicate payload binding/],
    ["reject-missing-variant-field.atto", /missing variant field/],
    ["reject-cross-enum-variant.atto", /cross-enum variant/],
  ]) {
    const heads = arm_heads(fixture(file));
    assert.throws(() => heads.forEach(h => bind_arm(h)), expected, file);
  }
});

test("loan model rejects escapes, moves, suspensions and use-after-arm", () => {
  const loan = new WholeVariantLoan("WorkerMsg.Run");
  assert.equal(loan.project("job_id").mode, "shared-borrow");
  assert.equal(loan.copy_scalar(42), 42);
  assert.throws(() => loan.take_field("payload"), /move conflicts/);
  assert.throws(() => loan.send_borrow(), /mailbox/);
  assert.throws(() => loan.suspend(), /suspension/);
  loan.end_arm();
  assert.throws(() => loan.project("payload"), /use-after-arm/);
});
