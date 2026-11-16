# Typed I/O continuation pipelines — directional binding candidate

Status: **draft grammar contract**, not executable guest stdin support. This is an addendum to `io-direction-shorthand-v1.md` and `suspending-pipeline-stage-v1.md` on atto-spec #32, superseding the earlier ad hoc `Future<T> x | await x` spelling *when adopted*. Existing parser acceptance of the earlier forms is not a runtime promise.

## Decision boundary

- `|>` means forward callable application: `value |> f` is `f(value)`; `<|` means reverse application: `f <| value` is also `f(value)`. Both require **runtime expressions**, not type names.
- `await` is a language operation, **not** a standalone callable. `future |> await`, `future |> await x`, and `f <| Future<string>` are invalid.
- `susp |f| -> await f` and `suspends |f| -> await f` are the proposed short and long spellings for an explicitly suspending pipeline lambda. The compiler's existing executable subset accepts `suspends`; the `susp` alias has its own implementation/parity dependency.
- In a directional I/O pipeline, `source >> val pending` is a read/registration operation that binds its complete result and passes the result into a following `|>` stage. A terminal `>> val resolved` after a pipeline is **value capture**, not another read. These must be *distinct AST nodes*.
- `val/let` introduce bindings; `const` cannot be initialized from runtime I/O. The binding name must be fresh; `>>`/`<<` are not arbitrary reassignment and may not write to an existing mutable variable.

## Preferred forward spelling

```atto
// ReadOutcome is a stand-in for the capability's real checked outcome type.
nb stdio.in >> val pending: Future<ReadOutcome>
    |> susp |f| -> await f
    >> val resolved: ReadOutcome;

// The unambiguous existing-language desugaring:
val pending = nb readch stdio.in;
val resolved = await pending;
```

`nb` qualifies only the read registration. That registration must return promptly (including prompt admission failure); the explicit awaited stage can suspend and requires the surrounding callable to authorize suspension. Both effects require the appropriate I/O and suspension permissions. In the forward shorthand `pending` is a **move-through binding**: it names the Future at that stage, but passing a linear Future to the await stage consumes it. Subsequent use of `pending` is rejected if the Future is linear. No hidden copies, repeat reads, temporary task creation, or double-await.

An explicit example that does **not** require directional capture syntax is:

```atto
val resolved = (nb readch stdio.in)
    |> suspends |f| -> await f;
```

## Reverse pipeline and `<<`

```atto
// Reverse application has an actual Future-producing expression on the right.
val resolved = (suspends |f| -> await f) <| (nb readch stdio.in);

// Possible declaration-first terminal capture; candidate only:
val resolved << ((suspends |f| -> await f) <| (nb readch stdio.in));
```

The second form is **not** automatically legal merely because `val x << source` is an existing I/O read-binder shorthand. An expression returning `ReadOutcome` is not a readable stream. To adopt this additional capture spelling, the grammar must recognize an explicitly parenthesized reverse-pipeline RHS and lower the outer declaration to `BindValue`, not to a second `Read`. Do not choose I/O-vs-assignment semantics by arbitrary runtime type. Until this contextual production is implemented, prefer `val resolved = ...` for reverse pipes.

## Reject the original ambiguous examples

```atto
// INVALID: `Future<string>` is a type, not a runtime value.
nb stdio.in >> (val string line << |x| -> await x <| Future<string>);

// INVALID: `await x` is not a callable stage and the binder lacks val/let.
nb stdio.in >> Future<string> x |> await x >> val string line;

// ALSO INVALID: a bare await stage is not a function.
val x = future |> await;
```

The earlier contextual `await Future<T>` form is a separate **typed slot** production, not a general-purpose `await` expression or license to pass types through `<|`. Do not reinterpret the new reverse pipe as that special case.

## Grammar sketch (new productions only)

```ebnf
nb_read_flow       = 'nb', readable_expr, '>>', future_binder,
                     '|>', suspending_await_stage, '>>', outcome_binder, ';' ;
future_binder      = ('val' | 'let'), typed_name_with_future_type ;
outcome_binder     = ('val' | 'let'), typed_name ;
suspending_await_stage = ('susp' | 'suspends'), '|', identifier, '|',
                         '->', 'await', identifier ;
reverse_apply      = callable_expr, '<|', value_expr ;
forward_apply      = value_expr, '|>', callable_stage ;
reverse_capture_candidate = ('val' | 'let'), typed_name, '<<',
                            '(', reverse_apply, ')', ';' ;
```

Use proper expression/typed-binder parsing for the final grammar; this sketch is deliberately restricted to the identity-await flow and does not imply full closures, generic I/O execution, or operator overloading. The lambda's awaited identifier must equal the lambda parameter. Its Future input must resolve to the actual pending read value. `Future<ReadOutcome>` must unify exactly with the capability's return type; `ReadOutcome` must unify with the output binder, retaining `Result`, `Option`, EOF, errors, cancellation, and ownership semantics.

## Precedence and effect safety

- Parse a forward flow as `((nb-read >> pending) |> suspending-lambda) >> resolved`, **not** as `(nb-read >> (pending |> lambda))`.
- `|>` is left-associative; `<|` is right-associative where adopted. Mixed forward/reverse pipelines require explicit parentheses. No bare `|` in place of `|>`.
- `>>` used as terminal capture exists only in a syntactically recognized I/O flow, not globally on arbitrary expressions. `<<` used as terminal capture remains a separate candidate and must not change `sink << payload` writes or `val item << readable` reads.
- Generic closing `>>` is part of the parsed type, not a directional operator. Directional token pairs must be contiguous; never split arithmetic shift/generic tokens based on runtime values.
- The read is registered exactly once; no speculative read, silent Outcome flattening, unobserved checked Future, `const` runtime assignment, hidden `?`, or hidden `unwrap`.
- Suspension is forbidden from pure, non-suspending, and unsafe actor-state critical/borrow contexts. `nb` does not make the subsequent `await` non-suspending.

## Required test matrix

1. **Syntax positive, runtime still fail-closed:** `val/let pending: Future<Outcome> |> susp |f| -> await f >> val/let resolved: Outcome`, including nested `Result<Option<string>,IoError>` types, optional long `suspends` alias, and line breaks.
2. **Syntax/type negative:** bare `|> await`; `|> await x`; missing `val/let`; mismatched awaited binder; extra lambda arguments; untyped/interrupted `Future<...>`; mismatched resolved outcome; `const` binder; `Future<T>` passed as expression to `<|`; absent parentheses on mixed operators; nested `>>` mislexed.
3. **Guest future execution:** compile and run an actual `.atto` read registration + await with a typed stdin/channel ABI. Verify EOF, errors, cancellation, ownership and terminal-state propagation, single read registration, no duplicate await, effect checks, and exact outcome binding.
4. **Per-backend receipts:** record SHA and actual compiler-built guest tests separately from syntax preflight and Rust host-oracle tests; no runtime PASS until the ABI exists.

Existing atto-source.rs #197 only has executable `Future<int>` identity-await stages. A parsed `nb stdio.in` continuation must continue to return a clear `E_UNSUPPORTED` with no guest Wasm artifact until the real typed read ABI lands.
