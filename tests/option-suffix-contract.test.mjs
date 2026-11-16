// Source-only reference test of the formal/type grammar and admitted call shapes.
// This is NOT an Atto compiler or guest-execution proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';

function normalizeType(type) {
  const t = type.replace(/\s+/g, '');
  if (t.endsWith('??')) throw Error('E_TYPE_SUFFIX');
  if (t.endsWith('?')) {
    const inner = t.slice(0, -1);
    if (inner === 'void' || !inner) throw Error('E_TYPE_SUFFIX');
    return `Option<${inner}>`;
  }
  if (!t) throw Error('E_TYPE');
  return t;
}
function parseFormal(raw) {
  const source = raw.trim();
  let name, type, omittable;
  const first = source.match(/^([a-z_][\w]*)(\?)?\s*:\s*(.+)$/);
  if (first) {
    [, name] = first; omittable = Boolean(first[2]); type = normalizeType(first[3]);
  } else {
    // On type-first forms, the final identifier is the only formal name.
    const last = source.match(/^(.+?)\s+([a-z_][\w]*)(\?)?$/);
    if (!last) throw Error('E_FORMAL');
    type = normalizeType(last[1]); name = last[2]; omittable = Boolean(last[3]);
  }
  if (omittable && !type.startsWith('Option<')) throw Error('E_OMITTABLE_DEFAULT');
  return { name, type, omittable };
}
function splitTopLevel(source) {
  const result = []; let depth = 0, start = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '<') depth++;
    else if (source[i] === '>') depth--;
    else if (source[i] === ',' && depth === 0) {
      result.push(source.slice(start, i)); start = i + 1;
    }
    if (depth < 0) throw Error('E_TYPE');
  }
  if (depth) throw Error('E_TYPE');
  if (source.trim()) result.push(source.slice(start));
  return result;
}
function signature(source) {
  const params = splitTopLevel(source).map(parseFormal);
  const names = new Set();
  let hadOmittable = false;
  for (const p of params) {
    if (names.has(p.name)) throw Error('E_DUPLICATE');
    names.add(p.name);
    if (!p.omittable && hadOmittable) throw Error('E_OMITTABLE_ORDER');
    hadOmittable ||= p.omittable;
  }
  return { params, minimum: params.filter(p => !p.omittable).length, maximum: params.length };
}
function overlaps(a, b) {
  return Math.max(a.minimum, b.minimum) <= Math.min(a.maximum, b.maximum);
}
function bindPositional(sig, values) {
  if (values.length < sig.minimum || values.length > sig.maximum) throw Error('E_ARITY');
  return [...values, ...sig.params.slice(values.length).map(p => {
    if (!p.omittable || !p.type.startsWith('Option<')) throw Error('E_OMITTABLE_DEFAULT');
    return { type: p.type, variant: 'None' };
  })];
}
function bindNamed(sig, entries) {
  const slots = new Array(sig.params.length).fill(undefined);
  let seenNamed = false, positional = 0;
  for (const e of entries) {
    if (e.label !== undefined) {
      seenNamed = true;
      const idx = sig.params.findIndex(p => p.name === e.label);
      if (idx < 0) throw Error('E_UNKNOWN_LABEL');
      if (slots[idx] !== undefined) throw Error('E_DUPLICATE_LABEL');
      slots[idx] = e.value;
    } else {
      if (seenNamed) throw Error('E_POSITIONAL_AFTER_NAMED');
      if (positional >= slots.length) throw Error('E_ARITY');
      slots[positional++] = e.value;
    }
  }
  return slots.map((v, i) => {
    if (v !== undefined) return v;
    const p = sig.params[i];
    if (!p.omittable) throw Error('E_ARITY');
    return { type: p.type, variant: 'None' };
  });
}
function rejects(fn, code) {
  assert.throws(fn, e => e.message === code);
}

test('both formal orientations and canonical Option type spelling', () => {
  assert.deepEqual(parseFormal('X? x?'), parseFormal('x?: Option<X>'));
  assert.deepEqual(parseFormal('Result<int,string>? output?'),
    parseFormal('output?: Option<Result<int,string>>'));
  assert.equal(parseFormal('X? x').omittable, false);
  rejects(() => parseFormal('X x?'), 'E_OMITTABLE_DEFAULT');
});
test('positionally omittable formals synthesize an explicit typed None', () => {
  const sig = signature('int n, int? x?, Result<int,string>? y?');
  assert.deepEqual([sig.minimum, sig.maximum], [1, 3]);
  const args = bindPositional(sig, [42]);
  assert.deepEqual(args, [42,
    { type: 'Option<int>', variant: 'None' },
    { type: 'Option<Result<int,string>>', variant: 'None' }]);
  assert.deepEqual(bindPositional(sig, [42, 'explicit None', 'explicit Some']),
    [42, 'explicit None', 'explicit Some']);
  rejects(() => bindPositional(sig, []), 'E_ARITY');
  rejects(() => bindPositional(sig, [1, 2, 3, 4]), 'E_ARITY');
});
test('overlap detection ignores payload type to avoid type-directed arity guesses', () => {
  assert.equal(overlaps(signature('int x'), signature('int x, int? y?')), true);
  assert.equal(overlaps(signature('int? x?'), signature('int x, int? y?')), true);
  assert.equal(overlaps(signature('int x'), signature('int x, int y')), false);
});
test('negative marker and order cases fail deterministically', () => {
  for (const [formals, code] of [
    ['int x?', 'E_OMITTABLE_DEFAULT'],
    ['void? x?', 'E_TYPE_SUFFIX'],
    ['int?? x?', 'E_TYPE_SUFFIX'],
    ['int? x?, int y', 'E_OMITTABLE_ORDER'],
    ['int? x, int? x?', 'E_DUPLICATE'],
    ['x?: int, int y', 'E_OMITTABLE_DEFAULT'],
  ]) rejects(() => signature(formals), code);
});
test('named binding preserves formal slots and rejects conflicting labels', () => {
  const sig = signature('int n, int? x?, int? y?');
  assert.deepEqual(bindNamed(sig, [{value: 4}, {label: 'y', value: 'Some(7)'}]),
    [4, {type:'Option<int>', variant:'None'}, 'Some(7)']);
  rejects(() => bindNamed(sig, [{label:'oops',value:1}]), 'E_UNKNOWN_LABEL');
  rejects(() => bindNamed(sig, [{value:1},{label:'n',value:2}]), 'E_DUPLICATE_LABEL');
  rejects(() => bindNamed(sig, [{label:'n',value:2},{value:1}]), 'E_POSITIONAL_AFTER_NAMED');
  rejects(() => bindNamed(sig, [{label:'x',value:2}]), 'E_ARITY');
});
