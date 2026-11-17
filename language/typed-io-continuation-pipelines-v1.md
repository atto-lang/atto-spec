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

// Forward: named pending Future, then a real inline lambda stage.
nb stdio.in >> Future<string> x
    |> |f| -> await f
    >> val String pending_line;
~~~

Both are syntactic alternatives to:

~~~atto
val x: Future<string> = nb readch stdio.in;
val pending_line: string = await x;
~~~

That desugaring is illustrative: it is only well-typed when this source really provides `Future<string>`. A raw stdin source can report EOF, failure and cancellation; for such a source a bare `string` is not an admissible flattened result.

The reverse `<|` means functional application in the general language, `f <| value = f(value)`; **only in this particular read production** is `Future<T>` the typed slot for the preceding nonblocking registration. Anywhere else, `f <| Future<T>` is invalid because `Future<T>` is a type, not a runtime value.

The forward `|> |f| -> await f` is a **contextual inline lambda adapter**, not an `await` function. The preceding named Future is passed as the lambda's single argument and consumed exactly once. The lambda binder may have a different name from the Future binding (and should not shadow it for readability). The spellings `future |> await`, `future |> await x`, and `nb source >> Future<T> x |> await x` are **all invalid**. Ordinary explicitly suspending lambda application remains:

~~~atto
val transformed = pending |> susp |f| -> await f |> transform_result;
// Equivalent effect spelling: suspends |f| -> await f
~~~

Both the reverse lambda `|x| -> await x` and the forward lambda `|f| -> await f` infer their suspension effect from the literal await in this narrow **inline-I/O production**. The compiler lowers these to the enclosing callable's control flow without creating a first-class closure. As a consequence, `?` on the awaited `Result` propagates from the **enclosing callable** (nonlocal to the inline adapter). In an ordinary first-class lambda, by contrast, `?` exits that lambda, not its caller; do not silently import this special behavior into general closure semantics. Standalone callable lambdas still follow normal `susp`/`suspends` checking, and the enclosing I/O caller must authorize `suspends`.

## Checked IoError propagation with ?

Assuming a line-oriented source's checked outcome is `Future<Result<Option<string>,IoError>>`:

~~~atto
// Forward: propagation applies to the awaited Result, NOT to the Future.
nb stdio.in >> Future<Result<Option<string>,IoError>> pending
    |> |f| -> (await f)?
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
3. `(await f)?` inside the contextual inline adapter propagates `Err(IoError)` to a compatible **enclosing callable's** `Result<...,IoError>` return (or a compatible explicitly declared conversion). The successful value is `Option<string>` and is bound by the terminal `>> val` or declaration-first `val <<`.
4. `None` is **EOF**, not a string and not an `IoError`. It remains `None` for the caller to handle. Do not silently convert it to an empty string, panic, or implicit cancellation.
5. `await f?` is rejected in this production: it ambiguously suggests `await (f?)`. Require `(await f)?` for the intended Result propagation. Likewise, bare `|> await f` is invalid: `|>` must apply an explicit lambda.

An enclosing `Result<Option<string>,IoError>` callable could return `Ok(line)`. A regular `int`-returning callable must not use this `?` unless its effect/return contract has a defined compatible error propagation route. Cancellation/close/admission errors must have an observable path; they are never discarded.

## Grammar (candidate, contextual productions only)

~~~ebnf
nb_capture =
    "nb", readable_expr, ">>",
    ( "(", new_binding, "<<", reverse_await, "<|", future_type_slot, ")"
    | future_type_slot, identifier, "|>", inline_await_lambda,
      ">>", new_binding
    | new_future_binding, "|>", inline_await_lambda,
      ">>", new_binding ) ;
reverse_await = [ "susp" | "suspends" ], "|", identifier, "|", "->",
                ( "await", identifier | "(", "await", identifier, ")", ["?"] ) ;
inline_await_lambda = [ "susp" | "suspends" ], "|", identifier, "|", "->",
                      ( "await", identifier | "(", "await", identifier, ")", ["?"] ) ;
future_type_slot = "Future", "<", type_ref, ">" ;
new_future_binding = ("val" | "let"), typed_name_with_future_type ;
new_binding = ("val" | "let"), typed_name ;
~~~

In both directions, the awaited identifier must match the inline lambda parameter; the preceding named Future is passed into this parameter exactly once. A distinct parameter name is allowed and avoids shadowing. Strictly reject renamed/unbound, multiply awaited, borrowed-across-suspension, type-incorrect, and `const` captures. The pipeline operators are parsed as complete contiguous `|>` and `<|` tokens; `>>` and `<<` must be contiguous, except generic close `>>` belongs exclusively to its type grammar. Mixed forward/reverse chains outside this narrow production require explicit grouping.

## Compiler/verification boundaries

The browser Rust compiler can currently execute an identity-await stage on its limited `Future<int>` guest path; it does **not** yet implement the general `Readable<T>`, `Future<Result<Option<T>,IoError>>`, stdin, or full capture/borrow/effect ABI. Grammar recognition must return a stable `E_UNSUPPORTED` **with no guest Wasm** until real source-compiled guest read execution is implemented.

Required tests: both exact user spellings; reverse `<|` contiguity; `|>` named binder identity; `(await x)?` preserving `Result.Err` versus `Option.None`; nested generic `>>`; incompatible `Result` payload, `const`, pure and non-suspending effect rejection; single registration and single await; cancellation/close/admission failure; no use-after-move or escaping mutable loans; no accidental change to `<<` channel writes; executable native/Chromium results pinned to source/tree SHA. Distinguish parser-only PASS from guest runtime PASS for each backend.


## Executable staging: Rust/Wasm terminal capture (2026-11-16)

