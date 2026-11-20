# Directed continuous pipelines: `pipe`, `rpipe` and owned Stream binding (v1 candidate)

**Status:** candidate language contract; companion to
[mixed-endpoint-pipe-v1.md](mixed-endpoint-pipe-v1.md).
No claim of executable `rpipe`, in-pipeline `Stream<T>` declarations,
guest channel transport or backend parity. Current mixed-pipe Rust/Wasm
work remains draft and fail-closed pending its transport ABI.

## Direction is lexical and unambiguous

| Spelling | Required directed edge |
| --- | --- |
| `A pipe B` | `A → B` |
| `A rpipe B` | `B → A` |
| `a |> f` / `f <| a` | one functional application `f(a)` |
| `sink << value` | exactly one write |
| `source >> val item` / `val item << source` | exactly one read (or the narrowly typed terminal value capture already specified) |

The **`pipe` keyword ALWAYS flows left-to-right**.
The **`rpipe` keyword ALWAYS flows right-to-left**.
They are distinct reserved keywords, not overloadable operators, not
syntactic inference of direction from duplex types, and not aliases for
`>>`, `<<`, `|>` or `<|`.

These two complete chains describe the same **dataflow graph**:

```atto
readable pipe transform pipe writable;
writable rpipe transform rpipe readable;
```

Both mean `readable → transform → writable`, **not**
`writable → transform → readable`. The first stage of an `rpipe`
chain is the final sink; its final stage is the source. The direction of
transformation is unchanged. A transform may emit zero, one or many
outputs for each input; `rpipe` does not imply reversal of values,
buffers, sequences, or actor supervisor links.

An actor variant also has the same direction:

```atto
spawn Producer() pipe spawn Processor() pipe spawn Consumer();
spawn Consumer() rpipe spawn Processor() rpipe spawn Producer();
```

Actor roles still come from `receives` and `emits`, never arbitrary
`sends` or CONTROL messages.

## Canonical compiler-IR direction normalization

A compiler MUST preserve endpoint expressions in the written lexical order
and may compute source-to-sink edges using immutable lexical indices. Stage
evaluation order and DATA direction are deliberately separate properties:

| Source | Written indices | Directed DATA edges |
| --- | --- | --- |
| `producer pipe transform pipe consumer` | `[0,1,2]` | `(0,1),(1,2)` |
| `consumer rpipe transform rpipe producer` | `[0,1,2]` | `(2,1),(1,0)` |

Endpoint constructors must run **exactly once in lexical order**. An
implementation must not reverse constructor evaluation or execute a stage
again while reversing the DATA edges. The normalizer must reject an invalid
stage count before allocating runtime resources; a backend's smaller profile
limit, such as the current browser subset's 16 stages, must be declared
rather than silently truncating the graph. No stage may be created
implicitly by type inference.

