import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import test from "node:test";

const manifest = JSON.parse(readFileSync(
    new URL("../conformance/match-arm-delimiters-v1.json", import.meta.url),
    "utf8",
));

test("arm-delimiter catalog is versioned and never reports guest execution", () => {
    assert.equal(manifest.contract, "atto.match-arm-delimiters.v1");
    assert.equal(manifest.status, "TARGET_NOT_EXECUTED");
    assert.equal(manifest.cases.length, 20);
    assert.equal(new Set(manifest.cases.map(c => c.id)).size, 20);
    for (const c of manifest.cases) {
        assert.match(c.id, /^MAB\d{3}$/);
        assert.ok(["accept", "reject"].includes(c.expect));
        assert.ok(["braces", "end", "mixed"].includes(c.arm_style));
        assert.ok(["target_structural", "compiler_scalar_candidate"].includes(c.verification_scope));
        assert.ok(c.source.startsWith("match ") || c.source.startsWith("do match "));
        assert.ok(c.note);
    }
});

test("both exact user structural examples are retained as target syntax", () => {
    const accept = manifest.cases.filter(c => c.expect === "accept");
    assert.ok(accept.some(c => c.source.includes("on is ~Point as val p -> {") && c.source.includes("on _ -> {")));
    assert.ok(accept.some(c => c.source.includes("on is ~Point as val p ->\n") &&
                               c.source.includes("process(p);\n    end\n")));
    assert.ok(accept.some(c => c.arm_style === "mixed"));
    assert.ok(accept.some(c => c.source.includes("p: ~p, count: 1")));
});

test("nested match and explicit arm-end failures are covered", () => {
    assert.ok(manifest.cases.some(c => c.expect === "accept" && c.source.includes("match nested over")));
    assert.ok(manifest.cases.some(c => c.expect === "accept" && c.source.includes("fi\n    end")));
    const rejected = manifest.cases.filter(c => c.expect === "reject");
    assert.equal(rejected.length, 7);
    for (const phrase of [
        "Missing first arm end", "Missing enclosing match end", "Unexpected extra end",
        "Single end cannot close arm and match", "Wrong closing delimiter",
    ]) {
        assert.ok(rejected.some(c => c.note === phrase), phrase);
    }
});
