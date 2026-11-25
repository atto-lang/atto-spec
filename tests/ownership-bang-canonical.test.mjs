import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = p => readFileSync(path.join(root, p), "utf8");
const chapter04 = read("spec/04-ownership-and-memory.md");
const chapter16 = read("spec/16-lexical-and-grammar-reference.md");
const chapter23 = read("spec/23-keyword-taxonomy-and-highlighting.md");
const vocabulary = read("language/ownership-vocabulary-v1.md");
const sharing = read("language/shared-ownership-and-guards-v1.md");
const tick = String.fromCharCode(96);

test("bang forms are canonical and rt ownership forms are compatibility-only", () => {
  for (const [canonical, legacy] of [
    ["take! value", "rt take value"],
    ["copy! value", "rt copy value"],
    ["borrow! value", "rt borrow value"],
    ["borrow! mut value", "rt borrow mut value"],
    ["share! value", "rt share value"],
  ]) {
    assert.ok(chapter04.includes(tick + canonical + tick), canonical);
    assert.ok(chapter04.includes(tick + legacy + tick), legacy);
    assert.ok(vocabulary.includes(canonical.split(" ")[0]), canonical);
  }
  assert.match(chapter04, /formatter[s]? (?:and|MUST).*emit the bang forms/i);
  assert.match(vocabulary, /compatibility aliases/i);
  assert.match(sharing, /canonical spelling of legacy/);
});

test("legacy and canonical forms promise identical ownership checks and lowering", () => {
  for (const text of [chapter04, vocabulary]) {
    assert.match(text, /(?:identical|same)[^.\n]*(?:ownership|typing|proof|typed events|lowering)/i);
  }
  assert.match(chapter04, /MUST NOT give the legacy spelling weaker checks/i);
});

test("bang forms remain contextual operators, not invented reserved words", () => {
  assert.match(chapter16, /contextual \*\*operator forms\*\*/i);
  assert.match(chapter23, /do \*\*not\*\* add their bare identifier words/i);
  assert.match(chapter23, /legacy/);
  assert.match(chapter16, /deep-copy operator/);
});

test("no unsupported ref bang aliases are invented", () => {
  assert.ok(chapter04.includes("does not invent " + tick + "ref!" + tick));
  assert.ok(chapter16.includes("Do not add " + tick + "ref!" + tick));
});
