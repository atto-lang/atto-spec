# 07 — Errors, Throw, Raise, Panic and Recovery

**Status: DRAFT.** Effect classification is a language-level contract; precise source lowering is not yet uniform across backends.

## Error values

`Error` is the built-in nominal base for typed exceptional values and implements the operation-specific `Throwable`, `Raisable` and `Panicable` traits. Under the November 23 target, `throw!`, `raise!` and `panic!` require their respective verified trait; an explicitly conforming non-Error type must preserve nominal identity and payload in an admitted guest error envelope. Until that representation is verified, the existing Error-derived subset is the only supported profile; unsupported cases reject before emission. Bare keywords remain migration aliases. Constructing an error need not eagerly capture a stack trace. Explicit `capture_trace` or equivalent can attach bounded diagnostic context; serialized errors require a versioned JSON/MessagePack/Protobuf surface rather than raw host exception transport.

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

**Decided 2026-11-17 (owner): `trap` yields `Result`, and never wraps a `Result` twice.** This replaces the earlier `Option`-returning contract and settles the conflict this section used to record. The historical `caller-trap-parity/v1` Option manifest is legacy evidence, **not the canonical oracle**. The canonical trap expression may call a declared throwing function, catches its ordinary escaping throw and yields `Result`; it never catches `raise`, `panic` or cancellation.

`trap expression` evaluates `expression` exactly once and catches only **ordinary escaping throws**:

| Operand type | `trap` type | Normal completion | Caught ordinary throw |
| --- | --- | --- | --- |
| `T` (not a `Result`) | `Result<T, Error>` | `Ok(v)` | `Err(Error)` |
| `Result<T, E>` | `Result<T, E \| Error>`, or `Result<T, E>` when `E` already accepts `Error` | the value itself; its own `Err(E)` passes through unchanged | `Err(Error)` |

- **No double wrapping.** An existing outer `Result` is not wrapped in a second `Result`; deliberately nested success payloads remain intact. A widened error type `E | Error` never narrows back to `E` implicitly.
- **Other values are ordinary data.** An `Option` or `void` value is data inside `Ok`, e.g. `Result<Option<T>, Error>` or `Result<void, Error>`.
- **Caught guest error identity is preserved.** Preserve the original nominal type, payload and identity inside the admitted domain. Only crossing a diagnostic/host boundary requires separately governed bounded printable metadata; never expose raw host exception objects, pointers or unverified cause chains.
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

## Canonical deferred cleanup and recovery syntax

Ordinary cleanup canonically uses `defer { ... };`; `defer _ -> { ... };`
and the existing `defer || -> { ... };` are admitted equivalent
zero-argument forms. An explicit capture factory is also accepted:

```atto
defer (|int v| -> _ -> {
    stdio.println(v);
})(5);
```

The factory evaluates its arguments exactly once at registration. The
deferred body executes later during supported scope exit/unwind paths.
`_ ->` is nullary **only in this cleanup context** and is not a wildcard
single-argument handler.

A recovery handler has **two explicitly bound capabilities**:

```atto
recover |err, cursor| -> {
    stdio.println(err.message);
    return 42;
};

// Equivalent explicit annotation:
recover |ErrorView err, RecoveryCursor cursor| -> {
    cursor.next();
};
```

`err: ErrorView` is a read-only, non-escaping compiler-issued view over the
pending original Error; initially `err.message: string` and
`err.is_raise: bool` are readable. It is not a first-class object, and
cannot be cloned, sent, returned, captured or kept beyond the handler.
`cursor: RecoveryCursor` is a non-escaping one-shot, terminal delegation
capability: `cursor.next()` passes the identical pending failure to the
next eligible registered recovery callback. Recovery callbacks must either
return a result compatible with the enclosing callable or delegate; they
cannot resume the failed statement.

An existing explicit-capture recovery factory remains accepted:
`recover (|int fallback| -> |err, cursor| -> { return fallback; })(5);`.
A bare `recover { ... }` is intentionally rejected to keep exceptional
handling explicit. An escaping ordinary `throw` must give all caller
`catch` and `trap` boundaries precedence before any recovery callback
runs; `raise` bypasses ordinary catch/trap; `panic` and cancellation
bypass recovery entirely.

