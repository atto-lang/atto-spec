# Endpoint-to-endpoint I/O piping with `>>` and `<<` (candidate)

Status: **design + reference-model test contract**, not implemented guest channel/stream I/O. Extends [I/O direction shorthand v1](io-direction-shorthand-v1.md) without changing its single-read, single-write, declaration, or select rules. The word `pipe` remains reserved for actor-pipeline syntax; this proposal does **not** repurpose `|>` or `<|`.

## Desired source spellings

```atto
// Identical data-flow direction: readable stdin -> writable stdout.
stdio.in >> stdio.out;
stdio.out << stdio.in;

// One element, NOT an endpoint pump:
stdio.in >> val outcome;
stdio.out << "one message";
val outcome << stdio.in;
```

Both endpoint-to-endpoint forms have exactly the same canonical checked operation:

```text
IoPump(source = stdio.in, sink = stdio.out, mode = Direct)
```

The spelling switches which endpoint is written first, **never** the direction of data. `stdio.out >> stdio.in` and `stdio.in << stdio.out` fail capability checks; a writable-only endpoint is not a data source. Evaluation of each operand occurs once in lexical source order, before the pump starts, without re-evaluating either endpoint on each iteration. A duplex endpoint can serve either role, but roles are fixed by the operator's orientation.

## Capability / overload decision table

| Form | Syntax / static requirements | Lowering |
|---|---|---|
| `readable >> val/let name` | Declaration binder | One checked read |
| `val/let name << readable` | Declaration binder on left | One checked read |
| `writable << value` | `value : T`, `writable: Writable<T>` | One checked write |
| `readable >> writable` | `Readable<T>` and `Writable<T>` | Checked `IoPump` |
| `writable << readable` | `Writable<T>` and `Readable<T>` | The same checked `IoPump` |

The right operand of `>>` without a binder must statically be a writable capability: it is **not** a read into an existing local, assignment, or numeric shift. The right operand of `<<` may be either a value or a readable capability; static resolution must not guess. If both a single-value write and a pump match (for example, `Writable<Readable<T>>` and a `Readable<T>` value), emit `E_IO_AMBIGUOUS` and require an explicit `writech` or `io.pump` call. If neither matches, emit a type/capability error. Exact `T` compatibility and ownership rules apply; no implicit string conversion, element flattening, future await, stream materialization, or channel construction. `Readable<T>` / `Writable<T>` name *contracts*, not structural duck-typing or dynamic operator overloads.

A syntax preflight may recognize syntactic *candidates* but cannot classify a generic identifier as a stream using its spelling alone. Resolve only after normal lexical binding and static capability checking. In the current restricted Rust/Wasm compiler, BOTH pump forms must fail closed with `E_UNSUPPORTED` until guest stdin + typed stream ABI, scheduler and checked outcomes exist. A successful preflight is not an execution result.

## Operational contract: finite-memory, ordered, cancellable pump

The direct pump is one cooperatively suspending operation, which may run for an unbounded **duration** but must use bounded in-flight data. Its logical algorithm is:

```text
evaluate source once; evaluate sink once
loop:
    await source.read() -> Result<Option<T>, ReadError>
    Err(e)  => stop and return checked read failure
    None    => stop successfully (EOF); do not write an EOF value
    Some(v) => await sink.write(v) -> Result<Receipt, WriteError>
               Err(e) => stop and return checked write failure (with explicit
                         uncommitted-value ownership per the sink API)
               Ok(_)  => count one admitted element; continue
```

The pending item cannot be overwritten/read ahead while its write has not resolved. The pump must not park an OS thread; it may cooperatively suspend on reads, bounded-sink readiness, transport backpressure, and cancellation. A successful write means *sink admission*, not remote consumption or durability. The stdout channel is logically unbounded at admission (subject to explicit resource quotas), so the pump may be limited by output quotas and must return checked failure instead of dropping data. `stdio.out.flush()` is a separate, possibly suspending, drain operation. Source EOF **does not close `stdio.out`**, and the pump never closes borrowed endpoints implicitly. Transfer is ordered; interleaving with other producers is possible at whole-message boundaries.

