# Typed continuous endpoint connections with `pipe` (v1 draft)

Status: **design and reference-model conformance only**. This supersedes the
earlier candidate that used `source >> sink` or `sink << source` for
continuous pumping. Those shorthand forms are **not** continuous pipes.

## Canonical syntax and roles

```atto
// Continuous data transport, not a single read/write:
stdio.in pipe stdio.out;
input_channel pipe output_stream;
spawn Producer() pipe output_channel;
input_channel pipe spawn Consumer();

// Single operations, deliberately distinct from a continuous connection:
stdio.in >> val outcome;
val outcome << stdio.in;
stdio.out << "one message";

// These MUST NOT be reinterpreted as continuous pipes:
stdio.in >> stdio.out;
stdio.out << stdio.in;
```

The keyword `pipe` constructs one directed connection: **left producer →
right consumer**. There is no reverse `pipe` spelling. If both endpoints
are statically `Readable<T>` and `Writable<T>`, respectively, the checked
operation is `PipeConnect(source, sink)`, with a bounded data pump.
If one end is an actor, the compiler must instead use a typed actor
message emission/acceptance adapter with actor/supervisor lifecycle rules.
It must not guess from identifiers or treat a bare actor reference as a
byte stream. An actor can participate via its declared typed send/receive
contracts, not by pretending every actor is a `Readable<T>`.

The `pipe` keyword may already connect actor-to-actor stages. This proposal
extends its typed endpoint registry to compatible stream/channel endpoints;
it does not invent a competing operator. No overloading of functional `|>`
or `<|`; `await` remains an operation, not a callable stage.

## Grammar and checked admission

```ebnf
pipe_statement = pipe_endpoint, ("pipe", pipe_endpoint)+, terminator ;
pipe_endpoint  = primary | spawn_expr ;
```

This is the *intended language-level grammar*, not yet supported by all
compiler backends. Each endpoint expression is evaluated once, in textual
left-to-right order; a parser-only browser frontend must reject the entire
connection with `E_UNSUPPORTED` until capability checking and the runtime
exist. Recognizing the syntax is not permission to emit a guest module.

The left endpoint must expose a typed outbound stream of messages `T`,
and the right endpoint must accept messages of a compatible `T`. Streams
and channels use nominal `Readable<T>` / `Writable<T>` contracts.
Actors require proven `sends` / `receives` message contracts (including
message encoding/ownership/isolation) or declared adapters. Do not use
duck-typing, name heuristics or runtime coercion. Distinguish transport
`Serializable` from local actor `Sendable`. Non-matching directions,
ambiguous overloads, and ownership-losing adapters are compile errors.

The first executable slice permits **one pair only**. Longer actor/mixed
chains must build a typed graph with deterministic initialization/rollback;
do not silently create multiple pumps from chained syntax. Reject continuous
`pipe` as a `when` or `select` atomic guard, since it spans multiple
operations. A selected arm may start a pipe after the arm wins. Reject
`nb`, `try`, and detached `do` continuous connections until their
Task/Future/result/cancellation contracts are implemented.

## One-shot I/O remains separate

| Source | Meaning |
|---|---|
| `source >> val outcome` | exactly one checked read |
| `val outcome << source` | the same one-read operation |
| `sink << value` | exactly one checked write |
| `source pipe sink` | continuous ordered connection until EOF, failure, or cancel |
| `source >> sink` | **invalid** as a continuous pump, never an existing-local assignment |
| `sink << source` | a single write only when `source: T` is truly a value, **never** an implicit stream pump |
| `value |> function` | functional application, unrelated to I/O transport |

A compiler must reject `stdio.out << stdio.in` as a write unless
`stdio.in` is independently a valid **single message value** for that
sink (it is not). In particular, the old browser `stdio.print` shortcut
must not accidentally stringify an endpoint. Numeric shift operators and
nested generic closers remain contextually separate; do not steal
`x >> 3` or `Future<Result<...>>` as I/O.

