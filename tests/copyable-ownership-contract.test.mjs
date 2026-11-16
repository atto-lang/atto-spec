// Source-only reference graph oracle for language/copyable-ownership-v1.md.
// NOT an AttoLang compiler, borrow checker, guest execution or AOT proof.
import test from 'node:test';
import assert from 'node:assert/strict';

const scalar = value => ({kind: 'scalar', value});
const klass = (name, fields, options = {}) => ({
  kind: 'class', name, fields, own_copy: true, verified: true, ...options,
});
const struct = fields => ({kind: 'struct', fields});
const array = (elements, element_copyable = true, options = {}) => ({
  kind: 'array', elements, element_copyable, ...options,
});
const list = elements => ({kind: 'list', elements});
const tuple = elements => ({kind: 'tuple', elements});
const map = entries => ({kind: 'map', entries});
const resource = name => ({kind: 'resource', name});
const view = target => ({kind: 'view', target});
const field = (value, no_copy = false) => ({value, no_copy});

class CopyFailure extends Error {
  constructor(code, path) {
    super(code + ': ' + path);
    this.code = code;
    this.path = path;
  }
}
function reject(code, path) { throw new CopyFailure(code, path); }

function validate_copy(root) {
  const finished = new WeakSet(), active = new WeakSet();
  function visit(value, path) {
    if (!value || typeof value !== 'object') reject('E_COPY_UNPROVEN', path);
    if (active.has(value)) {
      if (!value.graph_proven) reject('E_COPY_GRAPH_UNPROVEN', path);
      return;
    }
    if (finished.has(value)) return;
    if (value.no_copy) reject('E_COPY_FORBIDDEN', path);
    if (value.kind === 'resource') reject('E_COPY_FORBIDDEN', path);
    if (value.kind === 'view') reject('E_COPY_VIEW', path);
    if (value.kind === 'class' && (!value.own_copy || !value.verified))
      reject('E_COPY_UNPROVEN', path);
    if (value.kind === 'array' && !value.element_copyable)
      reject('E_COPY_TRANSITIVE', path + '[element type]');
    if (!['scalar','class','struct','array','list','tuple','map'].includes(value.kind))
      reject('E_COPY_UNPROVEN', path);
    active.add(value);
    if (value.fields) for (const [name, entry] of Object.entries(value.fields)) {
      if (entry.no_copy) reject('E_COPY_TRANSITIVE', path + '.' + name);
      visit(entry.value, path + '.' + name);
    }
    if (value.elements) value.elements.forEach((e,i) => visit(e, path + '[' + i + ']'));
    if (value.entries) value.entries.forEach(([k,v],i) => {
      visit(k, path + '.key[' + i + ']');
      visit(v, path + '.value[' + i + ']');
    });
    active.delete(value);
    finished.add(value);
  }
  visit(root, '$');
}

function copy_bang(root) {
  // Admission happens before constructing any output node; model only.
  validate_copy(root);
  const seen = new WeakMap();
  function duplicate(value) {
    if (seen.has(value)) return seen.get(value);
    const copy = {...value};
    seen.set(value, copy); // permit verified cyclic graph construction
    if (value.fields) copy.fields = Object.fromEntries(Object.entries(value.fields)
      .map(([k, e]) => [k, field(duplicate(e.value), e.no_copy)]));
    if (value.elements) copy.elements = value.elements.map(duplicate);
    if (value.entries) copy.entries = value.entries.map(([k,v]) => [duplicate(k), duplicate(v)]);
    return copy;
  }
  return duplicate(root);
}

function mutable_nodes(root) {
  const result = new Set();
  function walk(v) {
    if (!v || typeof v !== 'object' || result.has(v)) return;
    if (v.kind !== 'scalar') result.add(v);
    if (v.fields) Object.values(v.fields).forEach(e => walk(e.value));
    if (v.elements) v.elements.forEach(walk);
    if (v.entries) v.entries.forEach(([k,val]) => {walk(k); walk(val);});
  }
  walk(root);
  return result;
}
function verify_detached(original, candidate) {
  const source = mutable_nodes(original);
  for (const item of mutable_nodes(candidate)) {
    if (source.has(item)) reject('E_COPY_ALIAS', '$');
  }
}

