import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(root, p), "utf8");
const registry = JSON.parse(read("contracts/keyword-taxonomy-v1/catalog.json"));
const lexical = read("spec/16-lexical-and-grammar-reference.md");
const taxonomy = read("spec/23-keyword-taxonomy-and-highlighting.md");
const index = read("README.md");
const tick = String.fromCharCode(96);
const wordsIn = text => Array.from(text.matchAll(new RegExp(tick + "([^" + tick + "]+)" + tick, "g")), m => m[1]);
const sorted = items => [...items].sort();
const distinct = items => new Set(items).size === items.length;

function documentedReserved() {
  const section = lexical.split("## Keywords\n")[1].split("Some of these are narrower")[0];
  const rows = section.split("\n").filter(line => /^\|[^|]+\|[^|]+\|$/.test(line)).slice(2);
  assert.equal(rows.length, 11, "chapter 16 inventory groups changed: review the parser");
  return rows.flatMap(wordsIn);
}

function documentedNotReserved() {
  const line = lexical.split("\n").find(s => s.includes("These words are not reserved by the Java lexer:"));
  assert.ok(line, "chapter 16 non-reserved list must remain explicit");
  return wordsIn(line);
}

test("contract states scope and rejects implementation/parity claims", () => {
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.status, "DRAFT_TOOLING_METADATA_NOT_COMPILER_VERIFIED");
  assert.equal(registry.basis.backend_parity, "NOT_TESTED");
  assert.equal(registry.basis.guest_executions, 0);
  assert.equal(registry.basis.source, "spec/16-lexical-and-grammar-reference.md");
  assert.ok(taxonomy.includes("does **not** reserve new words"));
  assert.ok(index.includes("(spec/23-keyword-taxonomy-and-highlighting.md)"));
  assert.ok(taxonomy.includes("(../contracts/keyword-taxonomy-v1/catalog.json)"));
});

test("every documented reserved word is classified once, with no invented reservations", () => {
  const groups = registry.reserved_groups;
  const ids = groups.map(g => g.id);
  assert.ok(distinct(ids));
  const words = groups.flatMap(g => g.words);
  assert.ok(distinct(words));
  assert.equal(words.length, 95, "update audited inventory count if chapter 16 intentionally changes");
  assert.deepEqual(sorted(words), sorted(documentedReserved()));
  for (const g of groups) {
    assert.equal(g.lexical_status, "documented_java_reserved");
    assert.ok(g.linguistic_role && g.semantic_role);
    assert.match(g.highlight_scope, /^(keyword|storage|variable|constant)\.[a-z.]+\.atto$/);
    assert.equal(g.lsp_fallback, "keyword");
    assert.ok(g.words.length > 0);
    for (const word of g.words) assert.match(word, /^[a-z][a-z0-9]*$/);
  }
});

test("documented non-reserved words are recorded independently of reserved words", () => {
  const documented = registry.documented_not_reserved;
  const reserved = new Set(registry.reserved_groups.flatMap(g => g.words));
  const words = documented.map(e => e.spelling);
  assert.ok(distinct(words));
  assert.deepEqual(sorted(words), sorted(documentedNotReserved()));
  for (const entry of documented) {
    assert.equal(entry.lexical_status, "documented_java_not_reserved");
    assert.equal(entry.admission, "contextual_or_target_requires_parser_evidence");
    assert.ok(!reserved.has(entry.spelling));
    assert.ok(entry.suggested_category);
  }
});

test("only enumerated hyphenated compounds are special, with correct handling distinctions", () => {
  const compounds = registry.compound_spellings;
  assert.deepEqual(sorted(compounds.map(x => x.spelling)), sorted([
    "nb-select", "critical-read", "critical-write", "transform-pipe"
  ]));
  assert.ok(distinct(compounds.map(x => x.spelling)));
  const lexerCompound = compounds.filter(x => x.lexical_status === "documented_lexer_compound");
  assert.deepEqual(lexerCompound.map(x => x.spelling), ["nb-select"]);
  for (const entry of compounds) {
    assert.match(entry.spelling, /^[a-z]+-[a-z]+$/);
    assert.ok(lexical.includes(tick + entry.spelling + tick));
    if (entry.spelling !== "nb-select") {
      assert.equal(entry.lexical_status, "documented_parser_contextual_compound");
      assert.equal(entry.admission, "parser_context_only_per_chapter_16");
    }
  }
});

test("candidate spellings do not get promoted to reserved lexer tokens", () => {
  const reserved = new Set(documentedReserved());
  const candidates = registry.candidate_spellings;
  assert.ok(distinct(candidates.map(x => x.spelling)));
  for (const entry of candidates) {
    assert.ok(!reserved.has(entry.spelling), entry.spelling);
    assert.equal(entry.lexical_status, "not_listed_in_documented_java_reserved_inventory");
    assert.equal(entry.admission, "unverified_contextual_or_target");
  }
  for (const spelling of ["declare", "singleton", "sealed", "borrow", "take", "copy", "share"]) {
    assert.ok(candidates.some(x => x.spelling === spelling));
  }
});

test("callable name escapes are explicit, not globally keyword-highlighted", () => {
  const special = registry.context_sensitive_reserved;
  assert.deepEqual(sorted(special.map(x => x.spelling)), ["do", "done", "stop"]);
  for (const entry of special) {
    assert.ok(documentedReserved().includes(entry.spelling));
    assert.match(entry.admission, /callable name/);
  }
});

test("operators, Symbols, API suffixes and invalid hyphens do not masquerade as keywords", () => {
  const examples = new Map(registry.non_keyword_examples.map(x => [x.spelling, x.kind]));
  assert.equal(examples.get("|>"), "operator");
  assert.equal(examples.get("#ready"), "symbol_literal");
  assert.equal(examples.get("read_blocking"), "identifier");
  assert.equal(examples.get("suspend"), "not_documented_reserved");
  assert.equal(examples.get("critical–read"), "invalid_unicode_dash_compound");
  assert.ok(taxonomy.includes("not a documented reserved Java keyword"));
});

test("all catalog categories have a stable semantic label and fallback scope", () => {
  const categories = new Set(registry.reserved_groups.map(g => g.id));
  for (const entry of [
    ...registry.documented_not_reserved,
    ...registry.candidate_spellings,
    ...registry.compound_spellings
  ]) {
    assert.ok(categories.has(entry.suggested_category ?? entry.category), entry.spelling);
  }
  assert.ok(!registry.reserved_groups.some(g => g.words.includes("nb-select")));
});
