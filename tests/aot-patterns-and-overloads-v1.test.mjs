import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

const contract = JSON.parse(readFileSync(new URL("../contracts/aot-patterns-and-overloads-v1/cases.json", import.meta.url), "utf8"));

// Source-free semantics reference only. No test below compiles or runs AttoLang.
function validateOverloadFamily(slots) {
  const seen = new Set();
  for (const slot of slots) {
    if (!["fnc", "mtd", "static", "constructor"].includes(slot.kind)) throw Error("kind");
    if (slot.kind === "constructor" && slot.actor) throw Error("actor constructor forbidden");
    const key = JSON.stringify([slot.owner, slot.kind, slot.name, slot.args.length]);
    if (!seen.has(key)) seen.add(key);
  }
  for (let i = 0; i < slots.length; i++) {
    for (let j = 0; j < i; j++) {
      const a = slots[i], b = slots[j];
      if (a.owner !== b.owner || a.kind !== b.kind || a.name !== b.name || a.args.length !== b.args.length) continue;
      let distinctEnum = false;
      for (let k = 0; k < a.args.length; k++) {
        const x = a.args[k], y = b.args[k];
        if (x.type === y.type && x.id === y.id) continue;
        if (x.type !== "enum" || y.type !== "enum" || !x.id || !y.id) throw Error("non-nominal overload");
        distinctEnum = true;
      }
      if (!distinctEnum) throw Error("duplicate overload");
    }
  }
  return slots;
}

function selectStatic(slots, owner, kind, name, args) {
  const family = validateOverloadFamily(slots.filter(s => s.owner === owner && s.kind === kind && s.name === name && s.args.length === args.length));
  const candidates = family.filter(s => s.args.every((type, i) => type.type === args[i].type && type.id === args[i].id));
  if (candidates.length !== 1) throw Error(candidates.length ? "ambiguous" : "not found");
  return candidates[0];
}

function matchHeadTail(input, n) {
  if (!Array.isArray(input) || !Number.isSafeInteger(n) || n < 1 || input.length < n) return null;
  return { heads: input.slice(0, n), tail: input.slice(n) };
}

function binaryMatch(source, segments) {
  if (!(source instanceof Uint8Array)) throw TypeError("source must be Bytes-like");
  let bitPos = 0;
  const fields = Object.create(null);
  const readBits = n => {
    if (!Number.isSafeInteger(n) || n < 0 || n > 64) throw Error("unsupported bit width");
    if (bitPos + n > source.length * 8) return null;
    let result = 0n;
    for (let i = 0; i < n; i++) {
      const pos = bitPos + i;
      result = result * 2n + BigInt((source[pos >> 3] >> (7 - (pos & 7))) & 1);
    }
    bitPos += n;
    return result;
  };
  for (const s of segments) {
    if (s.type === "rest") {
      if (s !== segments.at(-1)) throw Error("rest not last");
      if (bitPos % 8 !== 0) throw Error("unaligned rest");
      fields[s.name] = source.slice(bitPos / 8);
      bitPos = source.length * 8;
      continue;
    }
    let bits;
    if (s.type === "u8") bits = 8;
    else if (s.type === "u16be" || s.type === "u16le") bits = 16;
    else if (s.type === "bits") bits = s.width;
    else if (s.type === "bytes") {
      if (bitPos % 8 !== 0) throw Error("unaligned bytes");
      const length = typeof s.length === "string" ? fields[s.length] : s.length;
      if (!Number.isSafeInteger(length) || length < 0) throw Error("invalid or forward length");
      if (length > Math.floor((source.length * 8 - bitPos) / 8)) return null;
      fields[s.name] = source.slice(bitPos / 8, bitPos / 8 + length);
      bitPos += length * 8;
      continue;
    } else throw Error("unknown segment type");
    const value = readBits(bits);
    if (value === null) return null;
    if (s.type === "u16le") {
      const high = value >> 8n, low = value & 255n;
      fields[s.name] = Number((low << 8n) | high);
    } else {
      fields[s.name] = Number(value);
    }
  }
  return bitPos === source.length * 8 ? fields : null;
}

test("versioned source corpus is unique, fail-closed, and explicitly unexecuted", () => {
  assert.equal(contract.schema, "attolang.aot-patterns-and-overloads.v1");
  assert.equal(contract.status, "TARGET_NOT_EXECUTED");
  assert.equal(contract.source_extension, ".atto");
  assert.ok(contract.cases.length >= 25);
  assert.equal(new Set(contract.cases.map(x => x.id)).size, contract.cases.length);
  assert.ok(contract.require_all_backends.length >= 5);
  for (const c of contract.cases) {
    assert.ok(["accept", "reject"].includes(c.kind));
    assert.ok(["symbols", "overload", "constructor", "destructure", "binary"].includes(c.feature));
    assert.ok(c.source.length > 15 && !c.source.includes("<<"));
    if (c.kind === "reject") assert.match(c.diagnostic, /^E_/);
    else assert.notEqual(c.expect, undefined);
    assert.equal(c.actual_guest_execution, undefined, "corpus must never forge a guest run");
  }
});

