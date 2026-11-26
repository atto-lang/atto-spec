// Reference checker for already-typed scalar aggregate literal descriptors.
// Not a source parser, guest compiler, or ABI implementation.
const kinds = new Set(['Record','Tuple','struct']);
const types = new Set(['bool','string','int','float']);
const namePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
const reserved = new Set(['infer','Record','Tuple','struct','bool','string','int','float','const','let','val','fnc','return','define','true','false']);
const fail = (code) => { throw new Error(code); };
function identifier(name) {
  if (typeof name !== 'string' || name.length > 128 || !namePattern.test(name) || reserved.has(name)) fail('E_TYPE_NAME');
}
function shape(kind, items) {
  if (!kinds.has(kind) || !Array.isArray(items) || !items.length || items.length > 64) fail('E_TYPE_INFER_AMBIGUOUS');
  const seen = new Set();
  const fields = items.map(item => {
    if (kind === 'Tuple') {
      if (!types.has(item)) fail('E_TYPE_INFER_AMBIGUOUS');
      return item;
    }
    if (!Array.isArray(item) || item.length !== 2 || !types.has(item[1])) fail('E_TYPE_INFER_AMBIGUOUS');
    const [name,type] = item;
    if (typeof name !== 'string' || !namePattern.test(name)) fail('E_FIELD_NAME');
    if (seen.has(name)) fail('E_DUPLICATE_FIELD');
    seen.add(name);
    return Object.freeze([name,type]);
  });
  // Scalar ASCII profile: canonical Record identity; struct layout retains source order.
  if (kind === 'Record') fields.sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return Object.freeze({kind,fields:Object.freeze(fields)});
}
export class TypeScope {
  #bindings = new Map();
  #parent;
  constructor(parent = null) { this.#parent = parent; }
  child() { return new TypeScope(this); }
  resolve(name) {
    identifier(name);
    const found = this.#bindings.get(name) ?? this.#parent?.resolve(name);
    if (!found) fail('E_UNKNOWN_TYPE');
    return found;
  }
  infer(kind, name, items) {
    identifier(name);
    if (this.#bindings.has(name)) fail('E_DUPLICATE_TYPE');
    const inferred = shape(kind,items);
    // Publish only after successful inference. Each struct descriptor has a
    // unique object identity (declaration-site identity in the real compiler).
    this.#bindings.set(name,inferred);
    return inferred;
  }
  anonymous(kind, items) { return shape(kind,items); }
  checkLiteral(kind, name, items) {
    const expected = this.resolve(name);
    if (expected.kind !== kind) fail('E_AGGREGATE_KIND');
    const actual = shape(kind,items);
    // A contextual struct literal is checked by name, then selects expected layout.
    const canonical = s => JSON.stringify(s.kind === 'struct'
      ? [...s.fields].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0) : s.fields);
    if (canonical(actual) !== canonical(expected)) fail('E_TYPE_MISMATCH');
    return expected;
  }
  checkValue(kind,name,actual) {
    const expected = this.resolve(name);
    if (expected.kind !== kind || actual.kind !== kind) fail('E_AGGREGATE_KIND');
    if (kind === 'struct' ? actual !== expected : JSON.stringify(actual.fields) !== JSON.stringify(expected.fields)) fail('E_TYPE_MISMATCH');
    return expected;
  }
}

// Signature-only reference: parameter descriptors are resolved in the declared
// type scope, without consulting or evaluating any argument value.
export function projectParameterField(scope, parameters, parameter, field) {
  const formal = parameters.get(parameter);
  if (!formal) fail('E_UNKNOWN_PARAMETER');
  const descriptor = scope.resolve(formal.alias);
  if (descriptor.kind !== formal.kind || descriptor.kind === 'Tuple') fail('E_AGGREGATE_KIND');
  const found = descriptor.fields.find(([name]) => name === field);
  if (!found) fail('E_NO_FIELD');
  return found[1];
}

// Each element is an already checked scalar static type. This model does not
// evaluate expressions, prove ownership or claim execution-order evidence.
export function checkSequenceReturn(expected, items) {
  if (!Array.isArray(items) || items.length === 0) fail('E_EMPTY_SEQUENCE');
  if (items.length > 128) fail('E_SEQUENCE_LIMIT');
  for (let i = 0; i < items.length; i++) {
    if (!Object.hasOwn(items,i) || !types.has(items[i])) fail('E_TYPE_INFER_AMBIGUOUS');
  }
  if (items.at(-1) !== expected) fail('E_TYPE_MISMATCH');
  return expected;
}
