// This is a source-free reference oracle, NOT executed .atto AOT/JIT evidence.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const spec = readFileSync(path.join(root, "spec/27-inverted-structs-classes-aot-jit.md"), "utf8");

class ReferenceColumns {
  constructor(fields) {
    this.fields = fields;
    this.columns = Object.fromEntries(fields.map(f => [f, []]));
    this.issuer = {};
    this.slots = [];
    this.denseToSlot = [];
    this.free = [];
    this.readers = new Map(fields.map(f => [f, 0]));
    this.writers = new Set();
    this.epoch = 1;
    this.codeGeneration = 1;
    this.closed = false;
  }
  open() { if (this.closed) throw Error("closed"); }
  quiescent() {
    if (this.writers.size || [...this.readers.values()].some(n => n !== 0))
      throw Error("borrow conflict");
  }
  resolve(handle) {
    this.open();
    if (!handle || handle.issuer !== this.issuer) throw Error("foreign handle");
    const slot = this.slots[handle.slot];
    if (!slot || !slot.live || slot.generation !== handle.generation)
      throw Error("stale handle");
    return slot.row;
  }
  push(data) {
    this.open();
    this.quiescent();
    if (Object.keys(data).length !== this.fields.length
        || this.fields.some(f => !Object.hasOwn(data, f)))
      throw Error("row width mismatch");
    const row = this.denseToSlot.length;
    const slot = this.free.length ? this.free.pop() : this.slots.length;
    if (slot === this.slots.length) this.slots.push({ generation: 1, live: false, row: 0 });
    for (const field of this.fields) this.columns[field].push(data[field]);
    this.slots[slot].live = true;
    this.slots[slot].row = row;
    this.denseToSlot.push(slot);
    this.epoch++;
    return Object.freeze({ issuer: this.issuer, slot, generation: this.slots[slot].generation });
  }
  snapshot(handle) {
    const row = this.resolve(handle);
    if (this.writers.size) throw Error("borrow conflict");
    return Object.fromEntries(this.fields.map(f => [f, this.columns[f][row]]));
  }
  get(handle, field) {
    const row = this.resolve(handle);
    if (!this.fields.includes(field)) throw Error("unknown field");
    if (this.writers.has(field)) throw Error("borrow conflict");
    return this.columns[field][row];
  }
  set(handle, field, value) {
    const row = this.resolve(handle);
    if (!this.fields.includes(field)) throw Error("unknown field");
    if (this.writers.has(field) || this.readers.get(field)) throw Error("borrow conflict");
    this.columns[field][row] = value;
  }
  eraseSwap(handle) {
    const row = this.resolve(handle);
    this.quiescent();
    const last = this.denseToSlot.length - 1;
    if (row !== last) {
      for (const field of this.fields) this.columns[field][row] = this.columns[field][last];
      const moved = this.denseToSlot[last];
      this.denseToSlot[row] = moved;
      this.slots[moved].row = row;
    }
    for (const field of this.fields) this.columns[field].pop();
    this.denseToSlot.pop();
    const retired = this.slots[handle.slot];
    retired.live = false;
    retired.generation++;
    this.free.push(handle.slot);
    this.epoch++;
  }
  loan(field, write) {
    this.open();
    if (!this.fields.includes(field)) throw Error("unknown field");
    if (this.writers.has(field) || (write && this.readers.get(field)))
      throw Error("borrow conflict");
    if (write) this.writers.add(field);
    else this.readers.set(field, this.readers.get(field) + 1);
    let released = false;
    return {
      close: () => {
        if (released) return;
        released = true;
        if (write) this.writers.delete(field);
        else this.readers.set(field, this.readers.get(field) - 1);
      },
      read: (row) => {
        if (released || this.closed) throw Error("revoked loan");
        if (row < 0 || row >= this.denseToSlot.length) throw Error("bounds");
        return this.columns[field][row];
      },
      write: (row, value) => {
        if (!write || released || this.closed) throw Error("revoked loan");
        if (row < 0 || row >= this.denseToSlot.length) throw Error("bounds");
        this.columns[field][row] = value;
      }
    };
  }
  close() { this.closed = true; this.epoch++; }
  hotReload() { this.codeGeneration++; }
}

