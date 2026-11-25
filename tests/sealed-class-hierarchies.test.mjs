import { readFileSync } from "node:fs";
import { test } from "node:test";
import assert from "node:assert/strict";

const spec = JSON.parse(readFileSync(new URL("../conformance/sealed-class-hierarchies-v1.json", import.meta.url), "utf8"));
const entries = spec.cases;

test("host-only sealed contract metadata never asserts compiler execution", () => {
    assert.equal(spec.contract, "atto.sealed-classes.v1");
    assert.equal(spec.status, "PROPOSAL");
    assert.equal(spec.verification, "HOST_ONLY_SCHEMA_NOT_COMPILER_EXECUTION");
    assert.ok(entries.length >= 15);
    assert.ok(entries.every(c => c.execution === "NOT_EXECUTED"));
});

test("all cases have unique IDs, bounded compilable-shaped source, and explicit outcomes", () => {
    assert.equal(new Set(entries.map(c => c.id)).size, entries.length);
    for (const c of entries) {
        assert.match(c.id, /^[a-z][a-z0-9-]*$/);
        assert.ok(c.source.length < 65536);
        assert.match(c.source, /define /);
        assert.match(c.source, /pub fnc main\(\): int/);
        assert.ok(["ACCEPT", "REJECT"].includes(c.expected));
        if (c.expected === "ACCEPT") assert.equal(c.diagnostic, null);
        else assert.match(c.diagnostic, /^E_[A-Z_]+$/);
    }
});

test("coverage includes open, recursive sealed, final, non-sealed and adversarial cases", () => {
    const required = [
        "closed-final", "closed-recursive", "nonsealed-opens",
        "unlisted-child", "unbound-permitted", "not-direct-child",
        "unmarked-child", "missing-permits", "duplicate-permitted",
        "self-permitted", "final-extended", "orphan-nonsealed",
        "open-permits", "sealed-trait", "final-second-base",
        "abi-override", "spaced-nonsealed", "modified-class-export",
        "sealed-diamond-authorized", "sealed-diamond-second-parent-unlisted"
    ];
    const seen = new Set(entries.map(c => c.id));
    required.forEach(c => assert.ok(seen.has(c), "missing " + c));
    assert.ok(entries.some(c => c.diagnostic === "E_FINAL"));
    assert.ok(entries.some(c => c.diagnostic === "E_OVERRIDE_REQUIRED"));
});
