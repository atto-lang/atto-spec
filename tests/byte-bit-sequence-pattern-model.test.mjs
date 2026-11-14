import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const corpus = JSON.parse(readFileSync(new URL("../contracts/aot-patterns-and-overloads-v1/cases.json", import.meta.url), "utf8"));

// SOURCE-FREE reference semantics only. This does not parse/compile AttoLang or
// demonstrate actual guest AOT execution. Views are modeled as immutable
// bounded (owner, bit-offset, length) descriptors, not copied byte arrays.
function inputBytes(data) {
  if (!(data instanceof Uint8Array)) throw new TypeError("byte source");
  return { owner: { data, live: true }, bitStart: 0, bitLength: data.length * 8, kind: "ByteView" };
}

function assertLive(view) {
  if (!view.owner.live) throw new Error("expired borrowed view");
  if (!Number.isSafeInteger(view.bitStart) || !Number.isSafeInteger(view.bitLength)
      || view.bitStart < 0 || view.bitLength < 0
      || view.bitStart + view.bitLength > view.owner.data.length * 8)
    throw new Error("invalid bounded view");
}
function bitAt(view, i) {
  assertLive(view);
  if (!Number.isSafeInteger(i) || i < 0 || i >= view.bitLength) throw new RangeError("bit bounds");
  const p = view.bitStart + i;
  return (view.owner.data[p >> 3] >> (7 - (p & 7))) & 1;
}
function byteAt(view, i) {
  assertLive(view);
  if (view.bitStart % 8 || view.bitLength % 8) throw new Error("unaligned byte view");
  if (!Number.isSafeInteger(i) || i < 0 || i >= view.bitLength / 8) throw new RangeError("byte bounds");
  return view.owner.data[view.bitStart / 8 + i];
}
function viewSuffix(view, consumedBits, kind) {
  assertLive(view);
  if (consumedBits < 0 || consumedBits > view.bitLength) throw new RangeError("slice range");
  const start = view.bitStart + consumedBits, count = view.bitLength - consumedBits;
  if (kind === "ByteView" && (start % 8 || count % 8)) throw new Error("unaligned byte tail");
  return { owner: view.owner, bitStart: start, bitLength: count, kind };
}
function verifyPrefix(elements, tail) {
  if (!Array.isArray(elements) || !["bytes", "bits"].includes(tail.kind)) throw new Error("invalid pattern");
  if (tail.name !== null && elements.length === 0) throw new Error("empty prefix before tail");
  if (tail.name !== null && tail.name !== "_" && !/^[a-z_][a-z0-9_]*$/.test(tail.name))
    throw new Error("invalid tail binder");
  const bound = new Set();
  for (const e of elements) {
    if ((e.literal === undefined) === (e.bind === undefined)) throw new Error("element must have one kind");
    if (e.literal !== undefined) {
      if (!Number.isInteger(e.literal) || e.literal < 0
          || e.literal > (tail.kind === "bytes" ? 255 : 1)) throw new Error("literal outside pattern domain");
    } else if (e.bind !== "_" && (!/^[a-z_][a-z0-9_]*$/.test(e.bind) || bound.has(e.bind))) {
      throw new Error("invalid or duplicate binding");
    } else if (e.bind !== "_") bound.add(e.bind);
  }
  if (tail.name !== null && tail.name !== "_" && bound.has(tail.name)) throw new Error("duplicate tail binder");
}
function matchSequence(view, kind, elements, tailName = null) {
  verifyPrefix(elements, { kind, name: tailName });
  assertLive(view);
  if (kind === "bytes" && (view.bitStart % 8 || view.bitLength % 8))
    throw new Error("bytes cannot match unaligned view");
  const itemWidth = kind === "bytes" ? 8 : 1;
  const inputLength = view.bitLength / itemWidth;
  if (inputLength < elements.length || (tailName === null && inputLength !== elements.length)) return null;
  const fields = Object.create(null);
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const v = kind === "bytes" ? byteAt(view, i) : bitAt(view, i);
    if (element.literal !== undefined && element.literal !== v) return null;
    if (element.bind !== undefined && element.bind !== "_")
      fields[element.bind] = kind === "bits" ? Boolean(v) : v;
  }
  if (tailName !== null && tailName !== "_")
    fields[tailName] = viewSuffix(view, itemWidth * elements.length, kind === "bytes" ? "ByteView" : "BitView");
  return fields;
}
const lit = literal => ({ literal });
const bind = name => ({ bind: name });

