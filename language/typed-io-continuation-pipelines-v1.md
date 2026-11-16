# Typed directional I/O captures and forward/reverse await continuations

Status: **candidate language contract**; the Rust/Wasm stdin guest read ABI is still unsupported. This extends `io-direction-shorthand-v1.md` and `suspending-pipeline-stage-v1.md`. Unlike the earlier version of this document, the two *contextual* typed-Future spellings below are now proposed as valid grammar. A general `future |> await` stage remains invalid.

## Binding versus channel I/O

- `source >> val item` is a *read* with a fresh immutable binding; `sink << data` is a *write* to a Writable capability.
- `result >> val item` **only at the terminal capture of a recognized pipeline** binds its value, not another channel read. `val item << result` is a declaration-first capture *only* in the corresponding recognized reverse pipeline. Never infer the distinction from runtime duck typing.
- An `nb source >> Future<T> x` continuation *registers a nonparking read* and binds the resulting Future to `x`. The source does not "write to a Future": it initiates a read and its completion is represented by the future. `Future<T>` is a contextual **type slot**, not an evaluated expression or a new object constructor.
- A `val` or `let` binder must be fresh. Neither `>>` nor `<<` performs arbitrary reassignment to an existing variable. Runtime `const` capture is rejected.

## The two requested forms

~~~atto
// Reverse: unnamed pending Future, applied right-to-left to a lambda.
nb stdio.in >> (
    val String pending_line << |x| -> await x <| Future<string>
);

// Forward: named pending Future, then a checked await of precisely x.
nb stdio.in >> Future<string> x
    |> await x
    >> val String pending_line;
~~~

Both are syntactic alternatives to:

~~~atto
val x: Future<string> = nb readch stdio.in;
val pending_line: string = await x;
~~~

That desugaring is illustrative: it is only well-typed when this source really provides `Future<string>`. A raw stdin source can report EOF, failure and cancellation; for such a source a bare `string` is not an admissible flattened result.

The reverse `<|` means functional application in the general language, `f <| value = f(value)`; **only in this particular read production** is `Future<T>` the typed slot for the preceding nonblocking registration. Anywhere else, `f <| Future<T>` is invalid because `Future<T>` is a type, not a runtime value.

The forward `|> await x` is a *contextual named-future control stage*, **not** `await` as a function. It is permitted only immediately after the `nb source >> Future<T> x` declaration and only when the identifier is precisely `x`. Elsewhere `future |> await` and `future |> await x` remain invalid. Existing ordinary lambda application remains:

~~~atto
val transformed = pending |> susp |f| -> await f |> transform_result;
// Equivalent effect spelling: suspends |f| -> await f
~~~

The reverse lambda `|x| -> await x` can infer its suspension effect from its *explicit* await in this narrow inline-I/O production; a standalone general callable lambda still follows normal `susp`/`suspends` effect rules. The **enclosing** callable must authorize `suspends`, regardless of the inline marker.

## Checked IoError propagation with ?

Assuming a line-oriented source's checked outcome is `Future<Result<Option<string>,IoError>>`:

~~~atto
// Forward: propagation applies to the awaited Result, NOT to the Future.
nb stdio.in >> Future<Result<Option<string>,IoError>> pending
    |> (await pending)?
    >> val Option<string> line;

// Reverse:
nb stdio.in >> (
    val Option<string> line
      << |f| -> (await f)? <| Future<Result<Option<string>,IoError>>
);
~~~

The semantics are:

1. A nonblocking read registration is attempted **exactly once** and yields an owned Future (or its declared immediate admission failure).
2. `await` consumes/awaits the Future, potentially suspending the current task; the result is `Result<Option<string>,IoError>`.
3. `(await pending)?` propagates `Err(IoError)` to a compatible enclosing `Result<...,IoError>` return (or a compatible explicitly declared conversion). The successful value is `Option<string>` and is bound by the terminal `>> val` or declaration-first `val <<`.
4. `None` is **EOF**, not a string and not an `IoError`. It remains `None` for the caller to handle. Do not silently convert it to an empty string, panic, or implicit cancellation.
5. `await pending?` is rejected in this production: it ambiguously suggests `await (pending?)`. Require `(await pending)?` for the intended Result propagation.

An enclosing `Result<Option<string>,IoError>` callable could return `Ok(line)`. A regular `int`-returning callable must not use this `?` unless its effect/return contract has a defined compatible error propagation route. Cancellation/close/admission errors must have an observable path; they are never discarded.

## Grammar (candidate, contextual productions only)

~~~ebnf
nb_capture =
    "nb", readable_expr, ">>",
    ( "(", new_binding, "<<", reverse_await, "<|", future_type_slot, ")"
    | future_type_slot, identifier, ("|>" | "|"), named_await,
      ">>", new_binding
    | new_future_binding, "|>", explicit_susp_lambda,
      ">>", new_binding ) ;
reverse_await = [ "susp" | "suspends" ], "|", identifier, "|", "->",
                ( "await", identifier | "(", "await", identifier, ")", ["?"] ) ;
named_await = "await", identifier | "(", "await", identifier, ")", ["?"] ;
explicit_susp_lambda = ("susp" | "suspends"), "|", identifier, "|", "->",
                       ( "await", identifier | "(", "await", identifier, ")", ["?"] ) ;
future_type_slot = "Future", "<", type_ref, ">" ;
new_future_binding = ("val" | "let"), typed_name_with_future_type ;
new_binding = ("val" | "let"), typed_name ;
~~~

In the reverse case the awaited identifier must match the inline lambda parameter; in the forward case the awaited identifier must equal the explicitly bound pending Future. Strictly reject renamed/unbound, multiply awaited, borrowed-across-suspension, type-incorrect, and `const` captures. The pipeline operators are parsed as complete contiguous `|>` and `<|` tokens; `>>` and `<<` must be contiguous, except generic close `>>` belongs exclusively to its type grammar. Mixed forward/reverse chains outside this narrow production require explicit grouping.

## Compiler/verification boundaries

The browser Rust compiler can currently execute an identity-await stage on its limited `Future<int>` guest path; it does **not** yet implement the general `Readable<T>`, `Future<Result<Option<T>,IoError>>`, stdin, or full capture/borrow/effect ABI. Grammar recognition must return a stable `E_UNSUPPORTED` **with no guest Wasm** until real source-compiled guest read execution is implemented.

Required tests: both exact user spellings; reverse `<|` contiguity; `|>` named binder identity; `(await x)?` preserving `Result.Err` versus `Option.None`; nested generic `>>`; incompatible `Result` payload, `const`, pure and non-suspending effect rejection; single registration and single await; cancellation/close/admission failure; no use-after-move or escaping mutable loans; no accidental change to `<<` channel writes; executable native/Chromium results pinned to source/tree SHA. Distinguish parser-only PASS from guest runtime PASS for each backend.