## Operational contract

The direct source-to-sink continuous pipe is one checked, potentially
suspending operation of unbounded duration but **bounded in-flight memory**.
A normative conceptual state machine is:

```text
evaluate source once; evaluate sink once; admit typed capabilities
while not cancelled:
    await source.read() -> Result<Option<T>, ReadError>
    Err(e)   => terminal checked read failure
    None     => successful EOF; leave both borrowed endpoints open
    Some(v)  => hold owned v; await sink.write(v)
        Err(e) => terminal checked write failure, including v if uncommitted
        Ok(_)  => record one admitted value; continue
```

- Preserve FIFO order, entire message boundaries, explicit EOF and all errors.
  EOF is **not** a value to write. Input EOF never closes process stdout.
  No endpoint is implicitly closed unless the caller transferred ownership
  and the connection lifecycle explicitly requires closure.
- At most one read element and one pending write by default. On blocked
  writes, do **not** consume the next source item, busy-spin, duplicate
  delivery, or lose the pending owned payload.
- A successful write means **sink admission**, not remote delivery or
  durability. `stdio.out` may buffer, and `flush()` is a separate
  potentially suspending operation.
- The operation has the union of source/sink I/O, actor, and suspension
  effects; it is not legal in pure or unsuspending code.
- The checked outcome must preserve the number of admitted elements,
  the terminal failure kind (read/write/closed/quota/cancelled), and ownership
  of any uncommitted element. Model it as `Result<PipeReceipt, PipeError<T>>`
  or a library-equivalent typed contract; the exact type names remain to
  be standardized. No implicit `?`, drop, or fire-and-forget on an
  unhandled result.
- On cancellation or close-versus-commit races, a single linearization
  point decides whether the item committed or remains owned. Repeated
  completion and stale wakeups are forbidden. No automatically detached
  unowned tasks.

A channel-to-channel connection is message piping. Raw-byte stream piping
requires explicit compatible byte views; strings are never implicitly
converted to raw bytes. An actor endpoint must not intercept supervisor
CONTROL messages as ordinary pipe payloads.

## Executable acceptance gates

1. Test correct typing for stream→stream, channel→stream, actor→channel,
   channel→actor, and actor→actor, plus impossible/ambiguous pairings.
2. Test empty input, one element, repeated elements, Unicode and NUL payloads.
   Prove FIFO, exactly-once sink admission, EOF without closing stdout,
   and absence of speculative read-ahead under backpressure.
3. Test read/write errors, closed sink, quota exhaustion, cancellation,
   multiple subscribers, and cleanup of owned pending payloads. Include
   close-vs-commit and cancel-vs-commit schedule races.
4. Reject using `>>` or `<<` for continuous connections, malformed
   `pipe` chains, `pipe` in select guards, and unsupported `nb/try/do`
   modes. Enforce effect and borrow/state-access boundaries.
5. Run a **compiled AttoLang guest** exercising a real typed Channel<T>
   and Future/await before stdin or actor adapters. Then test a browser
   Worker with explicitly injected input and a real versioned guest ABI,
   plus the remaining native/compiler backends.
6. Record exact source commit/tree SHA, runner steps, executable output and
   failure diagnostics on every supported backend. A pure Rust/JS pump
   reference model is valuable but **not** guest runtime proof.

## Current implementation boundary

The browser Rust compiler currently has executable `stdio.out << value`
for a restricted scalar path, but **no guest stdin, stream, or actor-pipe
runtime**. The companion draft
[atto-source.rs #207](https://github.com/atto-lang/atto-source.rs/pull/207)
must recognize the `pipe` candidate and fail closed until the checked
runtime exists. Earlier pure JS and Rust reference models may be reused
for operational conformance; they do not establish executable guest I/O.
See [atto-source.rs #197](https://github.com/atto-lang/atto-source.rs/pull/197)
for the separate identity-await Future pipeline slice.