function specialize(store) {
  return { issuer: store.issuer, epoch: store.epoch,
    generation: store.codeGeneration, schema: store.fields.join("|") };
}
function guardedSet(store, plan, handle, field, value) {
  // The optimized path must check all assumptions before writing any value.
  if (plan.issuer !== store.issuer || plan.epoch !== store.epoch
      || plan.generation !== store.codeGeneration
      || plan.schema !== store.fields.join("|"))
    return "DEOPT_BEFORE_EFFECT";
  store.set(handle, field, value);
  return "COMMITTED";
}

test("spec distinguishes value snapshots from generation-checked class handles", () => {
  assert.match(spec, /\\*\\*Status: TARGET \\/ DRAFT/);
  assert.match(spec, /\\*\\*inverted struct\\*\\*/);
  assert.match(spec, /\\*\\*inverted class\\*\\*/);
  assert.match(spec, /source-free reference oracle|host models/);
  const store = new ReferenceColumns(["x", "y"]);
  const handle = store.push({ x: 1, y: 2 });
  const snapshot = store.snapshot(handle);
  snapshot.x = 99;
  assert.equal(store.get(handle, "x"), 1);
  assert.equal(store.get(handle, "y"), 2);
});

test("swap-delete retains survivors and rejects stale and foreign capabilities", () => {
  const a = new ReferenceColumns(["x", "y"]);
  const b = new ReferenceColumns(["x", "y"]);
  const deleted = a.push({ x: 1, y: 4 });
  const survivor = a.push({ x: 2, y: 5 });
  const foreign = b.push({ x: 9, y: 8 });
  a.eraseSwap(deleted);
  assert.deepEqual(a.snapshot(survivor), { x: 2, y: 5 });
  assert.throws(() => a.get(deleted, "x"), /stale/);
  assert.throws(() => a.get(foreign, "x"), /foreign/);
  const reused = a.push({ x: 3, y: 6 });
  assert.equal(reused.slot, deleted.slot);
  assert.notEqual(reused.generation, deleted.generation);
  assert.throws(() => a.get(deleted, "x"), /stale/);
});

test("field-sensitive loans permit disjoint writes but fence all structural mutation", () => {
  const store = new ReferenceColumns(["x", "y"]);
  const row = store.push({ x: 1, y: 2 });
  const read = store.loan("x", false);
  const anotherRead = store.loan("x", false);
  const otherWriter = store.loan("y", true);
  assert.equal(read.read(0), 1);
  otherWriter.write(0, 7);
  assert.throws(() => store.loan("x", true), /borrow/);
  assert.throws(() => store.loan("y", false), /borrow/);
  assert.throws(() => store.push({ x: 4, y: 5 }), /borrow/);
  assert.throws(() => store.eraseSwap(row), /borrow/);
  assert.throws(() => store.set(row, "x", 6), /borrow/);
  anotherRead.close(); read.close(); otherWriter.close();
  assert.deepEqual(store.snapshot(row), { x: 1, y: 7 });
});

test("JIT specialization invalidates before mutation on resize, hot reload and owner mismatch", () => {
  const store = new ReferenceColumns(["x", "y"]);
  const row = store.push({ x: 3, y: 4 });
  const plan = specialize(store);
  assert.equal(guardedSet(store, plan, row, "x", 8), "COMMITTED");
  store.push({ x: 10, y: 11 });
  assert.equal(guardedSet(store, plan, row, "x", 999), "DEOPT_BEFORE_EFFECT");
  assert.equal(store.get(row, "x"), 8);
  const newPlan = specialize(store);
  store.hotReload();
  assert.equal(guardedSet(store, newPlan, row, "x", 999), "DEOPT_BEFORE_EFFECT");
  assert.equal(store.get(row, "x"), 8);
  const foreignPlan = specialize(new ReferenceColumns(["x", "y"]));
  assert.equal(guardedSet(store, foreignPlan, row, "x", 999), "DEOPT_BEFORE_EFFECT");
  assert.equal(store.get(row, "x"), 8);
});

test("closing revokes checked loans and optimized accesses", () => {
  const store = new ReferenceColumns(["x"]);
  const row = store.push({ x: 42 });
  const plan = specialize(store);
  const loan = store.loan("x", false);
  store.close();
  assert.throws(() => loan.read(0), /revoked/);
  assert.equal(guardedSet(store, plan, row, "x", 99), "DEOPT_BEFORE_EFFECT");
  loan.close();
  loan.close();
  assert.throws(() => store.get(row, "x"), /closed/);
});