test("overloads select by source-visible arity, then canonical enum identity", () => {
  const int = { type: "int" };
  const A = { type: "enum", id: "mod::A" };
  const B = { type: "enum", id: "mod::B" };
  const slots = [
    { owner: "mod", kind: "fnc", name: "foo", args: [int], result: 1 },
    { owner: "mod", kind: "fnc", name: "foo", args: [int, int], result: 2 },
    { owner: "mod", kind: "mtd", name: "foo", args: [A], result: 3 },
    { owner: "mod", kind: "mtd", name: "foo", args: [B], result: 4 },
    { owner: "mod", kind: "constructor", name: "Point", args: [int], result: 5 }
  ];
  assert.equal(selectStatic(slots, "mod", "fnc", "foo", [int]).result, 1);
  assert.equal(selectStatic(slots, "mod", "fnc", "foo", [int, int]).result, 2);
  assert.equal(selectStatic(slots, "mod", "mtd", "foo", [B]).result, 4);
  assert.equal(selectStatic(slots, "mod", "constructor", "Point", [int]).result, 5);
  assert.throws(() => selectStatic(slots, "mod", "mtd", "foo", [int]), /not found/);
});

test("duplicate primitive signatures, return-only differences and actors reject", () => {
  const int = { type: "int" };
  const str = { type: "string" };
  const slot = (args, result) => ({ owner: "mod", kind: "fnc", name: "f", args, result });
  assert.throws(() => validateOverloadFamily([slot([int], 1), slot([str], 2)]), /non-nominal/);
  assert.throws(() => validateOverloadFamily([slot([int], 1), slot([int], 2)]), /duplicate/);
  assert.throws(() => validateOverloadFamily([{owner:"A", kind:"constructor", actor:true, name:"A", args:[]}]), /actor/);
});

test("nested head-tail capture is immutable and preserves empty suffix", () => {
  const values = [[10, 20], 30, 40];
  const result = matchHeadTail(values, 1);
  assert.deepEqual(result, {heads: [[10, 20]], tail: [30, 40]});
  assert.deepEqual(matchHeadTail([1], 1), {heads: [1], tail: []});
  assert.equal(matchHeadTail([], 1), null);
  assert.equal(matchHeadTail([1], 2), null);
  result.tail[0] = 999;
  assert.deepEqual(values, [[10, 20], 30, 40]);
});

test("binary and packet patterns have identical BE length and rest semantics", () => {
  const source = Uint8Array.from([1, 0, 3, 97, 98, 99, 255]);
  const segments = [
    {name:"version", type:"u8"}, {name:"length", type:"u16be"},
    {name:"payload", type:"bytes", length:"length"}, {name:"rest", type:"rest"}
  ];
  const fields = binaryMatch(source, segments);
  assert.equal(fields.version, 1);
  assert.equal(fields.length, 3);
  assert.deepEqual([...fields.payload], [97, 98, 99]);
  assert.deepEqual([...fields.rest], [255]);
  assert.equal(binaryMatch(source, segments.slice(0, -1)), null, "exact match rejects leftover byte");
  assert.equal(binaryMatch(source.slice(0, 5), segments), null, "truncation is nonmatch");
  assert.deepEqual([...binaryMatch(Uint8Array.from([0, 0, 0]), [
    {name:"version",type:"u8"},{name:"length",type:"u16be"},{name:"payload",type:"bytes",length:"length"}
  ]).payload], []);
});

test("bit extraction, explicit little endian, alignment and forward lengths", () => {
  const bits = binaryMatch(Uint8Array.from([0b10100111]), [
    {name:"flag",type:"bits",width:3}, {name:"kind",type:"bits",width:5}
  ]);
  assert.equal(bits.flag, 5);
  assert.equal(bits.kind, 7);
  assert.equal(binaryMatch(Uint8Array.from([0x34, 0x12]), [{name:"x",type:"u16le"}]).x, 0x1234);
  assert.throws(() => binaryMatch(Uint8Array.from([0]), [
    {name:"x",type:"bits",width:1}, {name:"y",type:"bytes",length:0}
  ]), /unaligned/);
  assert.throws(() => binaryMatch(Uint8Array.from([0]), [
    {name:"y",type:"bytes",length:"length"}, {name:"length",type:"u8"}
  ]), /forward length/);
  assert.throws(() => binaryMatch(Uint8Array.from([0]), [
    {name:"rest",type:"rest"}, {name:"extra",type:"u8"}
  ]), /rest not last/);
});


test("canonical .atto fixtures retain exact Git blob hashes and explicit expected outcomes", () => {
  assert.equal(contract.fixtures.length, 6);
  const names = new Set();
  for (const item of contract.fixtures) {
    assert.ok(item.path.endsWith(".atto") && !item.path.includes("/"));
    assert.ok(!names.has(item.path), item.path);
    names.add(item.path);
    const text = readFileSync(new URL("../contracts/aot-patterns-and-overloads-v1/" + item.path, import.meta.url));
    const sha = createHash("sha1")
      .update("blob " + text.length + "\0")
      .update(text).digest("hex");
    assert.equal(sha, item.blob_sha, item.path);
    assert.ok(text.toString("utf8").includes("main()"));
    if (item.kind === "accept") assert.equal(item.expected_exit, 42);
    else assert.match(item.diagnostic, /^E_/);
  }
});
