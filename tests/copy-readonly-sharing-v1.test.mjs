// HOST-ONLY semantic oracle. Reachability recomputation is intentionally slow;
// this is not the production algorithm or compiler/guest evidence.
import test from 'node:test';
import assert from 'node:assert/strict';

const fail = code => { throw Object.assign(new Error(code), {code}); };
const ref = id => Object.freeze({id});
const isRef = v => v !== null && typeof v === 'object';

class Heap {
  #nodes = new Map();
  #roots = new Map();
  #loans = new Map();
  #next = 1;
  node(kind, entries = [], noCopy = false) {
    const id = this.#next++;
    this.#nodes.set(id, {kind, slots: new Map(entries), noCopy});
    return ref(id);
  }
  root(node) {
    for (const id of this.walk(node)) {
      if (this.#holders(ref(id)) !== 0 || this.#loaned(id)) fail('E_COPY_DOMAIN');
    }
    const owner = Symbol(); this.#roots.set(owner, node); return owner;
  }
  #get(r) { const n = this.#nodes.get(r?.id); if (!n) fail('E_COPY_STALE'); return n; }
  target(owner) { const r = this.#roots.get(owner); if (!r) fail('E_COPY_STALE'); return r; }
  walk(root, budget = 100000) {
    const seen = new Set(), pending = [root]; let work = 0;
    while (pending.length) {
      const r = pending.pop(); if (++work > budget) fail('E_COPY_BUDGET');
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      for (const v of this.#get(r).slots.values()) if (isRef(v)) pending.push(v);
    }
    return seen;
  }
  #holders(r) { return [...this.#roots.values()].filter(root => this.walk(root).has(r.id)).length; }
  #loaned(id) { return [...this.#loans.values()].some(l => l.reachable.has(id)); }
  #checkWrite(owner, r) {
    if (!this.walk(this.target(owner)).has(r.id)) fail('E_COPY_DOMAIN');
    if (this.#holders(r) !== 1) fail('E_COPY_READONLY');
    for (const loan of this.#loans.values()) if (loan.reachable.has(r.id)) fail('E_COPY_LOAN');
  }
  get(owner, r, key) {
    if (!this.walk(this.target(owner)).has(r.id)) fail('E_COPY_DOMAIN');
    return this.#get(r).slots.get(key);
  }
  set(owner, r, key, value) {
    this.#checkWrite(owner, r);
    if (isRef(value)) {
      // No new cross-owner authority through insertion; shared data already
      // reachable within this owner may be referenced, never modified.
      const existing = this.walk(this.target(owner));
      for (const id of this.walk(value)) {
        if (!existing.has(id) && (this.#holders(ref(id)) !== 0 || this.#loaned(id))) fail('E_COPY_DOMAIN');
      }
    }
    this.#get(r).slots.set(key, value);
  }
  remove(owner, r, key) { this.#checkWrite(owner, r); this.#get(r).slots.delete(key); }
  loan(owner, r, exclusive = false) {
    if (!this.walk(this.target(owner)).has(r.id)) fail('E_COPY_DOMAIN');
    const reachable = this.walk(r);
    if (exclusive) for (const id of reachable) this.#checkWrite(owner, ref(id));
    else for (const prior of this.#loans.values()) {
      if (prior.exclusive && [...reachable].some(id => prior.reachable.has(id))) fail('E_COPY_LOAN');
    }
    const token = Symbol(); this.#loans.set(token, {reachable, exclusive}); return token;
  }
  release(token) { if (!this.#loans.delete(token)) fail('E_COPY_STALE'); }
  drop(owner) { if (!this.#roots.delete(owner)) fail('E_COPY_STALE'); }
  copy(owner, deep = false, budget = 100000) {
    const source = this.target(owner), graph = this.walk(source, budget);
    for (const id of graph) {
      // Conservative phase 1: deny even retaining a forbidden descendant.
      if (this.#get(ref(id)).noCopy) fail('E_COPY_FORBIDDEN');
      for (const loan of this.#loans.values()) {
        if (loan.exclusive && loan.reachable.has(id)) fail('E_COPY_LOAN');
      }
    }
    let result;
    if (!deep) {
      const n = this.#get(source); result = this.node(n.kind, n.slots);
    } else {
      const memo = new Map();
      for (const id of graph) memo.set(id, this.node(this.#get(ref(id)).kind));
      for (const id of graph) {
        const dest = this.#get(memo.get(id));
        for (const [key, v] of this.#get(ref(id)).slots) dest.slots.set(key, isRef(v) ? memo.get(v.id) : v);
      }
      result = memo.get(source.id);
    }
    const target = Symbol(); this.#roots.set(target, result); return target;
  }
}
function fixture(kind = 'class') {
  const h = new Heap(), leaf = h.node('array', [[0, 10]]), child = h.node('record', [['leaf', leaf]]);
  const root = h.node(kind, [['count', 1], ['data', child]]), a = h.root(root);
  return {h, leaf, child, root, a};
}
const deny = (fn, code = 'E_COPY_READONLY') => assert.throws(fn, {code});

for (const kind of ['class', 'record', 'map', 'array']) {
  test(`${kind}: independent root slots, shared descendant read-only from both roots`, () => {
    const {h, a, root, child, leaf} = fixture(kind), b = h.copy(a), br = h.target(b);
    assert.notEqual(br.id, root.id); assert.equal(h.get(b, br, 'data'), child);
    h.set(a, root, 'count', 2); h.set(b, br, 'count', 3);
    assert.equal(h.get(a, root, 'count'), 2); assert.equal(h.get(b, br, 'count'), 3);
    deny(() => h.set(a, leaf, 0, 99)); deny(() => h.set(b, leaf, 0, 99));
    const fresh = h.node('array', [[0, 20]]); h.set(b, br, 'data', fresh);
    h.set(b, fresh, 0, 21); h.set(a, leaf, 0, 11);
    assert.equal(h.get(b, fresh, 0), 21); assert.equal(h.get(a, leaf, 0), 11);
  });
}
test('map new entry can be written, removed independently', () => {
  const {h, a, root, leaf} = fixture('map'), b = h.copy(a), br = h.target(b);
  const extra = h.node('array', [[0, 4]]); h.set(b, br, 'new', extra); h.set(b, extra, 0, 5);
  assert.equal(h.get(a, root, 'new'), undefined); assert.equal(h.get(b, extra, 0), 5);
  h.remove(b, br, 'data'); h.set(a, leaf, 0, 12); assert.equal(h.get(a, leaf, 0), 12);
});
test('old aliases cannot bypass identity-based denial', () => {
  const {h, a, leaf} = fixture(); const oldAlias = leaf; h.copy(a);
  deny(() => h.set(a, oldAlias, 0, 99));
});
test('three roots: dropping one is insufficient', () => {
  const {h, a, leaf} = fixture(), b = h.copy(a), c = h.copy(b);
  h.drop(b); deny(() => h.set(a, leaf, 0, 42)); h.drop(c); h.set(a, leaf, 0, 42);
});
test('repeated aliases inside one owner do not cause permanent freeze', () => {
  const {h, a, root, child, leaf} = fixture(); h.set(a, root, 'again', child);
  const b = h.copy(a), br = h.target(b); h.remove(b, br, 'data');
  deny(() => h.set(a, leaf, 0, 42)); h.remove(b, br, 'again'); h.set(a, leaf, 0, 42);
});
test('read loan outlives removal of other root and delays write recovery', () => {
  const {h, a, leaf} = fixture(), b = h.copy(a), loan = h.loan(b, leaf);
  h.drop(b); deny(() => h.set(a, leaf, 0, 42), 'E_COPY_LOAN'); h.release(loan); h.set(a, leaf, 0, 42);
});
test('exclusive loan blocks copy atomically, retry succeeds', () => {
  const {h, a, leaf} = fixture(), loan = h.loan(a, leaf, true);
  deny(() => h.copy(a), 'E_COPY_LOAN'); h.release(loan); h.set(a, leaf, 0, 42); h.copy(a);
  deny(() => h.set(a, leaf, 0, 43));
});
test('shared descendants cannot acquire exclusive loans', () => {
  const {h, a, child} = fixture(); h.copy(a); deny(() => h.loan(a, child, true));
});
test('deep copy of shallow-shared data detaches it', () => {
  const {h, a, root, leaf} = fixture(); h.copy(a); const c = h.copy(a, true), cr = h.target(c);
  const cc = h.get(c, cr, 'data'), cl = h.get(c, cc, 'leaf'); assert.notEqual(cl.id, leaf.id);
  h.set(c, cl, 0, 99); assert.equal(h.get(a, leaf, 0), 10); deny(() => h.set(a, leaf, 0, 42));
  assert.notEqual(cr.id, root.id);
});
test('self-cycle freezes original root if reachable from clone', () => {
  const h = new Heap(), r = h.node('record', [['count', 1]]), a = h.root(r); h.set(a, r, 'self', r);
  const b = h.copy(a), br = h.target(b); assert.equal(h.get(b, br, 'self'), r);
  deny(() => h.set(a, r, 'count', 2)); h.set(b, br, 'count', 3);
  h.remove(b, br, 'self'); h.set(a, r, 'count', 4);
});
test('deep cycle preserves internal identity and is writable', () => {
  const h = new Heap(), r = h.node('class'), a = h.root(r); h.set(a, r, 'self', r);
  const b = h.copy(a, true), br = h.target(b); assert.equal(h.get(b, br, 'self'), br); h.set(b, br, 'n', 7);
  assert.equal(h.get(a, r, 'n'), undefined);
});
test('noncopyable nested data rejects both modes without freezing source', () => {
  const {h, a, root} = fixture(); const bad = h.node('resource', [], true); h.set(a, root, 'bad', bad);
  for (const deep of [false, true]) deny(() => h.copy(a, deep), 'E_COPY_FORBIDDEN'); h.set(a, root, 'count', 8);
});
test('budget failure is atomic and does not freeze source', () => {
  const {h, a, leaf} = fixture(); deny(() => h.copy(a, false, 1), 'E_COPY_BUDGET'); h.set(a, leaf, 0, 42);
});
test('new entry cannot smuggle a foreign mutable reference', () => {
  const {h, a, root} = fixture(), foreign = h.node('array'), other = h.root(foreign);
  deny(() => h.set(a, root, 'foreign', foreign), 'E_COPY_DOMAIN'); assert.equal(h.target(other), foreign);
});
test('dropped root cannot mutate or read', () => {
  const {h, a, root} = fixture(); h.drop(a); deny(() => h.set(a, root, 'count', 2), 'E_COPY_STALE');
  deny(() => h.get(a, root, 'count'), 'E_COPY_STALE');
});
test('new root cannot launder an already-owned descendant', () => {
  const {h, leaf} = fixture(); const forged = h.node('record', [['leaf', leaf]]);
  deny(() => h.root(forged), 'E_COPY_DOMAIN');
});
test('detached but loaned data cannot be acquired by a new root', () => {
  const {h, a, leaf} = fixture(), loan = h.loan(a, leaf); h.drop(a);
  deny(() => h.root(leaf), 'E_COPY_DOMAIN'); h.release(loan);
  // Reclamation is outside this oracle; do not resurrect a real freed node.
});
