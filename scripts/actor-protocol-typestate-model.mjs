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
    if (!["call", "stream"].includes(rule.kind))
      throw new TypeError("v1 requires a call or stream with a typed response");
    if (rule.kind === "call" && (Object.hasOwn(rule, "item") || !Object.hasOwn(rule, "reply")))
      throw new TypeError("unary call requires exactly one reply type");
    if (rule.kind === "stream" && (Object.hasOwn(rule, "reply") || !Object.hasOwn(rule, "item")))
      throw new TypeError("stream requires item type without a unary reply");
    const reply = rule.kind === "call" ? identifier(rule.reply, "reply") : undefined;
    const item = rule.kind === "stream" ? identifier(rule.item, "stream item") : undefined;
    if (!states.includes(from) || !states.includes(to)) throw new TypeError("transition references unknown state");
    if (terminal.includes(from)) throw new TypeError("terminal states cannot accept messages");
    const key = from + "\u0000" + message;
    if (keys.has(key)) throw new TypeError("nondeterministic state/message transition");
    keys.add(key);
    transitions.push(Object.freeze(rule.kind === "call"
      ? {from, to, message, reply, kind:"call"}
      : {from, to, message, item, kind:"stream"}));
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
  let kind = null, response = null;
  const next = new Set();
  for (const state of unique) {
    if (!p.states.includes(state)) throw new TypeError("unknown actor protocol state: " + state);
    const rule = p.transitions.find(x => x.from === state && x.message === message);
    if (!rule) throw new TypeError("illegal " + message + " in " + state);
    const current = rule.kind === "stream" ? rule.item : rule.reply;
    if (kind !== null && kind !== rule.kind)
      throw new TypeError("ambiguous response mode across possible states");
    if (response !== null && response !== current)
      throw new TypeError("ambiguous reply or stream item type across possible states");
    kind = rule.kind;
    response = current;
    next.add(rule.to);
  }
  const next_states = Object.freeze([...next].sort());
  return Object.freeze(kind === "call"
    ? {reply:response, next_states}
    : {kind:"stream", item:response, next_states});
}

