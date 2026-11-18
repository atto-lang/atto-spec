# Pipeline failure accounting and static proof obligations (v1 candidate)

**Status: proposed normative/compiler-design contract.** This augments
[pipeline-failure-effects-v1.md](pipeline-failure-effects-v1.md) and
[trap-result-v1.md](trap-result-v1.md). It is **not** a claim that
all of the described checks, runtime behavior, or cross-backend proof
machinery are implemented today.

## Safety target

For every well-typed expression and pipeline, the compiler must account
for every modeled recoverable failure: it is handled by a qualifying
exhaustive handler, explicitly propagated to a compatible caller/owner,
or converted without loss into an observable typed outcome. Silent drop,
relabeling to success, and unsupported-ABI codegen are forbidden.

This is an **effect-accounting proof**, not a proof that recovery is
correct, that physical resources are infinite, or that all foreign/host
faults are modeled. Separate deductive verification and runtime tests
are needed to establish stronger claims.

## Types and effects are independent dimensions

Use judgments of the form `Γ ⊢ e : T ! ε` where `T` is the value
type and `ε` is the set of potentially escaping effects:

- `throws(E)`: ordinary source exceptions, captured by a matching
  typed `catch` or caller-side `trap`.
- `raises(R)`: recoverable escalation, which **bypasses** ordinary
  `catch` and `trap` and may reach eligible `recover`.
- `panics(P)`: terminal application failure, never recoverable by
  the failing actor itself; supervisor CONTROL remains mandatory.
- `suspends`: effect tracked orthogonally to failure and required
  where an operation can yield/backpressure.
- The returned `Result<T,E>` and `Option<T>` are **values**, not
  hidden exception effects. Returned `Err` / `None` create
  mandatory **checked-value obligations** at their consuming site.

Initially the compiler may conservatively use built-in Error for each
failure effect. Once nominal Error subtype sets are supported, preserve
types through the full call graph. An unresolved/foreign call is not
pure by default: require a trusted signature or reject the program.

Function values and lambda signatures must carry effect information,
not just named functions. An unannotated lambda may infer effects
locally; a public or declared effect bound is checked as an upper
bound. Higher-order composition uses polymorphic effect variables
rather than silently assuming callbacks cannot fail.

## Transfer rules

| Expression or operation | Effect and handling obligation |
| --- | --- |
| `a |> f` | Single `f(a)`; union of effects from evaluating `a`, `f`, and the call |
| `f <| a` | Same application semantics and failure types; no reverse error channel |
| `a |> f |> g` | Union of reachable stage effects; failure in `f` prevents `g` from running |
| `trap expr` | Removes only captured ordinary `throws(F)` and creates `Result<T,join_error(...,F)>` must-use obligation |
| `expr?` | Propagates the original Err/None through a compatible enclosing return; it does **not** discharge the caller's obligation |
| Exhaustive typed `catch` | Discharges only the source `throws` variants actually matched; unmatched variants remain |
| `recover` | Discharges a raise/eligible unhandled throw only when all reachable branches provably return a compatible recovered value; `cursor.next()` preserves the effect |
| `panic` | Never discharged by catch/trap/recover; actor supervisor/root fatal policies apply |
| `pipe` / `rpipe` | Graph setup yields a checked `Result<PipeHandle,PipeSetupError>`; asynchronous stage outcomes belong to the handle/lifecycle and are observed via `get_done()` |
| `sink << x` / `source >> val x` | Exactly one checked I/O operation with its typed returned outcome; no silent EOF/Err conversion |

`A rpipe B` reverses the graph edge, **not** the direction in which
a stage transforms input and output, and not the meaning of throw/raise.
`|>` and `<|` remain one-value functional application and **never**
implicitly lift `Result` or map `Err`. Programmers use `?`,
`map`, `and_then`, and `map_err` intentionally.

Synchronous graph construction and asynchronous stage execution are two
different failure domains. A successful connection does **not** prove
the graph has completed successfully.

## Proof boundary: typed graphs and actors

For a graph stage `S_i : In_i -> Out_i ! ε_i`, infer each stage's
input/output types, typed local failure effects, ownership, and
suspension. Validate directed edges and Sendable constraints. Build
one checked graph; constructor operands are evaluated **once in written
lexical order** before an atomic activation.

- Setup errors must fail the whole admission atomically; partially
  allocated ports/streams are not published.
- Post-admission ordinary stage failure settles the owned handle as a
  typed terminal `PipeError` with the stage identity/cause and
  original error identity where representable. It is not stream DATA
  unless the item type explicitly carries `Result<_,_>`.
- Stage `raise` or `panic` cannot be intercepted by a different
  actor's ordinary `catch`/`trap`. Supervisor CONTROL remains an
  independent priority path. Handle completion may additionally
  reflect a terminal failure, but it cannot acknowledge or suppress
  the CONTROL notice.
- Failure, EOF, cancellation, and backpressure must preserve linear
  ownership, one-shot settlement, exactly-once cleanup (where guest
  execution is possible), and visible partial progress. A pending
  write with unknown commit outcome must not silently retry.
- `PipeHandle` is affine/owned: leaving scope requires a proved
  `get_done()` observation, explicit ownership transfer to a structured
  parent, or an explicit checked cancellation/teardown policy. Merely
  discarding it cannot mean success. A passive observer is not a
  substitute for consuming the result.