The two short examples above illustrate **operator direction**, not an exemption from checked-result rules. Until a typed capture / propagation production is approved, a program attempting to discard a must-use pump outcome must fail with a checked-effect diagnostic; the compiler must not silently launch or ignore a failing transfer. A future expression grammar may admit `(stdio.in >> stdio.out)?;` and `(stdio.out << stdio.in)?;` in a suitably effect-annotated callable, with both lowered to the same pump and explicit `?`. The existing bare statements must never acquire implicit `?` merely to make examples compile.

The exact public result name is a type-system/runtime integration dependency, but it must preserve `Result<..., PipeError>` (or a library-equivalent checked outcome) with read errors, write errors, cancellations and partial progress. Syntax must not silently discard this result, invoke an implicit `?`, or silently unwrap. Implementers must define owned-value recovery when a write was never admitted; if a value is in-flight during cancellation, its state must be resolved at a single admission/commit point. At most one read and one pending write per pump by default; no double-send or speculative read-ahead. Pump failures never fabricate an EOF and must retain the count of already committed elements.

Input `Channel<string>` to output `Channel<string>` is message piping; message boundaries are preserved. Raw-byte piping requires a compatible byte-readable and byte-writable pair (for example, explicitly selected byte-stream views); no implicit text encoding conversion. The existence of `stdio.in.stream()` does not prove the element type matches `stdio.out`.

## Effects, composition, and precedence

- Direct pumping has the union of the source/sink I/O effects **and** `suspend`, unless the compiler proves a finite immediate protocol for the particular operation. Stdout's non-suspending *admission* does not remove stdin's suspend effect. Pure/non-suspending callers cannot invoke a potentially suspending pump.
- This first extension supports only a whole standalone pipe statement; checked result capture in larger expressions requires a separate parser/AST admission step. Use an explicit `io.pump(source, sink)` API if a caller needs a first-class result before expression-pipe grammar is admitted. `io.pump` is the proposed library spelling, not an assertion it currently exists.
- `nb source >> sink` and `nb sink << source` require an owned cancellable `Future<checked outcome>` plus task lifetime checks; they are **not admitted** until that profile exists. `try` whole-stream pump is not a one-shot atomic readiness check and is **not admitted** in this revision. Detached `do` must require an explicit completion/error-supervision contract; never silently launch a discarded pump.
- The pump cannot be used directly as a `when` / `select` guard: it includes multiple reads and writes, not one atomically commit-able operation. A selected arm may start a pump in its body after selection, with appropriate effects.
- Reject chains such as `a >> b >> c` and `c << b << a` until a separate typed fan-out/chain grammar is designed. Never reinterpret `|>` or `<|` as a stream transfer or a bare `await` stage.
- Numeric shifts and nested generics remain disjoint grammar contexts. A numeric `x >> 3` must not become I/O simply because `>>` is tokenized.

## Proof obligations / required tests

1. Both spellings yield identical normalized `IoPump(readable,writable)` roles and identical output for ordered test data, including empty input and multiple elements.
2. The pump stops at EOF, never enqueues terminal markers, and does not close a borrowed or process-wide `stdio.out`.
3. Input/read failure, output/write failure, resource quota failure, and cancellation surface as distinct checked errors and preserve already-admitted progress; uncommitted payload ownership must be observable and not silently lost.
4. Only one item is outstanding when the writable backpressures; no speculative reads or unbounded intermediary queue.
5. Reject read-only -> read-only, write-only -> write-only, incompatible element types, reversed endpoints, and ambiguous Writable<Readable<T>> cases.
6. A call evaluates each endpoint exactly once; no duplicate source consumption or double-delivery even when a write initially cannot commit.
7. Reject pump in `when` and non-suspending/pure contexts; reject `try`, detached-without-handler, and unsupported `nb` without a Future lifecycle.
8. Compiler-built guest stdin-to-stdout proof must execute with an injected stdin source on a *real typed guest ABI*, checked EOF, errors and suspension; keep host-reference results separate. Record exact source/head/tree SHA and per-target receipts before claiming backend parity.

## Relationship to current compiler

`atto-source.rs` has narrow executable `stdio.out << value` lowering to its print import; that is a single-value write. It does not implement stdin reads or endpoint pumps. The initial compiler change for this proposal should recognize source-to-sink syntax, mark it as an unresolved capability candidate, and reject both directions without emitting guest Wasm. Do not pretend a Rust in-memory pump oracle is evidence for guest channels, host imports, cancellation or scheduler behavior.
