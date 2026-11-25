// Host-only model of Atto copy!! actor isolation and static AOT clone dispatch.
// NOT compiled Atto guest execution, a real ownership checker, or an AOT binary.
import test from 'node:test';
import assert from 'node:assert/strict';

const BASE_PRIVATE = Symbol('Base.priv');
const CHILD_PRIVATE = Symbol('Child.priv');
let constructor_calls = 0;
let base_hook_calls = 0;

class Base {
  constructor() {
    constructor_calls++;
    this[BASE_PRIVATE] = [1, 2];
    this.label = 'base';
  }
  copy_deep() { return deep_copy_aot(this, 'caller'); }
}
class PayloadRecord { constructor() { this.payload = [3, 4]; } }
class Child extends Base {
  constructor() {
    super();
    this[CHILD_PRIVATE] = new PayloadRecord();
  }
}
class Node {
  constructor(value) { this.value = value; this.next = null; }
}
class Unregistered { constructor() { this.value = 12; } }

const compiled_descriptors = new Map([
  [Base, {prototype: Base.prototype, fields: [BASE_PRIVATE, 'label'], hooks: [() => { base_hook_calls++; }]}],
  [Child, {
    // Compiler-emitted concrete plan explicitly includes private inherited slots.
    prototype: Child.prototype,
    fields: [BASE_PRIVATE, 'label', CHILD_PRIVATE],
    hooks: [() => { base_hook_calls++; }],
  }],
  [Node, {prototype: Node.prototype, fields: ['value', 'next'], hooks: []}],
  [PayloadRecord, {prototype: PayloadRecord.prototype, fields: ['payload'], hooks: []}],
]);

function make_copy_context(domain) {
  return {domain, memo: new WeakMap(), unpublished: [], retired: []};
}

function deep_copy_aot(root, domain) {
  const ctx = make_copy_context(domain);
  try {
    return {value: clone_into(root, ctx), ctx};
  } catch (err) {
    // Model one fail-atomic rollback ledger per operation/destination.
    ctx.retired.push(...ctx.unpublished.reverse());
    ctx.unpublished.length = 0;
    throw err;
  }
}

function clone_into(source, ctx) {
  if (source === null || typeof source !== 'object') return source;
  if (ctx.memo.has(source)) return ctx.memo.get(source);
  if (Array.isArray(source)) {
    const target = [];
    ctx.memo.set(source, target);
    ctx.unpublished.push(target);
    for (const element of source) target.push(clone_into(element, ctx));
    return target;
  }
  const desc = compiled_descriptors.get(source.constructor);
  if (!desc) {
    const err = new Error('E_COPY_AOT_WITNESS');
    err.code = 'E_COPY_AOT_WITNESS';
    throw err;
  }
  const target = Object.create(desc.prototype); // precompiled concrete shell
  ctx.memo.set(source, target); // before nested refs, for cycles/repeated aliases
  ctx.unpublished.push(target);
  for (const key of desc.fields) target[key] = clone_into(source[key], ctx);
  for (const hook of desc.hooks) hook(target, source, ctx);
  return target;
}

function send_deep(actor, source) {
  const copy = deep_copy_aot(source, actor.name);
  if (actor.inbox.length >= actor.capacity) {
    copy.ctx.retired.push(...copy.ctx.unpublished.reverse());
    copy.ctx.unpublished.length = 0;
    return {ok: false, retired: copy.ctx.retired.length};
  }
  actor.inbox.push(copy.value);
  return {ok: true};
}

function actor(name, capacity = Infinity) { return {name, capacity, inbox: []}; }

test('inherited Base.copy_deep dispatches to full Child descriptor and preserves private slots', () => {
  const original = new Child();
  const before = constructor_calls;
  const b = original; // conceptual upcast to Base
  const copied = b.copy_deep().value;
  assert.ok(copied instanceof Child);
  assert.notEqual(copied, original);
  assert.notEqual(copied[BASE_PRIVATE], original[BASE_PRIVATE]);
  assert.notEqual(copied[CHILD_PRIVATE], original[CHILD_PRIVATE]);
  assert.notEqual(copied[CHILD_PRIVATE].payload, original[CHILD_PRIVATE].payload);
  assert.deepEqual(copied[BASE_PRIVATE], [1, 2]);
  assert.deepEqual(copied[CHILD_PRIVATE].payload, [3, 4]);
  assert.equal(constructor_calls, before, 'no effectful constructor replay');
});

test('compiled base hook runs once per concrete object, not for each field or repeated alias', () => {
  const original = new Child();
  const before = base_hook_calls;
  const copied = deep_copy_aot([original, original], 'actor-A').value;
  assert.equal(copied[0], copied[1]);
  assert.equal(base_hook_calls - before, 1);
});

test('separate actor sends have no shared mutable nested children', () => {
  const source = new Child();
  const a = actor('A'), b = actor('B');
  assert.deepEqual(send_deep(a, source), {ok: true});
  assert.deepEqual(send_deep(b, source), {ok: true});
  const x = a.inbox[0], y = b.inbox[0];
  assert.notEqual(x, y);
  assert.notEqual(x[CHILD_PRIVATE], y[CHILD_PRIVATE]);
  assert.notEqual(x[CHILD_PRIVATE].payload, y[CHILD_PRIVATE].payload);
  x[CHILD_PRIVATE].payload[0] = 999;
  assert.equal(y[CHILD_PRIVATE].payload[0], 3);
  assert.equal(source[CHILD_PRIVATE].payload[0], 3);
});

test('repeated references and cycles are memoized within each send, not between sends', () => {
  const node = new Node(5);
  node.next = node;
  const original = [node, node];
  const a = actor('A'), b = actor('B');
  send_deep(a, original);
  send_deep(b, original);
  const ca = a.inbox[0], cb = b.inbox[0];
  assert.equal(ca[0], ca[1]);
  assert.equal(cb[0], cb[1]);
  assert.equal(ca[0].next, ca[0]);
  assert.equal(cb[0].next, cb[0]);
  assert.notEqual(ca[0], cb[0]);
  assert.notEqual(ca[0], node);
});

test('second recipient refusal retires only its unpublished copy', () => {
  const source = new Child();
  const a = actor('A'), denied = actor('B', 0);
  assert.equal(send_deep(a, source).ok, true);
  const failed = send_deep(denied, source);
  assert.equal(failed.ok, false);
  assert.ok(failed.retired > 0);
  assert.equal(denied.inbox.length, 0);
  assert.equal(a.inbox.length, 1);
  assert.deepEqual(a.inbox[0][BASE_PRIVATE], [1, 2]);
  assert.deepEqual(source[BASE_PRIVATE], [1, 2]);
});

test('unknown concrete AOT type rejects instead of copying base fields or slicing', () => {
  assert.throws(() => deep_copy_aot(new Unregistered(), 'A'), {
    code: 'E_COPY_AOT_WITNESS',
  });
});

test('a no-argument superclass API uses a separate hidden copy context', () => {
  assert.equal(Base.prototype.copy_deep.length, 0);
  const source = new Child();
  const x = source.copy_deep();
  const y = source.copy_deep();
  assert.notEqual(x.ctx, y.ctx);
  assert.notEqual(x.value, y.value);
  assert.notEqual(x.value[CHILD_PRIVATE], y.value[CHILD_PRIVATE]);
});