Do not convert a stage throw to `Err` in the source stream by default:
this would mix **DATA** and **CONTROL/lifecycle** and could hide
terminating a failed actor.

## Static must-handle policy

1. `Result<T,E>`, `PipeHandle`, `Future<Result<...>>`,
   checked channel sends/reads/writes, and `get_done()` results are
   must-use. A bare statement (or discard binding) cannot silently
   ignore them. Prefer an error over Rust's default warning for
   intentionally unconsumed recoverable failures.
2. Matching a Result is considered handled only if the match is
   exhaustive or the remaining error is explicitly propagated.
   `Err(e)` arms that merely fall through without a defined policy
   require an explicit acknowledgment operation with rationale (no
   implicit underscore ignore). An explicit acknowledgment is a
   policy exception, not proof of successful recovery.
3. `?` is legal only when the enclosing function's return type can
   faithfully represent the propagated failure. A `Result` error
   is never transformed into a throw, raise, or panic by `?`.
4. `finally` and registered `defer` run on every supported return,
   failure, and cancellation path. An early `?` must traverse the same
   cleanup CFG as a return and retain the original tagged value.
   Unspecified `?` inside cleanup/recover/finally fails closed.
5. `recover` is dynamic: merely registering a callback, or having
   a `cursor.next()` path, cannot statically make an escaping effect
   disappear. Partial recovery remains a declared effect.
6. A top-level application or supervised task must provide an explicit
   policy for an escaping Result/ordinary throw/raise; for actor panic,
   a supervisor is the boundary, **not** a local catch. Forced
   termination and foreign/host traps are outside source-level proof.
7. Unknown generic error joins, effect polymorphism, asynchronous
   handle transport, and exception-safe unwind must fail closed on
   backends that cannot implement the proof obligations.

## Compiler implementation model

Preserve the syntax and semantic distinction in HIR/MIR; do not
rewrite everything to an untyped generic exception:

```text
FailureSummary {
    value_type,
    throws: TypeSet,
    raises: TypeSet,
    panics: TypeSet,
    suspends: bool,
    checked_values: [MustHandleObligation],
    graph_exits: [OwnedHandleObligation],
    cause_provenance: [OriginSpan],
}
```

At each function, lambda, method, receive handler, and stage:
derive a conservative summary, compute the least fixed point over
recursive and mutually recursive call graphs, verify declared effect
upper bounds, and reject any unhandled residual effects at a
non-propagating boundary. A conservative overapproximation may reject
safe code; an underapproximation must never certify code as safe.
Keep graph stage IDs, original call-site spans, and return-vs-throw
provenance for deterministic diagnostics.

Candidate diagnostics:
`E_EFFECT_UNHANDLED`, `E_RESULT_IGNORED`,
`E_PIPE_UNOBSERVED`, `E_PIPE_STAGE_EFFECT`,
`E_TRAP_ERROR_JOIN`, and existing `E_UNSUPPORTED` for absent backend
capabilities. New diagnostic names are proposals; do not claim they
already exist in the compiler.

## Minimum conformance matrix

Every source fixture must assert diagnostics or actual guest output
and **no guest artifact for negative tests**:

1. Both `|>` and `<|` are equivalent under pure single-stage use.
2. Two and three-stage functional composition propagates a `Result`
   only with explicit `?`/`and_then`; a later stage is not called
   after failed early propagation.
3. A stage ordinary throw reaches nearest eligible catch/trap;
   a matching trap yields `Err(original Error)`.
4. A stage returning `Err(E)` remains a returned Err, not a throw,
   and `trap` does not erase or nest it.
5. Lossless `join_error(E,F)` succeeds; unsupported joins produce
   `E_TRAP_ERROR_JOIN` and no guest.
6. `raise` bypasses ordinary catch/trap and reaches eligible recover;
   `cursor.next()` does not count as a proof of recovery.
7. `panic` bypasses local catch/trap/recover and produces exactly one
   authenticated supervisor CONTROL notice.
8. `pipe`/`rpipe` have equivalent graph direction but preserve
   their own written constructor evaluation orders.
9. Setup error emits no partially active graph/escaped binding.
10. Asynchronous stage failure produces typed `get_done()` failure,
    not construction-time trap success.
11. Dropping/ignoring a `Result`, `PipeHandle`, or completion Result
    fails under the must-handle policy.
12. EOF, `Option.None` payload, `Result.Err`, cancellation and
    panic are pairwise distinct terminal/data categories.
13. Failed `?` runs nested finally then LIFO registered defers
    exactly once, preserving the original tagged Error/Err.
14. Inner actor failure does not reach an unrelated parent actor's
    ordinary `catch`; CONTROL and lifecycle settle separately.
15. Unknown callback effects, missing stage error types, or unsupported
    backend unwinding produce deterministic fail-closed diagnostics.
16. Native Rust and wasm32 compiler paths produce byte-equivalent
    guest output on supported fixtures; actual guest execution, not
    parser-only or host model tests, verifies runtime claims.

## Stronger optional formal verification

A type/effect checker proves **accounting**, not business correctness.
For critical checker invariants (lossless `Err` preservation, linear
handle settlement, no double delivery, and total case exhaustiveness),
consider a separate executable model or deductive verification using
a Rust-oriented verifier such as Verus or Creusot. Do not report such
proofs as completed until specifications and actual verifier output
are checked into a reproducible CI receipt with tool versions,
source SHA, proof assumptions, and verified scope.
