# Checked pipeline observers and io.pipe (v1 candidate)

**Status: language contract only.** There is no claim of implemented continuous
transport, runtime observers, or cross-backend guest parity. This supplements
[directed-rpipe-and-stream-capture-v1.md](directed-rpipe-and-stream-capture-v1.md)
and [pipeline-failure-effects-v1.md](pipeline-failure-effects-v1.md).

## One direction and one owned result

~~~atto
val forward = (readable pipe transform pipe writable)?;
val reverse = (writable rpipe transform rpipe readable)?;
val direct = io.pipe(readable, writable)?;
~~~

Forward and reverse connect identical directed dataflow. io.pipe(source,sink)
is exactly source pipe sink with two stages; it evaluates each argument
once, left to right, and never guesses direction or silently swaps them.
A transform requires an explicit continuous graph, not a hidden io.pipe
varargs overload. An invalid PipeSource<T> / PipeSink<T> pair fails closed.

All three forms have the checked **Result<PipeHandle,PipeSetupError>**
construction contract and eventual **Result<PipeStats,PipeError>**
completion from await handle.get_done(). A pipeline expression is not
Stream<T>, and a runtime graph cannot initialize a compile-time const.
Use val or let to bind the owned handle. Stream.port<T> and inline
Stream<T> endpoint capture have separate, explicitly owned contracts.

## Passive typed lifecycle subscriptions

~~~atto
val connection = (readable pipe transform pipe writable)?;
connection.on(#error, |err: PipeError| -> { log_error(err); });
connection.on(#complete, |stats: PipeStats| -> { log_stats(stats); });
val stats: PipeStats = (await connection.get_done())?;
~~~

The proposed PipeHandle.on(event, callback) supports:

| Event | Typed argument | Meaning |
| --- | --- | --- |
| #error | PipeError | First non-cancellation terminal failure |
| #complete | PipeStats | Clean EOF followed by committed-data drain |
| #cancel | PipeError.Cancelled | Explicit cancellation or owner drop |
| #settled | PipeOutcome | Any terminal outcome, after its specific event |

A callback may take zero arguments when the payload is intentionally
unused. on() registers a graph-owned subscription and returns an optional
PipeSubscription token for explicit unsubscribe. Merely discarding
the returned token must not accidentally unsubscribe it. A callback is
an **observer, not catch/recover**: return values and exceptions never
change PipeHandle.get_done(), resume failed stages, retry messages, or
suppress a supervisor CONTROL notice.

Registration MUST be linearizable against terminal settlement. If
a stage fails before .on(#error,...) is called, the terminal snapshot is
replayed asynchronously exactly once per later subscription, including
ones added after get_done() settles. Never synchronously call user code
while registering an observer or under scheduler/pipe/mutex locks.
Unsubscribe prevents queued delivery. Callback failure is isolated and
reported in the callback's own error/supervisor context; remaining
observers run and the original PipeError is retained. Event delivery
does not have to finish before get_done resolves.

## Inline terminal observer (NOT a DATA stage)

~~~atto
readable pipe transform pipe writable
    pipe observer(#error, |err: PipeError| -> { log_error(err); });

writable rpipe transform rpipe readable
    rpipe observer(#error, |err: PipeError| -> { log_error(err); });
~~~

The compiler treats a trailing PipeObserver as an out-of-band graph
decoration: zero DATA edges, zero DATA elements consumed, no fake
PipeSource on the final writable. It must be the LAST written stage
after at least two actual endpoints in the SAME pipe or rpipe direction.
An ordinary function or writable endpoint cannot masquerade as an
observer. Nonterminal observers, wrong callback arity/effects, an
unknown #event, mixed pipe/rpipe and missing type capabilities fail
before graph activation. For rpipe, the trailing observer still
decorates the whole graph; it does not reverse the edge graph.

~~~atto
readable pipe transform pipe writable pipe observer(|| -> {
    log("pipeline has settled");
});
~~~

The zero-argument observer(|| -> {...}) means
observer(#settled, || -> {...}). It is not a default #error catch and
does not discharge the checked setup or completion result. Inline
observers are installed BEFORE activation, eliminating early-stage
subscription races. If setup fails, the Result.Err(PipeSetupError)
is mandatory; no PipeHandle exists, and inline observers are rolled
back without a misleading lifecycle #error notification.

## Correct io.pipe error and resource semantics

io.pipe(foo,bar) creates the same bounded, supervised, owned, structured
two-endpoint graph as (foo pipe bar). It never returns void/bool or
launches a detached hidden pump. Check direction, item type, ownership,
Sendable, effects, capacity, and lifetime before publishing an edge.
Admission failure rolls back all allocations, without closing external
stdio, borrowed endpoints, shared channels or unrelated actors.
No repeated read/write polling in source syntax and no unbounded eager
buffer are introduced. Capacity zero means rendezvous; finite
capacity must enforce cooperative backpressure and wake blocked reads
and writes on EOF, cancellation, and error. Stage construction order
is lexical even for rpipe, while runtime flow remains source to sink.

The first terminal error wins atomically, retaining stage index,
origin/generation, causal Error and committed counts. Secondary close/
rollback failures are diagnostics, not replacement terminal errors.
Never duplicate committed items, silently retry a partial write, treat
failure as normal EOF, or close externally owned descriptors.
A stage throwing/raising/panicking follows the existing error/effect
policy. An actor panic still reaches authenticated supervisor priority
CONTROL; an observer is never a CONTROL handler. Cancellation emits
#cancel and get_done Err(Cancelled), NOT #error or #complete.
Result.Err and Option.None in a stream item are DATA when declared
by the item type; they are not stream lifecycle errors or EOF.
A caller-side trap around setup cannot catch later async stage errors.

## Conformance and release gates

Required: real compiler parsing and typed diagnostics; forward/reverse/
io.pipe equivalence; once-only endpoint construction; setup rollback;
early/late observer races; unsubscribe; event ordering; callback failures;
partial writes and first-error wins; 0/1/N capacity and cancellation
wakeups; EOF drain; no borrowed endpoint close; DATA Err/None versus
terminal error; and independent supervisor panic notice. Capture exact
source and tree SHAs, nonempty executed runner steps, native guest,
Wasm guest, browser and other backend receipts separately.

The Node host-only oracle in tests/pipe-observer-reference.test.mjs
verifies candidate lifecycle rules only. It is NOT an Atto compiler,
runtime, or guest-test receipt. Unsupported syntax/runtime behavior
MUST fail closed until executable backends are proven.


## io name resolution and actor-local permissions

A separate Java/Graal draft reserves implicit actor-local
io.in / io.out / io.err / io.events / io.meta. That actor-local io is
NOT an alias of process/root stdio or the general io module.
Consequently io.pipe MUST resolve through the normal visible
namespace/capability checker: for root code, a deliberately imported
library io module (and appropriate platform profile); inside actors,
either an explicitly supported actor-local pipe capability or an
unambiguous fully qualified library name with explicit permissions.
A shadowed/unresolved io, actor-local io with no pipe member, or a
conflicting imported io alias is a compile-time error, not a fallback
to process stdout/stdin, a dynamic lookup, or unchecked host reflection.
Do not silently treat io.pipe as an actor send or supervisor CONTROL
operation. Binding the graph transfers only explicitly admitted endpoint
capabilities; it does not grant new process-wide file/network access.
The core traits may remain no-OS, while actual scheduler-backed pumping
and platform I/O adapters must respect the selected runtime/profile.
Until these APIs exist on a backend, fail closed.
