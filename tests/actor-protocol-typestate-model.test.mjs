import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {validateProtocol, checkSend, checkTrace} from "../scripts/actor-protocol-typestate-model.mjs";

const fixture = JSON.parse(readFileSync(new URL("./actor-protocol-typestate-v1.json", import.meta.url), "utf8"));
const protocol = fixture.protocol;
const clone = obj => JSON.parse(JSON.stringify(obj));

test("reference-only evidence never claims guest compiler parity", () => {
  assert.equal(fixture.schema, "attolang.actor-protocol-typestate.v1");
  assert.match(fixture.evidence, /NOT_GUEST_EXECUTION/);
  assert.deepEqual(Object.keys(fixture.expected_backend_status).sort(),
    ["cranelift","forge","hdl","java","js","llvm","net","rs","wasm"]);
  assert.ok(Object.values(fixture.expected_backend_status).every(s => s === "NOT_VERIFIED"));
  assert.ok(fixture.required_guest_cases.length >= 18);
});

test("the protocol is one actor, not a new actor kind", () => {
  const checked = validateProtocol(protocol);
  assert.equal(checked.actor_kind, "actor");
  assert.deepEqual(checked.states, ["Disconnected", "Connected", "Closed"]);
  assert.deepEqual(checked.terminal_states, ["Closed"]);
  assert.ok(Object.isFrozen(checked.transitions));
  const changed = clone(protocol); changed.actor_kind = "state_machine_actor";
  assert.throws(() => validateProtocol(changed), /existing actor kind/);
});

test("legal sends have statically known replies and next states", () => {
  for (const valid of fixture.allowed) {
    assert.deepEqual(checkSend(protocol, valid.state, valid.message),
      {reply:valid.reply, next_states:valid.next_states});
  }
});

test("reject sends illegal in any possible state, including terminal", () => {
  for (const invalid of fixture.rejected) {
    assert.throws(() => checkSend(protocol, invalid.state, invalid.message), /illegal/);
  }
  assert.throws(() => checkSend(protocol, [], "Query"), /state proof unavailable/);
  assert.throws(() => checkSend(protocol, "Unknown", "Query"), /unknown actor protocol state/);
});

test("union state cannot invent a shared reply type", () => {
  const changed = clone(protocol);
  changed.transitions.find(x => x.from === "Disconnected" && x.message === "Close").reply = "DifferentAck";
  assert.throws(() => checkSend(changed, ["Disconnected","Connected"], "Close"), /ambiguous reply/);
});

test("a complete connection / query / close trace is accepted", () => {
  assert.deepEqual(checkTrace(protocol, fixture.complete_trace), {
    completed:true, fenced:false, generation:1, live_handles:0, pending_calls:0, terminal_failures:0
  });
});

test("a call consumes its linear handle: reuse or double send is invalid", () => {
  const steps = [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"},
    {kind:"begin_call",handle:"h0",ticket:"t2",message:"Close"}
  ];
  assert.throws(() => checkTrace(protocol, steps), /consumed/);
});

test("required reply must match, and cannot be observed twice", () => {
  const first = fixture.complete_trace.slice(0,4);
  assert.throws(() => checkTrace(protocol, [
    ...first.slice(0,-1), {...first.at(-1), reply:"WrongAck"}
  ]), /required reply/);
  assert.throws(() => checkTrace(protocol, [...first, first.at(-1)]), /missing, duplicate or stale/);
});

test("no terminal completion before final state and no dropped pending reply", () => {
  assert.throws(() => checkTrace(protocol, [{kind:"complete",handle:"h0"}]), /protocol incomplete/);
  assert.throws(() => checkTrace(protocol, [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"},
    {kind:"complete",handle:"h0"}
  ]), /live linear handle/);
  assert.throws(() => checkTrace(protocol, fixture.complete_trace.slice(0,-1)), /no completed terminal proof/);
});

test("an uncertain timeout never reintroduces a consumed handle", () => {
  const failed = [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"},
    {kind:"fail_call",ticket:"t1",reason:"Timeout"}
  ];
  assert.deepEqual(checkTrace(protocol, failed, {requireComplete:false}), {
    completed:false, fenced:false, generation:1, live_handles:0, pending_calls:0, terminal_failures:1
  });
  assert.throws(() => checkTrace(protocol, [...failed, {kind:"complete",handle:"h0"}]), /live linear handle/);
  assert.throws(() => checkTrace(protocol, [...failed, {kind:"fail_call",ticket:"t1",reason:"Timeout"}]), /missing or settled/);
});

