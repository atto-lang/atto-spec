import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";
import { scanLexicalReference } from "./helpers/keyword-taxonomy-lexical-reference.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJSON = file => JSON.parse(readFileSync(path.join(root, file), "utf8"));
const registry = readJSON("contracts/keyword-taxonomy-v1/catalog.json");
const suite = readJSON("tests/fixtures/keyword-taxonomy-lexical-v1.json");
const reserved = registry.reserved_groups.flatMap(group => group.words);
const reservedSet = new Set(reserved);
const scan = source => scanLexicalReference(source, reserved);

test("fixture suite is unique, source-only and has meaningful coverage", () => {
  assert.equal(suite.schema_version, 1);
  assert.equal(suite.status, "SOURCE_ONLY_REFERENCE_MODEL_FIXTURES_NOT_COMPILER_VERIFIED");
  assert.equal(registry.basis.guest_executions, 0);
  assert.ok(suite.cases.length >= 20);
  assert.equal(new Set(suite.cases.map(x => x.id)).size, suite.cases.length);
  assert.ok(suite.cases.every(x => x.scope === "lexical_reference_only_not_parser_semantic_evidence"));
  assert.ok(suite.cases.every(x => typeof x.source === "string" && x.source.length > 0 && x.expected.length > 0));
  assert.ok(suite.cases.some(x => x.source.includes("declare actor")));
  assert.ok(suite.cases.some(x => x.source.includes("nb-select")));
  assert.ok(suite.cases.some(x => x.source.includes("/* actor /* implements */ pub */")));
});

for (const fixture of suite.cases) {
  test("test-only lexical fixture: " + fixture.id, () => {
    const tokens = scan(fixture.source);
    assert.deepEqual(tokens.map(t => [t.text, t.kind]), fixture.expected);
    assert.ok(tokens.every(t => fixture.source.slice(t.start, t.end) === t.text));
    for (let i = 1; i < tokens.length; i++) {
      assert.ok(tokens[i - 1].end <= tokens[i].start, "no overlapping spans");
    }
    assert.ok(tokens.every(t => t.kind !== "unknown"), "unanticipated tokens must be explicit");
  });
}

test("all 93 historically documented reserved words retain lexical status", () => {
  assert.equal(reserved.length, 93);
  assert.equal(new Set(reserved).size, reserved.length);
  for (const word of reserved) {
    assert.deepEqual(scan(word).map(t => [t.text, t.kind]), [[word, "reserved"]], word);
    // Case sensitivity and identifier boundaries prevent accidental regex keyword matches.
    assert.equal(scan(word.toUpperCase())[0].kind, "identifier", word);
    assert.equal(scan(word + "_x")[0].kind, "identifier", word);
    assert.equal(scan("x_" + word)[0].kind, "identifier", word);
  }
});

test("non-reserved documented and TARGET words remain lexical identifiers", () => {
  const nonReserved = [
    ...registry.documented_not_reserved.map(x => x.spelling),
    ...registry.candidate_spellings.map(x => x.spelling)
  ];
  assert.equal(new Set(nonReserved).size, nonReserved.length);
  for (const word of nonReserved) {
    assert.ok(!reservedSet.has(word), word);
    assert.deepEqual(scan(word).map(t => [t.text, t.kind]), [[word, "identifier"]], word);
  }
});

test("compound matching fails closed on lookalikes", () => {
  assert.deepEqual(scan("nb-select").map(t => [t.text, t.kind]), [["nb-select", "compound"]]);
  for (const snippet of ["anb-select", "nb-select2", "nb-selector", "nb-select_more", "nb-select-other"]) {
    assert.ok(scan(snippet).every(t => t.kind !== "compound"), snippet);
  }
  for (const snippet of ["critical-read", "critical-write", "transform-pipe"]) {
    const tokens = scan(snippet);
    assert.equal(tokens.length, 3);
    assert.equal(tokens[1].kind, "operator");
    assert.equal(tokens[1].text, "-");
    assert.ok(tokens.every(x => x.kind !== "compound"), snippet);
  }
});

test("strings, comments, templates and Symbols mask keyword-looking text", () => {
  const samples = [
    ['"actor implements"', "string"], ["'pub'", "string"],
    ["// actor", "comment"], ["/* actor /* implements */ pub */", "comment"],
    ["#actor", "symbol"], ['#"actor implements"', "symbol"],
    ["\x60actor implements\x60", "template"]
  ];
  for (const [source, kind] of samples) {
    assert.deepEqual(scan(source).map(x => [x.text, x.kind]), [[source, kind]], source);
  }
});

test("unterminated strings/comments/Symbols fail closed in the test-only model", () => {
  for (const source of ['"actor', "'pub", "/* actor /* implements */", '#"actor', "\x60actor"]) {
    assert.throws(() => scan(source), SyntaxError, source);
  }
});

test("context-sensitive callable names cannot be verified by the lexical oracle alone", () => {
  assert.deepEqual(registry.context_sensitive_reserved.map(x => x.spelling).sort(), ["do", "done", "stop"]);
  const tokens = scan("worker.stop(); do(); done();");
  assert.equal(tokens.filter(x => ["stop", "do", "done"].includes(x.text)).length, 3);
  assert.ok(tokens.filter(x => ["stop", "do", "done"].includes(x.text)).every(x => x.kind === "reserved"));
  // Parser/LSP tests must ultimately reclassify legal callable positions. Do not claim this scanner does so.
  assert.equal(registry.status, "DRAFT_TOOLING_METADATA_NOT_COMPILER_VERIFIED");
});

test("explicit numeric/control operators never get copied into the reserved keyword inventory", () => {
  assert.ok(!reservedSet.has("|>"));
  assert.ok(!reservedSet.has("nb-select"));
  assert.ok(!reservedSet.has("critical-read"));
  assert.equal(scan("left |> right")[1].kind, "operator");
  assert.deepEqual(scan("a-b").map(x => x.kind), ["identifier", "operator", "identifier"]);
  assert.deepEqual(scan("a–b").map(x => x.kind), ["identifier", "invalid_dash", "identifier"]);
  assert.deepEqual(scan("a—b").map(x => x.kind), ["identifier", "invalid_dash", "identifier"]);
});