**Cleanup and recovery hardening (browser profile):** The compiler-issued
`ErrorView` and `RecoveryCursor` binder names are reserved throughout the
recovery handler body, including nested branches. The checker computes
separate *escaping ordinary throw* and *escaping raise* effects through typed
calls by a convergent recursive call-graph fixed point. `catch (Error e)`
subtracts ordinary throws originating in its protected body, while effect
analysis still includes exceptional behavior of the catch handler and
`finally`. `trap expression` subtracts ordinary throws from its operand;
neither ordinary catch nor trap can intercept raise or panic. Thus a helper
that locally handles its own throw may be called from `defer`, `recover`,
or `finally`, while a helper with an escaping throw/raise remains rejected
there. A registered recover does not erase a function's inferred effects,
since an outer caller's catch/trap still has precedence. Conservative
overapproximation remains for unreachable paths; full CFG-sensitive
effect inference and actor/async parity are not established.
A factory argument that fails before registration cannot leave a partially
registered cleanup; earlier registered cleanup executes according to the
normal unwind contract. Fatal/forced termination still has no absolute
cleanup guarantee.

**Declared effects are checked upper bounds in the browser profile:**
if a function signature supplies one or more `throws(Error)`,
`raises(Error)` or `panics(Error)` clauses, its omitted *throw/raise*
channels must not escape its typed body, including indirectly through
function calls. Thus a declared `throws(Error)` without `raises(Error)`
does not authorize an unhandled raise. Unannotated functions retain
inferred-effect compatibility. The compiler also excludes error paths
after proven terminal exits and excludes catch-handler effects when its
protected region provably cannot throw. The ordinary throw/raise analysis
uses a monotone call-graph fixed point and rejects mismatched contracts
with a positioned `E_EFFECT` diagnostic before guest emission.

`panics(Error)` is accepted as syntax and retained as metadata but is
**not yet a machine-checked guarantee**: fatal traps, overflow, allocation
failures, cancellation and supervisor failures must be handled by the
separate runtime/actor proof. A successful static throw/raise check is
never evidence that a function cannot panic.

**Current admission limitation:** the Rust browser slice restricts
registrations to synchronous top-level function bodies and factory captures
to scalar/string values. This section defines intended language semantics;
it does not assert actor/async/Java/LLVM parity. See the normative candidate
in `atto-spec/language/defer-recover-unwind-v1.md`.

## Cleanup and effect precedence

`defer` runs in last-in-first-out order exactly once on admitted normal and exceptional unwind paths. `finally` runs once after a try/catch outcome. Cleanup failure must not demote a stronger panic/raise/cancellation to success; suppressed diagnostics preserve secondary failures. A cleanup callback cannot bypass an actor's CONTROL escalation policy.

The intended precedence is host fatal / forced termination, cancellation, panic, raise, ordinary throw, normal return. An implementation must prove its unwind and resource release semantics on the relevant compiler/runtime, including suspended continuations and actor retirement.

## Supervisor failure contract

A failed actor emits a bounded authenticated terminal notice with actor ID, parent ID, generation, error category and sanitized diagnostic. CONTROL delivery bypasses a full DATA mailbox and does not execute user supervisor code on the failing worker. It is bounded, generation-checked and at-most-once terminal publication. Independent actors remain runnable when the host/runtime can safely isolate the failing actor. A grandchild panic is handled by its **immediate** supervisor; escalation requires a new, generation-fenced failure receipt for the child supervisor itself, not relaying an untrusted grandchild token. See [hierarchy, escalation and restart](13-supervisor-hierarchies.md).

Stack exhaustion is an actor failure, not a host fatal error, on any path that runs untrusted actors. See [runtime guarantees](18-runtime-guarantees.md).

No specification sentence means JVM virtual machine corruption, unsafe FFI, native memory corruption, or OS process death is recoverable.
