// Source-only reference graph oracle for language/copyable-ownership-v1.md.
// NOT an AttoLang compiler, borrow checker, guest execution or AOT proof.
import test from 'node:test';
import assert from 'node:assert/strict';

const scalar = value => ({kind: 'scalar', value});
const klass = (name, fields, options = {}) => ({
  // Ordinary classes are copy-derived automatically when their fields pass.
  kind: 'class', name, fields, copy_mode: 'auto', ...options,
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
    if (value.kind === 'class') {
      if (value.copy_mode === 'no-copy') reject('E_COPY_FORBIDDEN', path);
      if (!['auto', 'manual'].includes(value.copy_mode))
        reject('E_COPY_UNPROVEN', path);
      if (value.copy_mode === 'manual' && typeof value.override_copy !== 'function')
        reject('E_COPY_UNPROVEN', path);
      if (value.override_copy && value.verified === false)
        reject('E_COPY_UNPROVEN', path);
      // A parent hook requires explicit proof that its post-processing can
      // compose without slicing or mutating source-owned storage.
      if (value.parent?.override_copy && value.parent.composable !== true)
        reject('E_COPY_INHERITANCE', path + '.parent');
    }
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
    if (value.parent) visit(value.parent, path + '.parent');
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
    let baseline_calls = 0;
    const super_copy = () => {
      // Model the compiler's nonvirtual whole-concrete-type default plan,
      // never a base-only clone or recursive invocation of the override.
      if (++baseline_calls !== 1) reject('E_COPY_OVERRIDE', '
  }
  const clone = duplicate(root);
  verify_detached(root, clone); // rejected custom alias never escapes the model
  return clone;
}

function mutable_nodes(root) {
  const result = new Set();
  function walk(v) {
    if (!v || typeof v !== 'object' || result.has(v)) return;
    if (v.kind !== 'scalar') result.add(v);
    if (v.fields) Object.values(v.fields).forEach(e => walk(e.value));
    if (v.elements) v.elements.forEach(walk);
    if (v.entries) v.entries.forEach(([k,val]) => {walk(k); walk(val);});
    if (v.parent) walk(v.parent);
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

test('ordinary class auto-copy succeeds without handwritten method or annotation', () => {
  const original = klass('Person', {
    name: field(scalar('Alice')),
    scores: field(array([scalar(1), scalar(2)])),
  });
  const copied = copy_bang(original);
  copied.fields.scores.value.elements[0].value = 99;
  assert.equal(original.fields.scores.value.elements[0].value, 1);
  assert.notEqual(copied, original);
});

test('auto derivation fails for a forbidden field or empty generic array', () => {
  assert.throws(() => copy_bang(klass('P', {socket: field(resource('socket'))})), {
    code: 'E_COPY_FORBIDDEN',
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
);
      if (value.parent) copy.parent = duplicate(value.parent);
      if (value.fields) copy.fields = Object.fromEntries(Object.entries(value.fields)
        .map(([k, e]) => [k, field(duplicate(e.value), e.no_copy)]));
      if (value.elements) copy.elements = value.elements.map(duplicate);
      if (value.entries) copy.entries = value.entries.map(([k,v]) => [duplicate(k), duplicate(v)]);
      return copy;
    };
    if (value.kind === 'class' && value.override_copy) {
      const outcome = value.override_copy(super_copy, value);
      if (baseline_calls !== 1 || outcome !== copy) reject('E_COPY_OVERRIDE', '
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
);
    } else super_copy();
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

test('auto-derived subclass copy includes inherited fields and preserves subtype', () => {
  const parent = klass('PersonBase', {scores: field(array([scalar(2)]))});
  const child = klass('Employee', {salary: field(scalar(10))}, {parent});
  const duplicate = copy_bang(child);
  assert.equal(duplicate.name, 'Employee');
  assert.equal(duplicate.parent.name, 'PersonBase');
  assert.notEqual(duplicate.parent, parent);
  duplicate.parent.fields.scores.value.elements[0].value = 42;
  assert.equal(parent.fields.scores.value.elements[0].value, 2);
});

test('manual override post-processes compiler baseline copy exactly once', () => {
  let baseline_invocations = 0;
  const source = klass('Person', {
    score: field(scalar(7)),
    cache: field(array([scalar(99)])),
  }, {copy_mode: 'manual', verified: true, override_copy: super_copy => {
    baseline_invocations++;
    const c = super_copy();
    c.fields.cache.value.elements[0].value = 0;
    return c;
  }});
  const copy = copy_bang(source);
  assert.equal(baseline_invocations, 1);
  assert.equal(copy.fields.cache.value.elements[0].value, 0);
  assert.equal(source.fields.cache.value.elements[0].value, 99);
});

test('manual override missing, repeated, or wrong-object super.copy is invalid', () => {
  assert.throws(() => copy_bang(klass('P', {}, {copy_mode: 'manual'})), {
    code: 'E_COPY_UNPROVEN',
  });
  assert.throws(() => copy_bang(klass('P', {}, {
    override_copy: () => klass('P', {}),
  })), {code: 'E_COPY_OVERRIDE'});
  assert.throws(() => copy_bang(klass('P', {}, {
    override_copy: super_copy => {super_copy(); super_copy();},
  })), {code: 'E_COPY_OVERRIDE'});
  const source = klass('P', {});
  source.override_copy = super_copy => {super_copy(); return source;};
  assert.throws(() => copy_bang(source), {code: 'E_COPY_OVERRIDE'});
});

test('manual override may not leak a mutable alias to the source', () => {
  const shared = array([scalar(42)]);
  const source = klass('P', {owned: field(shared)}, {
    override_copy: (super_copy, original) => {
      const c = super_copy();
      c.fields.owned.value = original.fields.owned.value; // malicious shallow rewrite
      return c;
    },
  });
  assert.throws(() => copy_bang(source), {code: 'E_COPY_ALIAS'});
});

test('uncomposable parent hook is rejected; proven hook preserves whole type', () => {
  const parent = klass('Parent', {age: field(scalar(5))}, {
    override_copy: super_copy => {const c = super_copy(); c.fields.age.value.value++; return c;},
  });
  const child = klass('Child', {scores: field(array([scalar(2)]))}, {parent});
  assert.throws(() => copy_bang(child), {code: 'E_COPY_INHERITANCE'});
  parent.composable = true; // explicit reference-model composition receipt
  const result = copy_bang(child);
  assert.equal(result.name, 'Child');
  assert.equal(result.parent.fields.age.value.value, 6);
  assert.equal(parent.fields.age.value.value, 5);
});

test('explicit implements/annotation cannot override no-copy field', () => {
  const source = klass('P', {secret: field(scalar(7), true)}, {
    copy_mode: 'manual',
    verified: true,
    override_copy: super_copy => super_copy(),
  });
  assert.throws(() => copy_bang(source), {code: 'E_COPY_TRANSITIVE'});
});
