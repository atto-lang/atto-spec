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

**Decided 2026-11-17 (owner): `trap` yields `Result`, and never wraps a `Result` twice.** This replaces the earlier `Option`-returning contract and settles the conflict this section used to record.

`trap expression` evaluates `expression` exactly once and catches only **ordinary escaping throws**:

| Operand type | `trap` type | Normal completion | Caught ordinary throw |
| --- | --- | --- | --- |
| `T` (not a `Result`) | `Result<T, Error>` | `Ok(v)` | `Err(Error)` |
| `Result<T, E>` | `Result<T, E \| Error>`, or `Result<T, E>` when `E` already accepts `Error` | the value itself; its own `Err(E)` passes through unchanged | `Err(Error)` |

- **No double wrapping.** A `Result` is never wrapped in a second `Result`, so `Result<Result<T, E>, Error>` is never produced. A widened error type `E | Error` never narrows back to `E` implicitly.
- **Other values are ordinary data.** An `Option` or `void` value is data inside `Ok`, e.g. `Result<Option<T>, Error>` or `Result<void, Error>`.
- **The caught `Error` is sanitized.** It carries a bounded, printable type name and message, never a host exception object, cause chain or stack trace.
- **`trap fnc`** callables have the same call type. An async or scheduled trap boundary settles its Future with it: `Future<Result<T, Error>>`.
- **`trap await f`** spans the suspension. Whether `f` is already complete or suspends first, its ordinary failure becomes `Err(Error)`. `await trap f` is a type error, because `trap f` is not a Future.
- **Bypass.** `panic`, `raise`, cancellation, forced termination and VM-fatal failures bypass `trap`. `unwrap()` on an `Err` or `None` is a panic and cannot be made safe with `trap`.

```atto
val Result<Config, Error> loaded = trap parse_or_throw(text)
val Result<int, String | Error> id = trap checked_id(raw)   // checked_id(): Result<int, String>
```

**Backend status (2026-11-17):**
- **Java/GraalVM:** implements this contract (oreslang-source.java #3165).
- **LLVM:** lowers only pure-integer `trap` operands, still as `Option<int>`.
- **.NET:** lowers only pure-integer `trap` operands, still as `Option<int>`.

LLVM and .NET must move to `Result<_, Error>`, or reject `trap` with a diagnostic. They must not keep producing `Option`.

## Cleanup and effect precedence

`defer` runs in last-in-first-out order exactly once on admitted normal and exceptional unwind paths. `finally` runs once after a try/catch outcome. Cleanup failure must not demote a stronger panic/raise/cancellation to success; suppressed diagnostics preserve secondary failures. A cleanup callback cannot bypass an actor's CONTROL escalation policy.

The intended precedence is host fatal / forced termination, cancellation, panic, raise, ordinary throw, normal return. An implementation must prove its unwind and resource release semantics on the relevant compiler/runtime, including suspended continuations and actor retirement.

## Supervisor failure contract

A failed actor emits a bounded authenticated terminal notice with actor ID, parent ID, generation, error category and sanitized diagnostic. CONTROL delivery bypasses a full DATA mailbox and does not execute user supervisor code on the failing worker. It is bounded, generation-checked and at-most-once terminal publication. Independent actors remain runnable when the host/runtime can safely isolate the failing actor. A grandchild panic is handled by its **immediate** supervisor; escalation requires a new, generation-fenced failure receipt for the child supervisor itself, not relaying an untrusted grandchild token. See [hierarchy, escalation and restart](13-supervisor-hierarchies.md).

Stack exhaustion is an actor failure, not a host fatal error, on any path that runs untrusted actors. See [runtime guarantees](18-runtime-guarantees.md).

No specification sentence means JVM virtual machine corruption, unsafe FFI, native memory corruption, or OS process death is recoverable.
