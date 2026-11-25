// Host-only reference model: copy! is SHALLOW; copy!! is DEEP.
// This is NOT parser/compiler/runtime/AOT evidence.
import test from 'node:test';
import assert from 'node:assert/strict';

const scalar = value => ({kind: 'scalar', value});
const klass = (name, fields = {}, extras = {}) =>
  ({kind: 'class', name, fields, ...extras});
const struct = (fields = {}) => ({kind: 'struct', fields});
const array = (elements = []) => ({kind: 'array', elements});
const shared = target => ({kind: 'handle', permission: 'shared', target});
const immutable = target => ({kind: 'handle', permission: 'immutable', target});
const unique = target => ({kind: 'handle', permission: 'unique', target});
const resource = name => ({kind: 'resource', name});

function fail(code, path = '$') {
  const e = new Error(code + ' at ' + path);
  e.code = code;
  throw e;
}

// A shallow copy must prove permission to retain every immediate reference.
// Inline scalar/struct fields are value-copied. Class/array references must
// be wrapped with an explicit share permission in this abstract host model.
function verify_shallow_slot(v, path) {
  if (!v || typeof v !== 'object') return;
  if (v.kind === 'scalar') return;
  if (v.kind === 'handle') {
    if (v.permission === 'shared' || v.permission === 'immutable') return;
    fail('E_COPY_SHALLOW_ALIAS', path);
  }
  if (v.kind === 'struct') {
    Object.entries(v.fields).forEach(([key, x]) =>
      verify_shallow_slot(x, path + '.' + key));
    return;
  }
  if (v.kind === 'resource') fail('E_COPY_FORBIDDEN', path);
  fail('E_COPY_SHALLOW_ALIAS', path);
}

function shallow_copy(root) {
  if (!root || typeof root !== 'object') return root;
  if (root.kind === 'resource') fail('E_COPY_FORBIDDEN');
  if (root.kind === 'handle') fail('E_COPY_UNPROVEN');
  if (root.no_copy) fail('E_COPY_FORBIDDEN');
  const slots = root.fields ? Object.entries(root.fields) :
    root.elements ? root.elements.map((x, i) => [String(i), x]) : [];
  // Validate all slots BEFORE creating any target: failure is source-safe.
  slots.forEach(([key, value]) => verify_shallow_slot(value, '$.' + key));
  function duplicate_slot(v) {
    if (!v || typeof v !== 'object') return v;
    if (v.kind === 'scalar') return scalar(v.value);
    if (v.kind === 'handle') return {...v}; // new handle, SAME referent
    if (v.kind === 'struct') {
      return struct(Object.fromEntries(Object.entries(v.fields)
        .map(([k, field]) => [k, duplicate_slot(field)])));
    }
    return fail('E_COPY_SHALLOW_ALIAS');
  }
  if (root.kind === 'scalar') return scalar(root.value);
  const result = {...root};
  if (root.fields) result.fields = Object.fromEntries(Object.entries(root.fields)
    .map(([key, value]) => [key, duplicate_slot(value)]));
  if (root.elements) result.elements = root.elements.map(duplicate_slot);
  // We deliberately do not change any source field/element.
  return result;
}

// Recursively clone mutable objects, memoizing before child traversal to
// preserve internal repeated pointers and proven cycles. Immutable targets
// may be retained. A real compiler must additionally prove this graph plan.
function deep_copy(root) {
  const seen = new WeakMap();
  function clone(v) {
    if (!v || typeof v !== 'object') return v;
    if (v.no_copy || v.kind === 'resource') fail('E_COPY_FORBIDDEN');
    if (v.kind === 'scalar') return scalar(v.value);
    if (v.kind === 'handle') {
      if (v.permission === 'immutable') return {...v};
      return {...v, target: clone(v.target)};
    }
    if (seen.has(v)) return seen.get(v);
    if (v.kind !== 'array' && v.kind !== 'class' && v.kind !== 'struct') {
      fail('E_COPY_UNPROVEN');
    }
    const target = {...v};
    seen.set(v, target); // register shell BEFORE children (cycles)
    if (v.fields) target.fields = Object.fromEntries(Object.entries(v.fields)
      .map(([key, x]) => [key, clone(x)]));
    if (v.elements) target.elements = v.elements.map(clone);
    return target;
  }
  return clone(root);
}

function invoke(root, mode) {
  // Stand-in for compiler-selected Object witness dispatch, not real dispatch.
  if (mode === 'copy!') return shallow_copy(root);
  if (mode === 'copy!!') return deep_copy(root);
  throw Error('unknown copy mode');
}

test('copy! duplicates only the outer Array<int> storage', () => {
  const src = array([scalar(1), scalar(2)]);
  const result = shallow_copy(src);
  assert.notEqual(src, result);
  assert.notEqual(src.elements, result.elements);
  assert.notEqual(src.elements[0], result.elements[0]);
  result.elements[0].value = 9;
  assert.equal(src.elements[0].value, 1);
});

test('copy! rejects a raw uniquely owned nested array reference', () => {
  const inner = array([scalar(4)]);
  const outer = array([inner]);
  assert.throws(() => shallow_copy(outer), {code: 'E_COPY_SHALLOW_ALIAS'});
  assert.equal(outer.elements[0], inner);
});

