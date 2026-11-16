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