export function checkTrace(protocol, operations, options = {}) {
  const p = validateProtocol(protocol);
  if (!Array.isArray(operations) || operations.length > 512) throw new TypeError("invalid operation budget");
  const handles = new Map([["h0", Object.freeze({states:Object.freeze([p.initial]), generation:1})]]);
  const pending = new Map();
  // Closed ticket/handle names are never recycled: reject replay after settlement.
  const seenTickets = new Set(), seenHandles = new Set(["h0"]);
  let generation = 1, completed = false, fenced = false, terminalFailures = 0;
  let actorState = p.initial, actorRevision = 0; // Symbolic actor-side state, not caller-supplied authority.
  for (const op of operations) {
    if (!op || typeof op !== "object") throw new TypeError("invalid operation");
    if (completed) throw new TypeError("operation after protocol completion");
    if (op.kind === "begin_call") {
      identifier(op.handle, "handle"); identifier(op.ticket, "ticket");
      if (!handles.has(op.handle)) throw new TypeError("consumed, absent or stale linear protocol handle");
      if (seenHandles.has(op.ticket) || seenTickets.has(op.ticket)) throw new TypeError("duplicate ticket");
      const owned = handles.get(op.handle);
      if (owned.generation !== generation) throw new TypeError("stale protocol generation");
      if (pending.size) throw new TypeError("overlapping state-changing protocol call");
      if (!owned.states.includes(actorState)) throw new TypeError("actor state no longer matches protocol proof");
      const next = checkSend(p, owned.states, op.message);
      handles.delete(op.handle);
      pending.set(op.ticket, {next, generation, phase:"prepared", message:op.message,
        from:actorState, startingRevision:actorRevision,
        stream:next.kind === "stream" ? {credits:0, buffered:0, emitted:0, received:0, closed:false} : null});
      seenTickets.add(op.ticket);
    } else if (op.kind === "admit_call") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || waiting.generation !== generation || waiting.phase !== "prepared")
        throw new TypeError("call admission requires one prepared, current-generation ticket");
      waiting.phase = "admitted"; // Bounded mailbox admission is not a reply or state commit.
    } else if (op.kind === "commit_transition") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || waiting.generation !== generation || waiting.phase !== "admitted")
        throw new TypeError("transition commit requires one admitted, current-generation ticket");
      if (actorRevision !== waiting.startingRevision || actorState !== waiting.from)
        throw new TypeError("actor state revision changed before protocol commit");
      const rule = p.transitions.find(x => x.from === actorState && x.message === waiting.message);
      if (!rule || op.from !== actorState || op.to !== rule.to)
        throw new TypeError("transition does not match actor-side protocol state and declared successor");
      actorState = rule.to;
      actorRevision += 1;
      waiting.phase = "committed";
      waiting.committedRevision = actorRevision;
      waiting.committedState = actorState;
    } else if (op.kind === "resolve_reply") {
      identifier(op.ticket, "ticket"); identifier(op.next_handle, "next_handle");
      const waiting = pending.get(op.ticket);
      if (!waiting || waiting.generation !== generation) throw new TypeError("missing, duplicate or stale pending call");
      if (waiting.phase !== "committed" || waiting.committedRevision !== actorRevision ||
          waiting.committedState !== actorState)
        throw new TypeError("reply cannot mint state authority before an authenticated transition commit");
      if (waiting.stream) throw new TypeError("stream transition cannot resolve as unary reply");
      if (op.reply !== waiting.next.reply) throw new TypeError("missing or mismatched required reply");
      if (seenHandles.has(op.next_handle) || seenTickets.has(op.next_handle) || pending.has(op.next_handle)) throw new TypeError("duplicate handle identity");
      pending.delete(op.ticket);
      handles.set(op.next_handle, Object.freeze({states:waiting.next.next_states, generation}));
      seenHandles.add(op.next_handle);
    } else if (op.kind === "stream_demand") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || waiting.generation !== generation || !waiting.stream ||
          waiting.phase !== "committed" || waiting.stream.closed)
        throw new TypeError("stream demand requires active committed stream");
      if (!Number.isSafeInteger(op.credits) || op.credits < 1 ||
          op.credits > 8 || waiting.stream.credits + op.credits > 8)
        throw new TypeError("stream credit budget exceeded");
      waiting.stream.credits += op.credits;
    } else if (op.kind === "stream_emit") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || !waiting.stream || waiting.generation !== generation ||
          waiting.phase !== "committed" || waiting.stream.closed)
        throw new TypeError("stream emission requires active committed stream");
      if (op.item !== waiting.next.item) throw new TypeError("incorrect stream item type");
      if (op.sequence !== waiting.stream.emitted)
        throw new TypeError("stream item sequence must be monotonic without gaps");
      if (waiting.stream.credits === 0 || waiting.stream.buffered >= 8)
        throw new TypeError("stream backpressure: no demand credit or buffer room");
      waiting.stream.credits -= 1;
      waiting.stream.buffered += 1;
      waiting.stream.emitted += 1;
    } else if (op.kind === "stream_receive_item") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || !waiting.stream || waiting.generation !== generation ||
          waiting.phase !== "committed" || waiting.stream.buffered === 0)
        throw new TypeError("stream item unavailable or terminal");
      if (op.sequence !== waiting.stream.received)
        throw new TypeError("stream item receive must preserve sequence order");
      waiting.stream.buffered -= 1;
      waiting.stream.received += 1;
    } else if (op.kind === "stream_close") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || !waiting.stream || waiting.generation !== generation ||
          waiting.phase !== "committed" || waiting.stream.closed)
        throw new TypeError("stream close requires one active committed stream");
      waiting.stream.closed = true;
      waiting.stream.credits = 0; // Terminal EOF refunds unused demand; buffered items remain ordered.
    } else if (op.kind === "stream_fail") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || !waiting.stream || waiting.generation !== generation ||
          waiting.phase !== "committed" || waiting.stream.closed)
        throw new TypeError("stream failure requires one active committed stream");
      if (!["ProducerError", "RemoteError"].includes(op.reason))
        throw new TypeError("stream terminal error must be typed");
      waiting.stream.closed = true;
      waiting.stream.error = op.reason;
      waiting.stream.credits = 0;
    } else if (op.kind === "stream_observe_error") {
      identifier(op.ticket, "ticket");
      const waiting = pending.get(op.ticket);
      if (!waiting || !waiting.stream || waiting.generation !== generation ||
          !waiting.stream.error || waiting.stream.buffered !== 0)
        throw new TypeError("stream terminal error must follow all buffered items");
      if (op.reason !== waiting.stream.error)
        throw new TypeError("mismatched stream terminal error");
      pending.delete(op.ticket); // Terminal Err never mints a successor state proof.
      terminalFailures += 1;
    } else if (op.kind === "stream_finish") {
      identifier(op.ticket, "ticket"); identifier(op.next_handle, "next_handle");
      const waiting = pending.get(op.ticket);
      if (!waiting || !waiting.stream || waiting.generation !== generation)
        throw new TypeError("missing, duplicate or stale stream");
      if (waiting.phase !== "committed" || waiting.committedRevision !== actorRevision ||
          waiting.committedState !== actorState)
        throw new TypeError("stream cannot mint state authority before committed transition");
      if (waiting.stream.error)
        throw new TypeError("failed stream cannot mint successful successor");
      if (!waiting.stream.closed || waiting.stream.buffered !== 0)
        throw new TypeError("stream not finished: EOF and all buffered items required");
      if (seenHandles.has(op.next_handle) || seenTickets.has(op.next_handle) || pending.has(op.next_handle))
        throw new TypeError("duplicate handle identity");
      pending.delete(op.ticket);
      handles.set(op.next_handle, Object.freeze({states:waiting.next.next_states, generation}));
      seenHandles.add(op.next_handle);
    } else if (op.kind === "fail_call") {
      identifier(op.ticket, "ticket");
      if (!["AdmissionRejected","Timeout","Cancelled","Crash","ProtocolViolation"].includes(op.reason))
        throw new TypeError("failure must carry an explicit terminal reason");
      const waiting = pending.get(op.ticket);
      if (!waiting) throw new TypeError("missing or settled pending call");
      if (op.reason === "AdmissionRejected" && waiting.phase !== "prepared")
        throw new TypeError("admission rejection is impossible after mailbox admission");
      pending.delete(op.ticket); // Ambiguous delivery never returns the consumed handle.
      terminalFailures += 1;
    } else if (["fence_restart", "fence_upgrade", "fence_stop"].includes(op.kind)) {
      // Every revoked pending call receives an explicit terminal failure.
      // Restart, code-generation replacement and stop never mint fresh authority.
      terminalFailures += pending.size;
      generation += 1;
      actorRevision += 1;
      actorState = null; // Restart may restore durable state: never assume the initial typestate.
      handles.clear(); pending.clear(); fenced = true;
    } else if (op.kind === "complete") {
      identifier(op.handle, "handle");
      const owned = handles.get(op.handle);
      if (!owned || owned.generation !== generation) throw new TypeError("cannot complete without a live linear handle");
      if (pending.size || handles.size !== 1 || !p.terminal_states.includes(actorState) ||
          owned.states.some(s=>!p.terminal_states.includes(s)))
        throw new TypeError("protocol incomplete: not terminal, pending reply or other live handle");
      handles.delete(op.handle); completed = true;
    } else {
      throw new TypeError("unsupported protocol operation: " + String(op.kind));
    }
  }
  if (options.requireComplete !== false && !completed) throw new TypeError("protocol incomplete: no completed terminal proof");
  return Object.freeze({completed, fenced, generation, live_handles:handles.size, pending_calls:pending.size, terminal_failures:terminalFailures});
}
