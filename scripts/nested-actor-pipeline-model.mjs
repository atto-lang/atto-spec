// SOURCE-FREE reference model only. No AttoLang parser, guest compiler, actor,
// security boundary or runtime is executed by this module.
// Host-side descriptor brands prevent accidental JS shape spoofing in this model;
// actual AttoLang construction must be compiler/type/effect-checked.

const stages = new WeakSet();
const pipelines = new WeakSet();
const verifiedPlans = new WeakSet();
const policies = new Set(['#one_for_one', '#one_for_all', '#rest_for_one']);

export const DEFAULT_LIMITS = Object.freeze({
  defaultCapacity: 32,
  maxDepth: 64,
  maxStages: 1024,
  maxEdges: 1023,
  maxScopes: 256,
  maxEdgeCapacity: 65536,
  maxTotalSlots: 1_000_000,
});

const HARD_LIMITS = Object.freeze({
  defaultCapacity: 65536, maxDepth: 128, maxStages: 4096, maxEdges: 4095,
  maxScopes: 1024, maxEdgeCapacity: 1_048_576, maxTotalSlots: 16_777_216,
});

function assertPort(port) {
  if (port !== null && (typeof port !== 'string' || port.length === 0 || port !== port.trim())) {
    throw new TypeError('invalid port type');
  }
}

export function stage(name, input, output) {
  if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new TypeError('invalid stage name');
  }
  assertPort(input);
  assertPort(output);
  const value = Object.freeze({kind: 'stage', name, input, output});
  stages.add(value);
  return value;
}

export function pipe(...parts) {
  if (parts.length === 0) throw new TypeError('empty pipeline');
  if (!parts.every(part => stages.has(part) || pipelines.has(part))) {
    throw new TypeError('invalid or forged stage/pipeline descriptor');
  }
  const value = Object.freeze({kind: 'pipe', parts: Object.freeze([...parts]), capacity: null, supervision: null});
  pipelines.add(value);
  return value;
}

export function with_capacity(builder, capacity) {
  if (!pipelines.has(builder)) throw new TypeError('invalid or forged pipeline descriptor');
  if (builder.capacity !== null) throw new TypeError('duplicate capacity configuration');
  if (!Number.isSafeInteger(capacity) || capacity < 1) throw new RangeError('invalid capacity');
  const value = Object.freeze({...builder, capacity});
  pipelines.add(value);
  return value;
}

export function with_supervision(builder, policy) {
  if (!pipelines.has(builder)) throw new TypeError('invalid or forged pipeline descriptor');
  if (builder.supervision !== null) throw new TypeError('duplicate supervision configuration');
  if (!policies.has(policy)) throw new TypeError('invalid supervision strategy');
  const value = Object.freeze({...builder, supervision: policy});
  pipelines.add(value);
  return value;
}

function limitsFromOptions(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('invalid limits');
  }
  const limits = {...DEFAULT_LIMITS};
  for (const key of Object.keys(options)) {
    if (!Object.hasOwn(limits, key)) throw new TypeError(`unknown limit: ${key}`);
    const descriptor = Object.getOwnPropertyDescriptor(options, key);
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) throw new TypeError(`invalid limit property: ${key}`);
    const value = descriptor.value;
    if (!Number.isSafeInteger(value) || value <= 0 || value > HARD_LIMITS[key]) {
      throw new RangeError(`invalid limit: ${key}`);
    }
    limits[key] = value;
  }
  if (limits.defaultCapacity > limits.maxEdgeCapacity) throw new RangeError('default capacity exceeds maxEdgeCapacity');
  return Object.freeze(limits);
}

function freezePlan(result) {
  const freezeArray = values => Object.freeze(values.map(value => Object.freeze(value)));
  const scopes = result.scopes.map(s => Object.freeze({
    ...s,
    children: freezeArray(s.children),
  }));
  const plan = Object.freeze({
    nodes: freezeArray(result.nodes),
    edges: freezeArray(result.edges),
    scopes: Object.freeze(scopes),
    ports: Object.freeze(result.ports),
    totalSlots: result.totalSlots,
  });
  verifiedPlans.add(plan);
  return plan;
}