test('class copy separates the original, nested array and struct', () => {
  const original = klass('Person', {
    age: field(scalar(20)),
    info: field(struct({scores: field(array([scalar(1), scalar(2)]))})),
  });
  const copied = copy_bang(original);
  verify_detached(original, copied);
  copied.fields.info.value.fields.scores.value.elements[0].value = 99;
  assert.equal(original.fields.info.value.fields.scores.value.elements[0].value, 1);
  assert.notEqual(copied, original);
});

test('arrays/lists/tuples/maps recursively detach, including keys and values', () => {
  const source = tuple([
    array([scalar(1), array([scalar(2)])]),
    list([klass('P', {x: field(scalar(3))})]),
    map([[klass('Key', {x: field(scalar(4))}), array([scalar(5)])]]),
  ]);
  const duplicate = copy_bang(source);
  verify_detached(source, duplicate);
  duplicate.elements[2].entries[0][1].elements[0].value = 17;
  assert.equal(source.elements[2].entries[0][1].elements[0].value, 5);
});

test('repeated internal aliases remain repeated but never alias source', () => {
  const child = klass('Child', {x: field(scalar(4))});
  const source = array([child, child]);
  const copied = copy_bang(source);
  assert.equal(copied.elements[0], copied.elements[1]);
  assert.notEqual(copied.elements[0], child);
  verify_detached(source, copied);
});

test('cycles fail closed without proof, verified cycle preserves topology', () => {
  const source = klass('Node', {});
  source.fields.next = field(source);
  assert.throws(() => copy_bang(source), {code: 'E_COPY_GRAPH_UNPROVEN'});
  source.graph_proven = true;
  const copied = copy_bang(source);
  assert.equal(copied.fields.next.value, copied);
  verify_detached(source, copied);
});

test('noncopyable fields and resources reject transitively', () => {
  const forbidden = klass('Credential', {token: field(scalar(5), true)});
  assert.throws(() => copy_bang(forbidden), {code: 'E_COPY_TRANSITIVE'});
  assert.throws(() => copy_bang(struct({socket: field(resource('socket'))})), {
    code: 'E_COPY_FORBIDDEN',
  });
  assert.throws(() => copy_bang(klass('MoveOnly', {}, {no_copy: true})), {
    code: 'E_COPY_FORBIDDEN',
  });
});

test('missing class proof, inherited-only method, and empty generic array fail', () => {
  assert.throws(() => copy_bang(klass('NoMethod', {}, {own_copy: false})), {
    code: 'E_COPY_UNPROVEN',
  });
  assert.throws(() => copy_bang(klass('Unverified', {}, {verified: false})), {
    code: 'E_COPY_UNPROVEN',
  });
  assert.throws(() => copy_bang(array([], false)), {code: 'E_COPY_TRANSITIVE'});
});

test('views never silently alias underlying owner under copy!', () => {
  assert.throws(() => copy_bang(view(array([scalar(1)]))), {
    code: 'E_COPY_VIEW',
  });
});

test('malicious shallow-copy and original-return implementations are rejected', () => {
  const original = klass('P', {owned: field(array([scalar(3)]))});
  assert.throws(() => verify_detached(original, original), {code: 'E_COPY_ALIAS'});
  const shallow = {...original, fields: {...original.fields}};
  assert.throws(() => verify_detached(original, shallow), {code: 'E_COPY_ALIAS'});
});

test('failure does not mutate or invalidate original', () => {
  const first = klass('First', {x: field(scalar(7))});
  const root = array([first, klass('Bad', {}, {verified: false})]);
  assert.throws(() => copy_bang(root), {code: 'E_COPY_UNPROVEN'});
  assert.equal(root.elements[0], first);
  assert.equal(first.fields.x.value.value, 7);
});

test('copy! and rt copy reference the same conceptual primitive', () => {
  const copy_rt = copy_bang; // compiler lowering equivalence is still UNVERIFIED
  const src = struct({x: field(scalar(42))});
  assert.deepEqual(copy_bang(src), copy_rt(src));
  assert.notEqual(copy_bang(src), src);
});
