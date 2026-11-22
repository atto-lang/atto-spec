export function identifier(value, label) {
  if (typeof value !== "string" || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(value) || value.length > 80) {
    throw new TypeError(label + " must be an ASCII identifier (1..80 characters)");
  }
  return value;
}

export function validateProtocol(input) {
  if (input === null || typeof input !== "object" || Array.isArray(input)) throw new TypeError("protocol must be a record");
  const name = identifier(input.name, "protocol name");
  if (input.actor_kind !== "actor") throw new TypeError("a protocol refines the existing actor kind");
  const readNames = (values, label, limit) => {
    if (!Array.isArray(values) || values.length < 1 || values.length > limit) throw new TypeError("invalid " + label + " count");
    const result = values.map(x => identifier(x, label + " member"));
    if (new Set(result).size !== result.length) throw new TypeError("duplicate " + label + " member");
    return result;
  };
  const states = readNames(input.states, "states", 64);
  const terminal = readNames(input.terminal_states, "terminal_states", 64);
  if (!states.includes(input.initial)) throw new TypeError("initial state is undeclared");
  if (terminal.includes(input.initial)) throw new TypeError("initial state must not be terminal");
  for (const state of terminal) if (!states.includes(state)) throw new TypeError("terminal state is undeclared: " + state);
  if (!Array.isArray(input.transitions) || input.transitions.length < 1 || input.transitions.length > 256) {
    throw new TypeError("invalid transition count");
  }
  const transitions = [], keys = new Set();
  for (const rule of input.transitions) {
    if (!rule || typeof rule !== "object" || Array.isArray(rule)) throw new TypeError("invalid transition");
    const from = identifier(rule.from, "transition from");
    const to = identifier(rule.to, "transition to");
    const message = identifier(rule.message, "message");
    const reply = identifier(rule.reply, "reply");
    if (rule.kind !== "call") throw new TypeError("v1 requires a call with an explicit terminal reply");
    if (!states.includes(from) || !states.includes(to)) throw new TypeError("transition references unknown state");
    if (terminal.includes(from)) throw new TypeError("terminal states cannot accept messages");
    const key = from + "\u0000" + message;
    if (keys.has(key)) throw new TypeError("nondeterministic state/message transition");
    keys.add(key);
    transitions.push(Object.freeze({from, to, message, reply, kind:"call"}));
  }
  const reachable = new Set([input.initial]);
  for (let changed = true; changed;) {
    changed = false;
    for (const rule of transitions) {
      if (reachable.has(rule.from) && !reachable.has(rule.to)) {reachable.add(rule.to); changed = true;}
    }
  }
  if (reachable.size !== states.length) throw new TypeError("unreachable declared protocol state");
  const canEnd = new Set(terminal);
  for (let changed = true; changed;) {
    changed = false;
    for (const rule of transitions) {
      if (canEnd.has(rule.to) && !canEnd.has(rule.from)) {canEnd.add(rule.from); changed = true;}
    }
  }
  if (canEnd.size !== states.length) throw new TypeError("state has no declared path to protocol completion");
  return Object.freeze({
    name, actor_kind:"actor", initial:input.initial,
    states:Object.freeze(states), terminal_states:Object.freeze(terminal),
    transitions:Object.freeze(transitions),
    evidence:"SOURCE_FREE_REFERENCE_ONLY_NOT_GUEST_EXECUTION"
  });
}

export function checkSend(protocol, possibleStates, message) {
  const p = validateProtocol(protocol);
  identifier(message, "message");
  const states = typeof possibleStates === "string" ? [possibleStates] : possibleStates;
  if (!Array.isArray(states) || states.length === 0) throw new TypeError("state proof unavailable: use runtime-checked admission");
  const unique = [...new Set(states)];
  if (unique.length > 64) throw new TypeError("state-set budget exceeded");
  let reply = null;
  const next = new Set();
  for (const state of unique) {
    if (!p.states.includes(state)) throw new TypeError("unknown actor protocol state: " + state);
    const rule = p.transitions.find(x => x.from === state && x.message === message);
    if (!rule) throw new TypeError("illegal " + message + " in " + state);
    if (reply !== null && reply !== rule.reply) throw new TypeError("ambiguous reply type across possible states");
    reply = rule.reply;
    next.add(rule.to);
  }
  return Object.freeze({reply, next_states:Object.freeze([...next].sort())});
}

export function checkTrace(protocol, operations, options = {}) {
  const p = validateProtocol(protocol);
  if (!Array.isArray(operations) || operations.length > 512) throw new TypeError("invalid operation budget");
  const handles = new Map([["h0", Object.freeze({states:Object.freeze([p.initial]), generation:1})]]);
  const pending = new Map();
  let generation = 1, completed = false, fenced = false;
  for (const op of operations) {
    if (!op || typeof op !== "object") throw new TypeError("invalid operation");
    if (completed) throw new TypeError("operation after protocol completion");
    if (op.kind === "begin_call") {
      identifier(op.handle, "handle"); identifier(op.ticket, "ticket");
      if (!handles.has(op.handle)) throw new TypeError("consumed, absent or stale linear protocol handle");
      if (handles.has(op.ticket) || pending.has(op.ticket)) throw new TypeError("duplicate ticket");
      const owned = handles.get(op.handle);
      if (owned.generation !== generation) throw new TypeError("stale protocol generation");
      const next = checkSend(p, owned.states, op.message);
      handles.delete(op.handle);
      pending.set(op.ticket, {next, generation});
    } else if (op.kind === "resolve_reply") {
      identifier(op.ticket, "ticket"); identifier(op.next_handle, "next_handle");
      const waiting = pending.get(op.ticket);
      if (!waiting || waiting.generation !== generation) throw new TypeError("missing, duplicate or stale pending call");
      if (op.reply !== waiting.next.reply) throw new TypeError("missing or mismatched required reply");
      if (handles.has(op.next_handle) || pending.has(op.next_handle)) throw new TypeError("duplicate handle identity");
      pending.delete(op.ticket);
      handles.set(op.next_handle, Object.freeze({states:waiting.next.next_states, generation}));
    } else if (op.kind === "fail_call") {
      identifier(op.ticket, "ticket");
      if (!["AdmissionRejected","Timeout","Cancelled","Crash","ProtocolViolation"].includes(op.reason))
        throw new TypeError("failure must carry an explicit terminal reason");
      if (!pending.has(op.ticket)) throw new TypeError("missing or settled pending call");
      pending.delete(op.ticket); // Ambiguous delivery never returns the consumed handle.
    } else if (op.kind === "fence_restart") {
      generation += 1;
      handles.clear(); pending.clear(); fenced = true;
    } else if (op.kind === "complete") {
      identifier(op.handle, "handle");
      const owned = handles.get(op.handle);
      if (!owned || owned.generation !== generation) throw new TypeError("cannot complete without a live linear handle");
      if (pending.size || handles.size !== 1 || owned.states.some(s=>!p.terminal_states.includes(s)))
        throw new TypeError("protocol incomplete: not terminal, pending reply or other live handle");
      handles.delete(op.handle); completed = true;
    } else {
      throw new TypeError("unsupported protocol operation: " + String(op.kind));
    }
  }
  if (options.requireComplete !== false && !completed) throw new TypeError("protocol incomplete: no completed terminal proof");
  return Object.freeze({completed, fenced, generation, live_handles:handles.size, pending_calls:pending.size});
}
