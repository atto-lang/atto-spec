# 07 — Errors, Throw, Raise, Panic and Recovery

**Status: DRAFT.** Effect classification is a language-level contract; precise source lowering is not yet uniform across backends.

## Error values

`Error` is the nominal base for typed exceptional values; `throw`, `raise` and `panic` accept only an `Error`-derived value. Constructing an error need not eagerly capture a stack trace. Explicit `capture_trace` or equivalent can attach bounded diagnostic context; serialized errors require a versioned JSON/MessagePack/Protobuf surface rather than raw host exception transport.

`Option<T>` and `Result<T,E>` are **ordinary data**, not automatically exceptions. A failed `Result` is not a panic. `unwrap()` on absent/error data intentionally **panics** and cannot be made safe by wrapping it in ordinary `trap`.

## Exceptional control paths

| Effect | Nearest permitted interception | If unhandled |
| --- | --- | --- |
| `throw Error` | Matching `try/catch` | Escalates out of its lexical scope (target: `raise`) |
| `raise Error` | Explicit `defer/recover` or privileged recovery scope, not ordinary `catch` | Escalates to panic/failure supervision |
| `panic Error` | Supervisor/runtime control only for an actor; never actor-local ordinary catch | Actor failure + CONTROL notice |
| Cancellation | Structured scheduler cancellation boundary | Cancel enclosing computation/actor per policy |
| Host fatal | No guest reliability guarantee | Host/runtime failure |

`try` handles ordinary throws. `raise` bypasses ordinary catches. `panic` is not swallowed by user `catch` or `trap`. An actor **cannot intercept its own panic** and resume execution. A supervisor may choose a recovery policy for a *new actor incarnation* if the environment remains safe.

For non-actor `main`, an unhandled throw/raise/panic terminates the root guest invocation with a defined non-success outcome and diagnostic subject to host policy; exact process exit code is profile-specific until standardized. An unsafe native fault, OOM or host process kill is outside this promise.

## trap

The currently described expression `trap expression` contract converts **ordinary escaping throws** to `Option<T>`: normal result `v` becomes `Some(v)`, escaping ordinary throw becomes `None`. Nested Option/Result values are *not flattened*. Panic, raise, cancellation and VM fatal bypass `trap`.

```atto
val maybe_value = trap parse_or_throw(text) // Option<T> target
```

A separate requested design treats `trap worker.send(msg)` as a `Result<T,E>`-returning admission form. That conflicts with existing Option-returning trap contracts: **do not silently promise both types**. Until settled, use the explicit `Result` produced by the send API (or an explicit conversion) and see [open questions](12-open-questions.md).

## Cleanup and effect precedence

`defer` runs in last-in-first-out order exactly once on admitted normal and exceptional unwind paths. `finally` runs once after a try/catch outcome. Cleanup failure must not demote a stronger panic/raise/cancellation to success; suppressed diagnostics preserve secondary failures. A cleanup callback cannot bypass an actor's CONTROL escalation policy.

The intended precedence is host fatal / forced termination, cancellation, panic, raise, ordinary throw, normal return. An implementation must prove its unwind and resource release semantics on the relevant compiler/runtime, including suspended continuations and actor retirement.

## Supervisor failure contract

A failed actor emits a bounded authenticated terminal notice with actor ID, parent ID, generation, error category and sanitized diagnostic. CONTROL delivery bypasses a full DATA mailbox and does not execute user supervisor code on the failing worker. It is bounded, generation-checked and at-most-once terminal publication. Independent actors remain runnable when the host/runtime can safely isolate the failing actor. A grandchild panic is handled by its **immediate** supervisor; escalation requires a new, generation-fenced failure receipt for the child supervisor itself, not relaying an untrusted grandchild token. See [hierarchy, escalation and restart](13-supervisor-hierarchies.md).

No specification sentence means JVM virtual machine corruption, unsafe FFI, native memory corruption, or OS process death is recoverable.
