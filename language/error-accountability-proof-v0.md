# Inductive error-accounting proof system for AttoLang (v0 research contract)

**Status: proposed formal design, NOT a completed soundness proof.**
This refines [pipeline-effect-proof-v1.md](pipeline-effect-proof-v1.md),
[checked-throws-annotation-v1.md](checked-throws-annotation-v1.md), and
[trap-result-v1.md](https://github.com/atto-lang/atto-spec/blob/feat/trap-result-contract-20261117/language/trap-result-v1.md).
It concerns `throw`, `raise`, `panic`, returned `Err`/`None`,
actor CONTROL notifications, and owned asynchronous pipeline outcomes.

## 1. Two different proof targets

**Safety (unconditional only relative to an explicit operational model):**
Every source-level modeled failure created by an admitted program remains
(a) uniquely owned by a live continuation, checked value, lifecycle owner,
or supervisor queue, or (b) has a terminal disposition: handled, returned
to an explicit owner, recovered, or escalated to an admitted supervisor/root
policy. No error may be lost, cloned into two independently resolvable
failures, silently rewritten as success, or classified into a different
failure channel.

**Liveness (necessarily conditional):** Every pending failure eventually
reaches a terminal disposition if scheduler fairness, reliable notification
transport, responsive supervisory policy, and the modeled fault/resource
assumptions hold. An infinite loop, OS kill, power loss, engine crash,
unknown host/FFI behavior, or permanently unavailable supervisor can
invalidate liveness without violating the static safety argument.

Do **not** call a `panic` "recovered". Its admitted terminal disposition
is supervised termination/root fatal policy. The strongest practical
guarantee at the actor boundary is *one logical incident identity* with
authenticated, replay-protected CONTROL and explicit failure settlement.
Physical delivery can be retried, and must not be described as exactly
once without a separately proved durable transport and failure model.

## 2. Formal entities

Let `K = {throw, raise, panic}`. Let `ErrorTy` be the closed-world
set of nominal `Error` descendants with operation-specific capabilities.

An **effect row** `ε = (Th, Ra, Pa, Susp)` has three *sets of types*
and a suspension bit. Subtyping is coverage: a declared supertype
covers all provable escaping subclasses of the same kind; it never
covers a different kind. An absent declaration and an explicit empty
declaration are distinct pieces of declaration evidence.

Use the typing judgment:

```text
Γ; Ω ⊢ expression : T ! ε ▷ Ω'
```

`Γ` is the type environment. `Ω` is a *linear obligation context*
containing checked `Result`/`Option` and `PipeHandle` owners.
`ε` describes potentially escaping exceptional effects, while
`Ω'` describes obligations after evaluation. A returned `Err` is
not a `throw`; it remains in `Ω'` until observed or transferred.
`Result<T,E>` and `Future<Result<T,E>>` must never silently decay
to a pure value.

For an emitted failure `e`, track ghost metadata
`(incident_id, actor_id, generation, kind, original_payload,
origin, cause, state, owner)`. The source error kind and original
payload identity never change during transfer. An escalation creates
an *escalation event* linked to the same incident, not an unrelated
anonymous error that can hide the cause.

A **logical owner** is exactly one of: current frame/unwind context,
checked `Result` value, structured future/task, pipeline handle,
actor supervisor CONTROL queue, or root terminal policy. Repeated
physical notifications refer to the same incident/generation and
must deduplicate; they are not multiple logical owners.

## 3. Compositional transfer rules

An informal core calculus (all expressions evaluated exactly once):

```text
effects(f(x))      = effects(f) ∪ effects(x) ∪ effects(body(f))
effects(x |> f)    = effects(f(x))
effects(f <| x)    = effects(f(x))
effects(e1; e2)    ⊆ effects(e1) ∪ effects(e2)  [account for reachability]
effects(if c a b)  ⊆ effects(c) ∪ effects(a) ∪ effects(b)
effects(throw e)   = effects(e) ∪ {throw(type(e))}
effects(raise e)   = effects(e) ∪ {raise(type(e))}
effects(panic e)   = effects(e) ∪ {panic(type(e))}
```

Set union above is deliberately a conservative overapproximation;
a production checker must evaluate handler scopes, dynamic dispatch,
`defer`/`finally` and reachable branches soundly.

A typed `catch(T)` may discharge only `throw(U)` for which it
*exhaustively* covers the applicable nominal types. A thrown type not
covered remains in the exceptional effect row. `trap e` discharges
only ordinary `throw`, converting a caught original Error into
`Err(original)` and creating a must-handle returned-value obligation.
`raise` and `panic` must pass through `trap` unchanged.
`join_error` must preserve discriminant, subtype, payload and identity;
unsupported joins fail closed.

A `recover` can discharge a `raise` or *eligible unhandled*
`throw` only if every reachable recovery branch returns a compatible
recovered value without delegating and the two-phase caller
catch-before-recover ordering is preserved. A branch ending in
`cursor.next()` leaves the original failure pending.
A `panic` is **never discharged by catch/trap/recover** in the
failing actor. `defer` and `finally` are separately effect checked.
If cleanup fails during pending unwind, neither the original nor the
cleanup error can disappear: retain precedence and bounded, linked
suppressed causes.

For `pipe`/`rpipe`: construction yields an owned checked
`Result<PipeHandle,PipeSetupError>`; later stage failures are carried
by a separate checked `get_done()` outcome and actor CONTROL where
necessary. Graph stage effects are checked in actual source-to-sink
direction regardless of written `rpipe` order. A successful setup
does **not** prove later pipeline completion.

## 4. Inductive theorem and proof obligations

Assume a *closed*, fully resolved, admitted AttoLang program with:
(1) a type/effect checker proven sound for the modeled source subset;
(2) no unchecked cast, unmodeled FFI, undefined behavior or fabricated
Error identity; (3) a runtime refining the typed operational semantics;
(4) a correctly implemented linear obligation/ownership discipline;
(5) declared actor/root boundary policies for residual escaping effects.

**Candidate theorem (accountability preservation):**

```text
WellTyped(P) ∧ Admitted(P) ∧ Accounted(S0)
    ∧ (S0 →* S)
    ⇒ Accounted(S)
```

Where `Accounted(S)` states: for every emitted incident, either a
single live logical owner holds the pending obligation, or exactly
one terminal disposition exists, and all secondary errors are
accounted for as separately linked incidents.

Prove the base case: the initial configuration has no unowned
incidents and valid empty ownership context. Then induct over
small-step execution:

1. Normal computation creates no new exceptional obligations.
2. `throw`/`raise`/`panic` creates exactly one fresh incident
   obligation with the source kind and payload.
3. Function call, return, recursion, lambda invocation, and suspension
   transfer—not copy—ownership and preserve the original kind.
4. Matching `catch` and `trap` consume only the ordinary throw
   channel; `trap` creates a checked result owner in the same step.
5. Exhaustive `recover` discharges an admitted throw/raise;
   `cursor.next()` transfers its original incident unchanged.
6. Panic bypasses all local handlers and transfers to an authenticated
   supervisor/root policy; unverified runtime support is rejected.
7. Scope unwinding and `?` run cleanup exactly once where admitted;
   separate linked suppressed errors never overwrite the original.
8. `pipe` admission/rollback, stage termination and `get_done()`
   transfer an owned outcome, preserving partial-write uncertainty.
9. Checked `Result`/future/pipeline owners must be consumed, delegated
   to an owning structured parent or explicitly terminated according
   to a typed policy; a mere discard is a typing error.
10. Host/runtime faults outside this model are reported as *excluded
    assumptions*, never misclassified as proved source-level panics.

Every transfer must establish `Accounted(S')` from
`Accounted(S)`. Cover all IR instructions and every exceptional CFG
edge, including recursion, loops, async suspension, cancellation and
multiple concurrently active actors. A missing rule is a proof gap,
not permission to treat a branch as unreachable.

**Closed-program corollary:** If the root has no unmatched
`throws`/`raises` and every possible `panic` has an admitted
supervised/root-fatal disposition, then no modeled effect escapes
without an explicit policy. This is *not* a theorem that the runtime
never panics or that a recovery strategy produces a correct value.

For conditional eventual disposition, prove temporal progress under
stated fairness, bounded resource assumptions and fault model.
Inductive safety alone does not establish `eventually`.

## 5. Proving the actual implementation

**Milestone A — executable formal semantics:** Specify a minimal
small-step calculus and generate an independent finite-state reference
model. Inject negative mutations (drop, duplicate, reclassify,
double-complete, swallow raise/panic) and require counterexamples.
Bounded exploration is evidence about the model, **not** a proof of
unbounded Atto execution.

**Milestone B — verified Rust checker:** Extend the current three-bit
`FailureEffects` to a typed lattice with explicit per-kind declared
presence, nominal type-set coverage, higher-order callback effect rows,
unknown-call conservatism, and a fixed point for mutually recursive
functions. Express soundness conditions and implement them in Verus
or Creusot on the **actual** analyzer functions, using inductive lemmas
for the typing/transfer rules. Avoid unexamined `assume` or external
bodies; audit every trusted assumption.

**Milestone C — unwind + obligations:** Verify each typed MIR branch,
`defer/finally` cleanup, `?` propagation, `recover` delegation,
and must-use owner retirement. Prove catch-before-recover precedence,
Error identity, no discarded result, and no double dispose.

**Milestone D — actors and continuous pipelines:** Use an explicit
state-transition specification (TLA+/Apalache or equivalent) for
mailbox/supervisor/CONTROL/handle settlement; model check adversarial
interleavings and show a refinement mapping from runtime events to
logical incident states. Prove one logical incident/owner; require
actual runtime receipts before claiming delivery or scheduler liveness.

**Milestone E — backend parity:** Require all executing backends to
refine the *same typed MIR and error state machine*, with SHA-pinned
guest traces, negative no-codegen cases, and distinct foreign/host
fault categories. A failed compiler run is not the same as a
pre-runner GitHub Actions admission failure.

**Proof ledger per theorem:** identifier; semantic version; program
subset; assumptions; statement; implementation SHA; verifier/tool
version; discharged obligations; excluded cases; CI/guest receipts.
Use statuses `PROPOSED`, `MODEL_TESTED`,
`VERIFIER_PROVED`, `GUEST_VERIFIED`, or `UNSUPPORTED`.
Never equate one with another.

## 6. Important adversarial counterexamples

Reject or expose these instead of falsely certifying them:

- `@Throws()` on a function that calls a potentially throwing callback.
- A `catch(IOError)` mistakenly erasing independent `ParseError`.
- `trap` swallowing `raise` or `panic`, or replacing `Err(e)`
  with `Ok(...)`/`None`.
- `recover` with one branch delegating via `cursor.next()`,
  falsely claiming total recovery.
- A `defer` raising while a different throw is pending and silently
  overwriting the original cause.
- A Result-returning function whose `Err` is ignored at a call site.
- A graph setup succeeds but stage later fails and `get_done()` is
  never consumed.
- An actor panic misrouted into ordinary stream DATA, or a duplicate
  supervisor CONTROL delivered as two independently settled incidents.
- Unverified native/foreign code designated pure by default.
- A backend that parses the effect annotation but emits a guest
  with no corresponding unwind, supervisor, or ownership semantics.

Do not make a *global* "all errors handled" product promise until
the specific soundness and runtime refinement theorems are machine
checked and the remaining environmental assumptions are published.