test("corpus spells both sequence forms, negative syntax, and no unsupported angle delimiters", () => {
  const positive = corpus.cases.filter(c => c.kind === "accept").map(c => c.source).join("\n");
  const negative = corpus.cases.filter(c => c.kind === "reject").map(c => c.source).join("\n");
  assert.match(positive, /on bytes\[/);
  assert.match(positive, /on bits\[/);
  assert.match(positive, /payload: bytes\[length\]/);
  assert.match(positive, /flags: bits\[3\]/);
  for (const term of ["bytes[256", "bits[2", "bytes[|", "bits[1 | rest |"]) assert.ok(negative.includes(term));
  assert.ok(corpus.cases.every(c => !c.source.includes("<<") && !c.source.includes(">>")));
  assert.equal(corpus.status, "TARGET_NOT_EXECUTED");
});

test("bytes pattern exact, singleton literal, zero length, prefix, nested tail and wildcard", () => {
  assert.ok(matchSequence(inputBytes(new Uint8Array()), "bytes", []));
  assert.equal(matchSequence(inputBytes(Uint8Array.from([1])), "bytes", []), null);
  assert.ok(matchSequence(inputBytes(Uint8Array.from([3])), "bytes", [lit(3)]));
  assert.equal(matchSequence(inputBytes(Uint8Array.from([3, 4])), "bytes", [lit(3)]), null);
  const view = inputBytes(Uint8Array.from([71, 69, 84, 7]));
  const m = matchSequence(view, "bytes", [lit(71), lit(69), lit(84)], "tail");
  assert.equal(m.tail.kind, "ByteView");
  assert.equal(m.tail.bitStart, 24);
  assert.equal(byteAt(m.tail, 0), 7);
  assert.equal(matchSequence(view, "bytes", [lit(80)], "rest"), null);
  const nested = matchSequence(inputBytes(Uint8Array.from([10, 20, 30])), "bytes", [lit(10)], "rest");
  assert.equal(matchSequence(nested.rest, "bytes", [lit(20), lit(30)]).constructor, Object);
  const bound = matchSequence(view, "bytes", [bind("first"), bind("_"), bind("third")], "_");
  assert.equal(bound.first, 71);
  assert.equal(bound.third, 84);
  assert.equal(Object.keys(bound).length, 2);
});

test("bits pattern consumes MSB-first bits and preserves an unaligned tail", () => {
  const v = inputBytes(Uint8Array.from([0b10100101]));
  assert.equal(matchSequence(v, "bits", [lit(1)]), null, "one bit is not a full byte");
  const got = matchSequence(v, "bits", [lit(1), lit(0), lit(1)], "tail");
  assert.equal(got.tail.kind, "BitView");
  assert.equal(got.tail.bitStart, 3);
  assert.equal(got.tail.bitLength, 5);
  assert.deepEqual(Array.from({length:5}, (_, i) => bitAt(got.tail, i)), [0,0,1,0,1]);
  assert.ok(matchSequence(v, "bits", [1,0,1,0,0,1,0,1].map(lit)));
  assert.ok(matchSequence(inputBytes(new Uint8Array()), "bits", []));
  const caps = matchSequence(v, "bits", [bind("flag"),bind("_"),lit(1)], "_");
  assert.equal(caps.flag, true);
  assert.equal(typeof caps.flag, "boolean");
});

test("bit tails can be nested, but bytes cannot silently round partial bytes", () => {
  const v = inputBytes(Uint8Array.from([0b10110101, 0b11110000]));
  const first = matchSequence(v, "bits", [lit(1), lit(0)], "rem");
  const second = matchSequence(first.rem, "bits", [lit(1), lit(1)], "rem");
  assert.equal(second.rem.bitStart, 4);
  assert.equal(second.rem.bitLength, 12);
  assert.throws(() => matchSequence(first.rem, "bytes", [lit(181)]), /unaligned/);
  assert.equal(matchSequence(second.rem, "bits", [lit(0),lit(1)], "rest") !== null, true);
});

test("invalid literals and duplicate patterns reject before reads", () => {
  const v = inputBytes(Uint8Array.from([255]));
  for (const n of [-1, 256, 1.2]) assert.throws(() => matchSequence(v, "bytes", [lit(n)], "_"), /literal/);
  for (const n of [-1, 2]) assert.throws(() => matchSequence(v, "bits", [lit(n)], "_"), /literal/);
  assert.throws(() => matchSequence(v, "bytes", [], "rest"), /empty prefix/);
  assert.throws(() => matchSequence(v, "bits", [bind("x"),bind("x")], "_"), /duplicate/);
  assert.throws(() => matchSequence(v, "bytes", [bind("x")], "x"), /duplicate/);
  assert.throws(() => matchSequence(v, "bytes", [lit(256)]), /literal/);
});

test("borrowed tail lifetime is checked against parent owner", () => {
  const source = inputBytes(Uint8Array.from([1, 2, 3]));
  const first = matchSequence(source, "bytes", [lit(1)], "rest");
  assert.equal(byteAt(first.rest, 0), 2);
  source.owner.live = false;
  assert.throws(() => byteAt(first.rest, 0), /expired borrowed/);
  assert.throws(() => matchSequence(first.rest, "bytes", [lit(2)]), /expired borrowed/);
});

test("two-packet-sized view and bit widths stay separate from positional bit literals", () => {
  const data = inputBytes(Uint8Array.from([0b10100101, 0, 3, 97, 98, 99]));
  const flagBits = matchSequence(viewSuffix(data, 0, "BitView"), "bits",
    [lit(1),lit(0),lit(1),lit(0),lit(0),lit(1),lit(0),lit(1)]);
  assert.ok(flagBits);
  const payload = viewSuffix(viewSuffix(data, 8, "ByteView"), 16, "ByteView");
  assert.equal(payload.bitLength, 24);
  assert.ok(matchSequence(payload, "bytes", [lit(97),lit(98),lit(99)]));
});
