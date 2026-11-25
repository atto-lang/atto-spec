# Explicit suspending lambda stages in functional pipelines (candidate)

Status: **candidate language contract**; runtime/compiler support is profile-dependent.
Supersedes the earlier tentative `future |> await` stage: **that spelling is invalid.**
The short effect spelling `susp` is accepted as an alias for `suspends`.
An `await` is a language suspension operation, not a callable pipeline operand.

## Canonical syntax

~~~atto
val result = future
    |> suspends |v| -> await v
    |> transform_result;

// Equivalent explicit effect alias:
val alias_result = future |> susp |v| -> await v;
~~~

This is equivalent to evaluating `future` exactly once, applying the explicitly
suspending single-argument lambda, and passing its resolved value into
`transform_result`. In the restricted identity-await case, its desugaring
is `transform_result(await future)`. A pipeline never implicitly detaches
work, creates a new task, or performs an actor send. The lambda is called
in the enclosing task unless a separate task operation is explicitly used.

`suspends` is an effect annotation on the **lambda**. A possibly pending
await requires suspension authorization on the **executing caller** as
well, since the pipeline invokes the stage in that caller. A pure caller
cannot evade effects by wrapping a suspending lambda in `|>`.

## Grammar and precedence

~~~ebnf
pipe_expr           = prior_expr, { "|>", pipe_stage } ;
pipe_stage          = callable_stage | inline_lambda_stage ;
inline_lambda_stage = [ "suspends" ], lambda_parameters, [lambda_return], "->", lambda_body ;
lambda_parameters   = "|", [ identifier, { ",", identifier } ], "|" ;
lambda_return       = ":", type_ref ;
~~~

These are contextual productions: `|>` associates left-to-right,
while the `lambda_body` belongs to **one** stage. The next `|>`
must be parsed at the enclosing pipeline level, not swallowed as part
of an unbraced lambda body. For complex lambda expressions, use braces
or explicit grouping to avoid ambiguity:

~~~atto
val x = pending
    |> suspends |f| -> { return await f; }
    |> next_stage;

// No magical await-token stage:
val bad = pending |> await;   // E_PIPE_STAGE / unsupported
~~~

A first-class lambda implementation must instantiate and invoke the
closure only once, with the pipeline value as the first argument, then
thread the result into the following stage. It must type-check the
lambda's inferred/annotated input and return, effects, captures and
move/borrow lifetimes. General closures do not become safe merely by
parsing a `suspends` marker.

## Initial restricted executable Rust/Wasm profile

Before first-class lambda calls/captures exist, the Rust compiler can
support **only** `|> suspends |v| -> await v`. It is a checked,
capture-free identity-await *syntax desugaring*, not a constructed
function value; it emits the existing `Await` AST, preserving
cooperative scheduling and Future consumption, then continues parsing
named function stages. Other lambda bodies remain fail-closed with
`E_UNSUPPORTED`. This narrow profile must **not** be advertised as
general lambda or `Future<Result<T,E>>` support.

## Type and terminal-state semantics

If `f : Future<T>`, then the identity-await stage produces `T`.
If `f : Future<Result<T,E>>`, it produces `Result<T,E>`, *not*
`T`. EOF-bearing `Result<Option<T>, IoError>` remains intact.
Explicit `?` is required for compatible early error propagation;
`None` must be handled in the ordinary Option contract. No implicit
trapping, unwrapping, ignoring a cancellation outcome, or casting is
authorized. `await` must not be reified as a user-definable function.

## Required regression cases

- Positive: Future<int> from a real `task`; named transformation
  after `suspends |v| -> await v`; expression evaluated once;
  generated guest Wasm invokes the actual checked Future await import
  and cooperative scheduler hook.
- Positive (after typed Future ABI): `Future<Result<Option<string>,IoError>>`
  preserves the exact resolved type and cancellation/EOF contract.
- Negative: `|> await`; non-suspends caller; pure caller;
  extra lambda parameters; wrong awaited binder; unsupported captures
  or complex body; invalid Future type; implicit unwrap or drop;
  incorrectly bound `|>` inside a lambda body; nested generic `>>`
  confused with stream direction syntax; excessive nesting.
- Cross-backend execution receipts for each supported target, with
  source/head/tree SHA, toolchain and full test observations. Parser
  acceptance alone is not guest execution.

The typed `nb` stdin continuation grammar is recorded separately in
`language/io-direction-shorthand-v1.md`, under "Proposed extension:
typed read–await continuations". Neither proposal claims the current
browser guest can read stdin.