// Analyze unstarted, owned, sequential pipeline descriptors. This is not start().
// Ports use exact nominal string equality as a minimal reference approximation;
// production assignability/ownership/Sendable checks require the real type system.
export function analyze_pipeline(root, options = {}) {
  if (!pipelines.has(root)) throw new TypeError('pipeline root required');
  const limits = limitsFromOptions(options);
  const seen = new WeakSet();
  const nodes = [];
  const edges = [];
  const scopes = [];
  const scopeMap = new Map();
  let totalSlots = 0n;

  function recordScope(id, parent, policy, physical) {
    if (scopes.length >= limits.maxScopes) throw new RangeError('supervisor scope budget exceeded');
    const value = {id, parent, policy, physical, children: []};
    scopes.push(value);
    scopeMap.set(id, value);
    if (parent !== null) recordChild(parent, {id, kind: 'supervisor'});
  }

  function recordChild(owner, child) {
    const scope = scopeMap.get(owner);
    if (!scope) throw new TypeError('unregistered supervisor scope');
    scope.children.push({...child, order: scope.children.length});
  }

  function recordEdge(from, to, capacity, owner) {
    if (edges.length >= limits.maxEdges) throw new RangeError('edge budget exceeded');
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > limits.maxEdgeCapacity) {
      throw new RangeError('edge capacity limit exceeded');
    }
    totalSlots += BigInt(capacity);
    if (totalSlots > BigInt(limits.maxTotalSlots)) throw new RangeError('aggregate edge slot budget exceeded');
    edges.push({from, to, capacity, owner});
  }

  function visit(item, path, parentScope, inheritedCapacity, depth) {
    if (!item || !(stages.has(item) || pipelines.has(item))) {
      throw new TypeError('invalid or forged descriptor');
    }
    if (seen.has(item)) throw new TypeError('reused or aliased descriptor');
    seen.add(item);

    if (stages.has(item)) {
      if (nodes.length >= limits.maxStages) throw new RangeError('actor stage budget exceeded');
      const node = {id: path, name: item.name, owner: parentScope, input: item.input, output: item.output};
      nodes.push(node);
      recordChild(parentScope, {id: path, kind: 'actor'});
      return {first: path, last: path, input: item.input, output: item.output};
    }

    if (depth > limits.maxDepth) throw new RangeError('nested pipeline depth exceeded');
    const capacity = item.capacity ?? inheritedCapacity;
    if (capacity > limits.maxEdgeCapacity) throw new RangeError('edge capacity limit exceeded');
    const realScope = path === 'root' || item.supervision !== null;
    const scope = realScope ? path : parentScope;
    if (realScope) recordScope(scope, parentScope, item.supervision, item.supervision !== null);

    let first = null;
    let previous = null;
    for (let i = 0; i < item.parts.length; i++) {
      const next = visit(item.parts[i], `${path}/${i}`, scope, capacity, depth + 1);
      if (previous !== null) {
        if (previous.output === null || next.input === null) {
          throw new TypeError('source/sink position mismatch');
        }
        if (previous.output !== next.input) throw new TypeError('incompatible boundary port types');
        recordEdge(previous.last, next.first, capacity, scope);
      }
      if (first === null) first = next;
      previous = next;
    }
    return {first: first.first, last: previous.last, input: first.input, output: previous.output};
  }

  const endpoints = visit(root, 'root', null, limits.defaultCapacity, 1);
  // Canonical DATA-edge order is source stage order, not post-order traversal.
  const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
  edges.sort((a, b) => nodeOrder.get(a.from) - nodeOrder.get(b.from));

  return freezePlan({
    nodes, edges, scopes,
    ports: {input: endpoints.input, output: endpoints.output},
    totalSlots: Number(totalSlots),
  });
}

// This is a direct-child policy model, not a runtime restart simulation.
export function restart_targets(plan, scopeId, failedDirectChildId) {
  if (!verifiedPlans.has(plan)) throw new TypeError('unverified source-free plan');
  const scope = plan.scopes.find(s => s.id === scopeId);
  if (!scope) throw new TypeError('unknown supervisor scope');
  if (!scope.physical) throw new TypeError('inherited supervisor policy is not known to this model');
  const index = scope.children.findIndex(c => c.id === failedDirectChildId);
  if (index < 0) throw new TypeError('not a direct child of supervisor');
  if (scope.policy === '#one_for_one') return Object.freeze([failedDirectChildId]);
  if (scope.policy === '#one_for_all') return Object.freeze(scope.children.map(c => c.id));
  if (scope.policy === '#rest_for_one') return Object.freeze(scope.children.slice(index).map(c => c.id));
  throw new TypeError('unsupported supervision policy');
}