A narrower *non-I/O* milestone is now implemented on draft
[atto-lang/atto-source.rs#197](https://github.com/atto-lang/atto-source.rs/pull/197):

~~~atto
fnc transform_result(int v): int { return v + 1; }
pub suspends fnc main(): int {
    val future = task { return 41; };
    future
        |> susp |f| -> await f
        |> transform_result
        >> val result: int;
    return result;
}
~~~

- The parser recognizes a **contiguous** terminal directional operator only
  following an explicit `susp`/`suspends` identity-await stage. It checks
  the lambda binder and desugars the terminal capture to an ordinary
  `Stmt::Bind` initializer, preserving the existing type checker,
  `Future<int>` consumption, and JSPI cooperative suspension.
- The future is consumed exactly once; re-awaiting it is `E_MOVED`.
  A mismatched annotation is `E_TYPE`. A `const` terminal binding is
  `E_CONST_EFFECT`. An object loan surviving the suspension is `E_BORROW`.
  Plain `await future >> val value` is not a pipeline stage.
- This does **not** make `>>` a general assignment, overloadable operator,
  second channel read, or arbitrary first-class lambda call. The actual
  in-guest execution and full compiler corpus need exact-head CI receipts.
- Nested built-in `String`/`string` type aliases are canonicalized inside
  syntax-only read-continuation checks without rewriting qualified nominal
  names. This is *not* a substitute for the real typed Future/Result AST.

### Required stdin/channel ABI before claiming an executable read

Raw stdin cannot promise bare `Future<string>`. For a readable source
whose contract is `Result<Option<string>,IoError>`, a proposed normal
operation is:

~~~atto
pub susp fnc main(): int using io, suspend {
    nb stdio.in >> val pending: Future<Result<Option<string>,IoError>>
        |> susp |f| -> await f
        >> val outcome: Result<Option<string>,IoError>;

    // match outcome explicitly: Err, Ok(None), and Ok(Some(line)).
    return 42;
}
~~~

The `susp` declaration and `using` spellings above are the *full-language
design*, not a claim the current browser frontend accepts those modifiers.

To make the read real, independently implement and verify:

1. A **typed** `Readable<string>` stdio capability, exactly one nonparking
   `nb` registration, and an owned single-use Future handle. Registration
   failure must be immediate and typed; it cannot manufacture an unresolvable
   Future or silently detach a task.
2. A typed `Result<Option<string>,IoError>` guest data layout and generation-
   fenced payload/handle storage. No reusing raw pointers, shared input
   buffer clobbering, accidental UTF-8 slicing, or implicit error/EOF
   flattening; support multiple pending reads with a documented ordering.
3. Host-side async input delivery that actually suspends and resumes the
   caller on the scheduler. A browser Worker input channel must be explicit:
   the browser has no implicit OS stdin stream. No fabricated constant line
   or JS evaluator substituted for compiled guest I/O.
4. Cancellation/closed/EOF/error ownership and cleanup, including teardown,
   double-await, stale wake, backpressure and producer failure. Await must
   require the caller's suspension effect and respect actor-state leases
   and active borrowed objects.
5. Native Rust + wasm32 compiler tests and **actual compiled guest** tests in
   Chromium/Worker (and separate non-browser backend receipts). Assert
   successful message, EOF, IoError, cancelled pending read, concurrent
   registrations, and no duplicate/ghost delivery. Exact branch commit/tree
   SHAs are mandatory, and zero-step Actions are **not passing tests**.

Until this ABI is implemented, the browser frontend deliberately returns
`E_UNSUPPORTED` from the `nb stdio.in` continuation production with no guest
Wasm. Never change that diagnostic to success merely because the parser
recognized a typed syntactic slot.

### Caret return with an awaited, transformed directional capture

The statement-position `^` alias of `return` is compatible with the
existing identity-await terminal capture; it is **not** an expression-level
prefix, a generator yield, or arithmetic XOR. With a declared transform:

```atto
fnc transform_result(int x): int { return x + 1; }

pub susp fnc main(): int {
    val pending = task { return 41; };

    ^ pending
        |> susp |f| -> await f
        |> transform_result
        >> val result: int;
}
```

The last statement is exactly equivalent, for effects, value and control flow,
to the following existing checked operations:

```atto
val result: int = transform_result(await pending);
return result;
```

The caret form evaluates the source Future once, awaits it exactly once,
calls the named transform once, declares the immutable runtime `result`
binding with the ordinary type/ownership checker, and exits the enclosing
function. The lexical capture used by the return statement does not escape
as a separate reference; the returned value is checked against the callable's
declared return type. `return pending |> susp |f| -> await f
|> transform_result >> val result: int;` follows the same grammar and
diagnostics. Unlike `::` comma-tail bodies, this is an **explicit**
return and does not change the language version's implicit-tail policy.

Both spellings require a declared `transform_result` callable that accepts
the awaited result and returns the advertised type; the transform name is
not implicitly provided by the standard library. `^ pending ... >> const
result` is invalid because a suspension-dependent value is not constant;
a non-`susp` caller is an effect violation. `^` alone is a void return
only in a callable with `void` return type. `^` is never an assignment
operator, and `^^` is a separate reserved boolean operator.

Compiler implementation and **unverified current-head regression tests**:
[atto-source.rs #197](https://github.com/atto-lang/atto-source.rs/pull/197).
The broader caret language contract remains
[atto-spec #35](https://github.com/atto-lang/atto-spec/pull/35) and its
version-gated compiler implementation is
[atto-source.rs #185](https://github.com/atto-lang/atto-source.rs/pull/185).
Do not adopt the breaking `::` migration merely to use this additive
caret/capture interaction.