test("restart invalidates every old-generation handle and pending call", () => {
  assert.throws(() => checkTrace(protocol, [
    {kind:"fence_restart"}, {kind:"complete",handle:"h0"}
  ]), /live linear handle/);
  assert.throws(() => checkTrace(protocol, [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"},
    {kind:"fence_restart"},
    {kind:"resolve_reply",ticket:"t1",reply:"ConnectedAck",next_handle:"h1"}
  ]), /missing, duplicate or stale/);
});

test("invalid failures and unsupported operations never invent successful transitions", () => {
  assert.throws(() => checkTrace(protocol, [{kind:"sneaky_cast",message:"Query"}]), /unsupported protocol operation/);
  assert.throws(() => checkTrace(protocol, [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Close"},
    {kind:"fail_call",ticket:"t1",reason:"MadeUp"}
  ]), /terminal reason/);
  assert.throws(() => checkTrace(protocol, [...fixture.complete_trace, {kind:"fence_restart"}]), /after protocol completion/);
});

const invalidSchemas = [
  ["duplicate state", p => {p.states.push("Connected");}, /duplicate states/],
  ["unreachable state", p => {p.states.push("Unused");}, /unreachable/],
  ["undeclared target", p => {p.transitions[0].to = "Missing";}, /unknown state/],
  ["ambiguous rule", p => {p.transitions.push({...p.transitions[0]});}, /nondeterministic/],
  ["terminal accepts a call", p => {p.transitions.push({from:"Closed",to:"Closed",message:"Query",reply:"QueryReply",kind:"call"});}, /terminal states/],
  ["missing call reply", p => {delete p.transitions[0].reply;}, /identifier/],
  ["untyped cast", p => {p.transitions[0].kind="cast";}, /requires a call/],
  ["no path to terminal", p => {p.transitions = p.transitions.filter(x => x.message !== "Close"); p.states = ["Disconnected","Connected"]; p.terminal_states = ["Connected"];}, /terminal states|initial state|path to protocol completion/],
  ["initial is terminal", p => {p.initial="Closed";}, /must not be terminal/],
  ["duplicate terminal state", p => {p.terminal_states.push("Closed");}, /duplicate terminal_states/],
  ["invalid state identifier", p => {p.states[0]="__oops!";}, /identifier/],
  ["empty transitions", p => {p.transitions=[];}, /transition count/]
];
for (const [name, mutate, diagnostic] of invalidSchemas) {
  test("reject invalid protocol: " + name, () => {
    const changed = clone(protocol); mutate(changed);
    assert.throws(() => validateProtocol(changed), diagnostic);
  });
}

test("no protocol is proven complete merely because terminal is reachable", () => {
  assert.deepEqual(checkSend(protocol, "Connected", "Query").next_states, ["Connected"]);
  assert.throws(() => checkTrace(protocol, [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"},
    {kind:"resolve_reply",ticket:"t1",reply:"ConnectedAck",next_handle:"h1"}
  ]), /no completed terminal proof/);
});

test("previously settled tickets and handles cannot be recycled or replayed", () => {
  const first = fixture.complete_trace.slice(0,4);
  assert.throws(() => checkTrace(protocol, [
    ...first,
    {kind:"begin_call",handle:"h1",ticket:"t1",message:"Query"}
  ]), /duplicate ticket/);
  assert.throws(() => checkTrace(protocol, [
    ...first.slice(0,-1), {...first.at(-1), next_handle:"h0"}
  ]), /duplicate handle identity/);
  assert.throws(() => checkTrace(protocol, [
    ...first,
    {kind:"begin_call",handle:"h1",ticket:"t2",message:"Close"},
    {kind:"resolve_reply",ticket:"t2",reply:"ClosedAck",next_handle:"h1"}
  ]), /duplicate handle identity/);
});