The compiler's typed edge proof is **not** a runtime connection. It cannot
grant an ActorRef, sendable/tenant capability, sink ownership, mail queue,
or supervisor CONTROL path. Graph activation remains checked and atomic
under the separately specified `PipeHandle` lifetime and port contracts.
See [atto-source.rs #224](https://github.com/atto-lang/atto-source.rs/pull/224)
for the Rust source-only `DirectedPipeTopology` candidate; its presence is
not evidence that the guest transport is executable.

## Named actor references and duplicate directional edges

A previously spawned, typed actor reference may be used as a stage. `spawn`
is not required inside the graph expression. The compiler checks the
**declared** actor `emits` and `receives` contracts, regardless of whether
the stage is a fresh `spawn Foo()` or an existing `ActorRef<Foo>`.

The following is **target-language syntax, not verified guest execution**:

```atto
define actor Producer receives int emits int as
    susp receive(ActorMail<int> mail): void {
        emit(mail.value);
    }
end

define actor Consumer receives int as
    susp receive(ActorMail<int> mail): void { }
end

pub susp fnc main(): int {
    val producer = spawn Producer();
    val consumer = spawn Consumer();
    val link = producer pipe consumer;
    // Equivalent topology when used INSTEAD of the previous declaration:
    // val link = consumer rpipe producer;
    // The eventual checked PipeHandle must be owned and supervised.
    return 0;
}
```

`Producer receives int` **without `emits int`** is *not* a pipe
source, even if the handler handles `ActorMail<int>`. `send` and `sends`
are likewise not `emit` and `emits`. Neither spawning nor attaching a
pipe injects an initial message or guarantees the producer will emit.

```atto
producer pipe consumer;
consumer rpipe producer;
```

These are **two separate graph-construction expressions with the same
`producer → consumer` direction**. The second line is not a return
connection, an ACK path, or a duplex pipe. Both must undergo independent
checked admission; implementations must not silently merge them,
create an implicit broadcast, double-deliver, or discard unchecked
`Result<PipeHandle, PipeSetupError>` outcomes. If the runtime's unicast
ownership policy disallows a second attachment, reject it atomically
with a typed duplicate-edge/occupied-port error, leaving the first
graph intact. If an explicit adapter permits multiple attachments,
create and retain distinct handles and obey its fan-out policy.
No reverse CONTROL flow can be inferred from `rpipe`.

For genuine two-way application DATA, declare matching `emits` and
`receives` capabilities on **both** actors, or use a separate typed
request/reply API, then explicitly connect the reverse edge. Bidirectional
capability must never be inferred from the spelling of a single operator.
An owned connection must remain live for the intended task lifetime;
ending `main()` immediately is not a proof of message delivery or graceful
pipeline completion. A portable implementation needs checked setup,
completion via `get_done()`, cancellation and quiescence.

## Directed type checking

The compiler constructs **one graph** with edges directed by the keyword,
and checks each edge for explicit `PipeSource<T>` and `PipeSink<T>`
roles, nominal type agreement, ownership, effects, and cross-domain
`Sendable` constraints. An interior transform has a matching sink
input and source output, potentially with distinct `In` and `Out` types.
The graph is unicast unless an explicit tee/broadcast adapter is present.

For `A rpipe B`, the **right** expression `B` must provide a source;
the **left** expression `A` must provide the corresponding sink.
Direction cannot be inferred from an overload, the runtime value, or
the shape of an untyped object. A duplex `Channel<T>` is legal when the
direction is already established by the keyword. No automatic
conversion, Future flattening, or extra read/write is introduced.

An unparenthesized mix such as `A pipe B rpipe C` is rejected as
`E_PIPE_DIRECTION`. Grouping does not automatically merge two owned
graphs; explicit branching/joining must be used if two directions
actually meet. Adjacent `rpipe` tokens are a single declarative graph,
**not** multiple separately executed/discarded handles.

## Create and capture a live bounded Stream<T> inside the graph

Allow a contextual **inline endpoint binding stage** only in a
continuous `pipe` / `rpipe` graph:

```atto
// Forward: source → transform → results' buffered input
readable
    pipe transform
    pipe (let results: Stream<Output> = Stream.buffered<Output>(64));

// Reverse spelling, identical graph:
(let results: Stream<Output> = Stream.buffered<Output>(64))
    rpipe transform
    rpipe readable;
```

The parenthesized `let` stage is **not** a regular expression-level
assignment or a single `<<` write. It is a new grammar production:
1. Allocate exactly one **bounded** stream port/adapter, initially unconnected.
2. Use its **writable sink port** as the terminal pipe endpoint.
3. Bind `results: Stream<Output>` to its **readable view** exactly once.
4. Retain the new `PipeHandle` in an owned/structured lifetime associated
   with the stream binding. Do not return a dangling view or spawn detached
   forwarding work. The observable completion/error outcome must remain
   accessible through the structured connection contract.
5. Admit/start the graph atomically only after role/type/ownership and setup
   succeed. On failure, roll back the binder and connections and clean up
   allocated resources, surfacing a checked setup error.
6. Reaching EOF after finite input drains committed items and closes only
   the graph-owned stream writer. Dropping the owning stream/handle cancels
   its graph; other externally owned sources remain unaffected.

The user-facing binding can be `val` or `let` according to ordinary
local mutability rules. `const` is not valid for a runtime-allocated
stream. `Stream<Output>` itself is a **readable view**, not a
`PipeSink<Output>`. The terminal binding stage supplies the paired
writable port **contextually**; it does NOT make all `Stream<T>` values
implicitly writable or introduce arbitrary duck-typed sink conversion.

The explicit equivalent, if inline binding is unavailable, is:

```atto
val port = Stream.port<Output>(64);
val connection = readable pipe transform pipe port.sink();
val results: Stream<Output> = port.stream();

// The owner must retain connection throughout reading results.
```

And the exact reverse graph can be spelled without inline binding as:

```atto
val port = Stream.port<Output>(64);
val connection = port.sink() rpipe transform rpipe readable;
val results: Stream<Output> = port.stream();

// Keep connection alive while results is in use.
```

These explicit forms are *illustrative target syntax*. They are not
claims of implemented guest buffer allocation, stream ownership, or
structured `PipeHandle` APIs.

## Single-value operations stay single-value

```atto
writable << item;           // one checked write
readable >> val item: int;  // one checked read
val item: int << readable;  // one checked read

val result: int <<
    transform_result <|
    susp |f| -> await f <|
    pending;               // ONE Future resolution and ONE transformed result
```

No `<<` or `>>` in this list ever starts a continuous pump. A
single-value reverse functional capture continues to follow the
separate candidate contract in
[typed-io-continuation-pipelines-v1.md](typed-io-continuation-pipelines-v1.md).
The new `rpipe` only connects continuous source/sink endpoints.

## Checked setup and stage failures

Connection creation is a checked operation. The candidate outcome shape is
`Result<PipeHandle, PipeSetupError>` (or an explicitly declared equivalent
effect), and later completion is
`Result<PipeStats, PipeError>`. Discarding a failed construction or detached
completion is never implicit. The shorthand samples above illustrate
topology; real admitted programs must handle or explicitly propagate their
setup/completion results.

An inline `let results: Stream<T>` captures a readable endpoint only after
the **entire** connection was admitted. The compiler must ensure this
success-only binding does not escape a failed setup branch. On any failure,
the resource must be cleaned up and the binder cannot remain initialized
with a dangling handle.

See [pipeline-failure-effects-v1.md](pipeline-failure-effects-v1.md) for
`throw`, `raise`, `panic`, `trap`, `Result` / `Option`, `?`,
cancellation, EOF, and supervisor CONTROL across both directions. In
particular `trap` catches ordinary throws only; it must never turn a
fatal actor panic or ordinary `Result.Err` into a silent `None`.

## Evaluation and effects

Endpoint expressions are evaluated **exactly once in written lexical
order**; for `rpipe`, this means the sink constructor may be evaluated
before the source constructor. After all endpoints exist, the graph
is **validated and activated once**, without publishing any edges until
setup succeeds. Runtime element transfer always occurs source-to-sink.
Consequently, reversing the written declaration preserves directed
dataflow and transformation order, but should not be used to assume the
same side-effect order for **endpoint constructors**. Programs that rely
on constructor side effects must explicitly sequence them first.

Setup and cancellation obey the existing mixed-endpoint contract:
bounded backpressure, no unbounded eager collection, no implicit
broadcast, exact-once ownership transfer to each admitted sink,
visible EOF/error/cancellation, and CONTROL-path isolation.

## Grammar (candidate)

```ebnf
continuous_pipeline = forward_pipe | reversed_pipe ;
forward_pipe = pipe_stage, { "pipe", pipe_stage } ;
reversed_pipe = pipe_stage, { "rpipe", pipe_stage } ;
pipe_stage = endpoint_expression | stream_capture ;
stream_capture =
  "(", ("val" | "let"), identifier, ":", "Stream", "<", type, ">",
  "=", "Stream", ".", "buffered", "<", type, ">",
  "(", bounded_capacity, ")", ")" ;
```

`rpipe` is exactly one contextual keyword token. The formatter must
retain `pipe` vs `rpipe` rather than silently rewriting the latter
to `pipe`, and must preserve multiline stage order and binding scope.
The stream binding is available only after successful graph admission;
later code in the same enclosing scope may read `results`.

## Required conformance before release

1. Positive AST and compiler tests for `A pipe B` and `B rpipe A`,
   proving **the same directed graph** and same transformed element order.
2. Three-stage actor, Channel, Stream.port, generator and mixed endpoint
   graphs in **both directions**, including different input/output types.
3. In-pipeline `Stream<T>` binding in both directions: exactly one
   buffer allocation, one writer and one readable view, explicit capacity,
   correct lexical scope and type, no duplicate frame/element.
4. Reject sink-only endpoints on the source side, source-only endpoints
   on the sink side, mismatched `T`, unbound or duplicated capture,
   unsafe borrowing, invalid capacity, and mixed operator direction.
5. Preserve the unrelated one-operation `<<`/`>>` and value-only
   `|>`/`<|` behavior, including an explicitly awaited Future.
6. Real compiled guest backpressure (capacities 0, 1, 64), EOF, failure,
   cancel/drop, partial admission and no deadlock on empty or infinite input.
7. Track exact-source SHA, executed test steps, Rust native and Wasm guest,
   browser and other backend receipts separately. A parser-only or
   reference-model success is **not** a running pipe implementation.

## Cross-backend implementation tracking (2026-11-16)

This table describes **source-authored candidates**, not verified
executable feature parity. Do not promote a draft parser or scalar
reference oracle to a claim of a working streaming runtime.

| Backend | Concrete proposed implementation | Status and limitation |
| --- | --- | --- |
| Java/GraalVM | [oreslang-source.java PR #3147](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/3147) | Right-associative scalar `<|` implemented as checked call AST candidate; `rpipe` fails closed until typed stream ownership/error runtime |
| LLVM/native | [oreslang-source.llvm PR #1867](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/pull/1867) | Scalar `<|` native LLVM call lowering candidate, added source→LLVM IR→Clang native-guest tests; continuous `rpipe` remains deliberately unsupported |
| .NET/CIL NativeAOT | [oreslang-source.net PR #554](https://github.com/ores-truffle-oreslang/oreslang-source.net/pull/554) | Reverse `rpipe` accepted in the **typed scalar actor-graph planning oracle only**; shipping NativeAOT compiler rejects it, and scalar `<|` has a precise no-CIL gate |
| Rust/Wasm | [atto-source.rs PR #224](https://github.com/atto-lang/atto-source.rs/pull/224) | Draft directional mixed-pipe AST and bounded inline stream capture preflight; no actual stream guest transport |

The directed graph contract is identical for
`source pipe transform pipe sink` and
`sink rpipe transform rpipe source`, but none of these PRs
establishes *all* needed runtime machinery (bounded owned
`Stream<T>` adapters, `PipeHandle`, cancellation, checked
`Result` completion, ordinary throw, raise/panic supervisor
CONTROL isolation, or `trap` across a suspended task).

Executed conformance gates must separately prove:

- **Scalar application:** source-compiled `|>` and `<|` run
  exactly once, in the same order, and preserve Result/Option,
  effects and ownership; CLR scalar unsupported paths must fail
  *before* CIL.
- **Static continuous graph:** `pipe/rpipe` produce equivalent
  typed edges, respecting declared actor `receives/emits`, and
  produce an error before artifact emission if backend transport
  is unavailable.
- **Real streaming guest:** no result until runtime publishes
  exact-once bounded backpressure, EOF, cancellation, error
  propagation and authenticated supervisor CONTROL.
- **Evidence:** exact source HEAD/tree SHA, nonzero runner steps,
  native/guest exit-code and stderr, sanitizer findings, and
  separate Java/JVM+GraalVM Native Image, LLVM native and
  Linux/Windows .NET NativeAOT receipts. Prior successful CI
  for *other* features or commits does not prove this rollout.