test('copy! permits explicit shared nested arrays and retains referent identity', () => {
  const inner = array([scalar(4)]);
  const src = array([shared(inner), shared(inner)]);
  const result = shallow_copy(src);
  assert.notEqual(result, src);
  assert.notEqual(result.elements, src.elements);
  assert.notEqual(result.elements[0], src.elements[0]);
  assert.equal(result.elements[0].target, inner);
  assert.equal(result.elements[1].target, inner);
  result.elements[0].target.elements[0].value = 7;
  assert.equal(src.elements[1].target.elements[0].value, 7);
});

test('copy!! recursively duplicates nested arrays', () => {
  const src = array([array([scalar(1), scalar(2)])]);
  const result = deep_copy(src);
  assert.notEqual(result, src);
  assert.notEqual(result.elements[0], src.elements[0]);
  result.elements[0].elements[0].value = 33;
  assert.equal(src.elements[0].elements[0].value, 1);
});

test('copy!! preserves repeated internal identities but not source identities', () => {
  const child = klass('Child', {x: scalar(4)});
  const src = array([shared(child), shared(child)]);
  const clone = deep_copy(src);
  assert.equal(clone.elements[0].target, clone.elements[1].target);
  assert.notEqual(clone.elements[0].target, child);
});

test('copy!! creates a graph-aware copy of cyclic nodes in the host model', () => {
  const node = klass('Node');
  node.fields.next = shared(node);
  const cloned = deep_copy(node);
  assert.notEqual(cloned, node);
  assert.equal(cloned.fields.next.target, cloned);
});

test('copy! of a cycle with a legal shared edge retains the original edge', () => {
  const node = klass('Node');
  node.fields.next = shared(node);
  const cloned = shallow_copy(node);
  assert.notEqual(cloned, node);
  assert.equal(cloned.fields.next.target, node);
});

test('unique nested owners cannot be shallow-duplicated', () => {
  const child = klass('Child', {n: scalar(1)});
  const src = klass('Parent', {child: unique(child)});
  assert.throws(() => shallow_copy(src), {code: 'E_COPY_SHALLOW_ALIAS'});
  assert.equal(src.fields.child.target, child);
  assert.notEqual(deep_copy(src).fields.child.target, child);
});

test('no-copy resources fail rather than duplicating handles in either mode', () => {
  const src = klass('P', {socket: resource('socket')});
  assert.throws(() => shallow_copy(src), {code: 'E_COPY_FORBIDDEN'});
  assert.throws(() => deep_copy(src), {code: 'E_COPY_FORBIDDEN'});
  assert.throws(() => shallow_copy(klass('NoCopy', {}, {no_copy: true})),
    {code: 'E_COPY_FORBIDDEN'});
});

test('embedded structs are value-copied but authorized references stay shared', () => {
  const ref = klass('Child');
  const src = klass('Root', {
    info: struct({count: scalar(2), link: immutable(ref)}),
  });
  const copied = shallow_copy(src);
  assert.notEqual(copied.fields.info, src.fields.info);
  assert.notEqual(copied.fields.info.fields.count, src.fields.info.fields.count);
  assert.equal(copied.fields.info.fields.link.target, ref);
});

test('class copying preserves nominal dynamic subtype and independent root state', () => {
  const src = klass('Employee', {salary: scalar(5), nested: shared(klass('Child'))});
  const copy = shallow_copy(src);
  assert.equal(copy.name, 'Employee');
  assert.notEqual(copy, src);
  assert.notEqual(copy.fields.salary, src.fields.salary);
  assert.equal(copy.fields.nested.target, src.fields.nested.target);
  const deep = deep_copy(src);
  assert.equal(deep.name, 'Employee');
  assert.notEqual(deep.fields.nested.target, src.fields.nested.target);
});

test('copy! and copy!! use distinct mode-specific operations', () => {
  const child = klass('Child', {counter: scalar(0)});
  const src = klass('Root', {child: shared(child)});
  const shallow = invoke(src, 'copy!');
  const deep = invoke(src, 'copy!!');
  assert.equal(shallow.fields.child.target, child);
  assert.notEqual(deep.fields.child.target, child);
});

test('source is still unchanged when shallow admission fails late', () => {
  const first = scalar(1);
  const bad = unique(array([scalar(2)]));
  const src = array([first, bad]);
  assert.throws(() => shallow_copy(src), {code: 'E_COPY_SHALLOW_ALIAS'});
  assert.equal(src.elements[0], first);
  assert.equal(src.elements[1], bad);
  assert.equal(bad.target.elements[0].value, 2);
});

test('copying immutable shared nodes does not require a new pointee identity', () => {
  const shared_static = klass('Interned', {constant: scalar(1)});
  const src = klass('Root', {name: immutable(shared_static)});
  const a = shallow_copy(src), b = deep_copy(src);
  assert.equal(a.fields.name.target, shared_static);
  assert.equal(b.fields.name.target, shared_static);
});

test('new root does not prove unique deep ownership', () => {
  const child = klass('Mutable');
  const src = klass('Parent', {child: shared(child)});
  const shallow = shallow_copy(src);
  assert.notEqual(src, shallow);
  assert.equal(src.fields.child.target, shallow.fields.child.target);
  const deep = deep_copy(src);
  assert.notEqual(src.fields.child.target, deep.fields.child.target);
});