test("restart reports terminal failures for every pending call rather than silently discarding it", () => {
  assert.deepEqual(checkTrace(protocol, [
    {kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"},
    {kind:"fence_restart"}
  ], {requireComplete:false}), {
    completed:false, fenced:true, generation:2, live_handles:0, pending_calls:0, terminal_failures:1
  });
});

test("ticket identifiers and handle identifiers share an unforgeable linear namespace", () => {
  const first = fixture.complete_trace.slice(0,4);
  assert.throws(() => checkTrace(protocol, [
    ...first, {kind:"begin_call",handle:"h1",ticket:"h0",message:"Query"}
  ]), /duplicate ticket/);
  assert.throws(() => checkTrace(protocol, [
    ...first.slice(0,-1), {...first.at(-1),next_handle:"t1"}
  ]), /duplicate handle identity/);
});

const prepared = [{kind:"begin_call",handle:"h0",ticket:"t1",message:"Connect"}];
const admitted = [...prepared, {kind:"admit_call",ticket:"t1"}];
const committed = [...admitted, {kind:"commit_transition",ticket:"t1",from:"Disconnected",to:"Connected"}];

test("matching reply alone does not prove admission or state commit", () => {
  const reply = {kind:"resolve_reply",ticket:"t1",reply:"ConnectedAck",next_handle:"h1"};
  assert.throws(() => checkTrace(protocol, [...prepared, reply]), /before an authenticated transition commit/);
  assert.throws(() => checkTrace(protocol, [...admitted, reply]), /before an authenticated transition commit/);
  assert.deepEqual(checkTrace(protocol, [...committed,reply], {requireComplete:false}), {
    completed:false, fenced:false, generation:1, live_handles:1, pending_calls:0, terminal_failures:0
  });
});

test("unadmitted or forged transitions cannot commit", () => {
  assert.throws(() => checkTrace(protocol, [
    ...prepared, {kind:"commit_transition",ticket:"t1",from:"Disconnected",to:"Connected"}
  ]), /requires one admitted/);
  assert.throws(() => checkTrace(protocol, [
    ...admitted, {kind:"commit_transition",ticket:"t1",from:"Connected",to:"Connected"}
  ]), /does not match actor-side/);
  assert.throws(() => checkTrace(protocol, [
    ...admitted, {kind:"commit_transition",ticket:"t1",from:"Disconnected",to:"Closed"}
  ]), /declared successor/);
  assert.throws(() => checkTrace(protocol, [...committed, committed.at(-1)]), /requires one admitted/);
});

test("admission is single-shot and admission rejection strictly pre-publication", () => {
  assert.throws(() => checkTrace(protocol, [...admitted, admitted.at(-1)]), /requires one prepared/);
  assert.throws(() => checkTrace(protocol, [
    ...admitted, {kind:"fail_call",ticket:"t1",reason:"AdmissionRejected"}
  ]), /impossible after mailbox admission/);
  assert.equal(checkTrace(protocol, [
    ...prepared, {kind:"fail_call",ticket:"t1",reason:"AdmissionRejected"}
  ], {requireComplete:false}).terminal_failures, 1);
});

test("commit then timeout does not mint a successor and late replies are rejected", () => {
  const failed = [...committed, {kind:"fail_call",ticket:"t1",reason:"Timeout"}];
  assert.deepEqual(checkTrace(protocol, failed, {requireComplete:false}), {
    completed:false, fenced:false, generation:1, live_handles:0, pending_calls:0, terminal_failures:1
  });
  assert.throws(() => checkTrace(protocol, [...failed,
    {kind:"resolve_reply",ticket:"t1",reply:"ConnectedAck",next_handle:"h1"}
  ]), /missing, duplicate or stale/);
  assert.throws(() => checkTrace(protocol, [...failed,
    {kind:"begin_call",handle:"h0",ticket:"t2",message:"Close"}
  ]), /consumed, absent or stale/);
});

test("restart between commit and reply revokes all protocol proofs", () => {
  assert.deepEqual(checkTrace(protocol, [...committed,{kind:"fence_restart"}],
    {requireComplete:false}), {
    completed:false, fenced:true, generation:2, live_handles:0, pending_calls:0, terminal_failures:1
  });
  assert.throws(() => checkTrace(protocol, [
    ...committed, {kind:"fence_restart"},
    {kind:"resolve_reply",ticket:"t1",reply:"ConnectedAck",next_handle:"h1"}
  ]), /missing, duplicate or stale/);
});
