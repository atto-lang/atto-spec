# Owned/shared handles and suspension safety — AttoLang proposal v1

Status: **PROPOSED / NOT ACCEPTED / NOT IMPLEMENTED** (2026-11-15). This document is a candidate specification, not evidence that any backend compiles or runs these constructs. The executable Rust/Wasm ownership-bang subset is tracked in atto-source.rs PRs #139 and #157.

## Compatibility and syntax boundaries

- Existing prefix operators retain their spelling: `borrow! owner`, `borrow! mut owner`, `take! owner`, `copy! value`, and `share! value`. Parentheses group an operand but are not a call ABI. Do not replace these with `&`, `*`, or `borrow_mut!`.
- `Box<T>` and `Arc<T>` are **proposed nominal library/runtime types**. Illustrative `Box.of(...)`/`Arc.of(...)` constructors below are *not accepted syntax contracts* yet; constructor overloads, allocation effects, and exact import paths need their own review.
- Keep `val`, `val mut`, `let`, `let mut`, `const`, and `const mut` distinct. Binding rebinding is different from referent mutation. A `mut` name cannot override a final field, a loan, an actor critical boundary, or an ownership transfer.
- A compiler may return `E_UNSUPPORTED` instead of lowering any not-yet-verified profile. Parsing a type name or accepting a host representation is **not** evidence of guest support. Callable type declarations continue to use `=>`; runnable/lambda bodies use `->`.

## Proposed ownership invariants

1. **Unique owner**: `Box<T>` holds one transferable owned handle. `take!` transfers exactly once and invalidates the former owner across all reachable control-flow successors. No implicit copy, clone, or cross-actor forwarding. Borrowed views never become owned handles.
2. **Loan provenance**: Every borrowed view records its owner, region, mutable/exclusive mode, and generation. Read loans may coexist; a mutable loan is exclusive. A transfer, owner reassignment, destructor, or arena retirement cannot occur while any reachable loan is live. Owner moves in repeated loop conditions/updates must be checked on every iteration path.
3. **Immutable shared handle**: `Arc<T>` may be cloned/shared only when `T` has an independently verified share-safe immutable contract. `share!` on an ordinary mutable class or raw `Pointer<T>` is forbidden. `Arc<Atomic<T>>` would require explicit atomic operations and backend-specific memory-order evidence; `Arc<T>` does not grant mutation by itself.
4. **No hidden alias**: Method receivers remain valid during argument evaluation (including nested calls). Receiver captures, returns, field projections, and aggregate members require explicit result/field provenance; type equality alone is insufficient. Ownership joins in `if`, `match`, `select`, and ternary expressions use the possible fallthrough paths, not the source's textual order.
5. **Actor transfer is separate from encoding**: `Sendable` concerns ownership/isolation safety for in-process actor mailbox transfer. `Serializable` is a separate wire-encoding contract; neither implies the other. A non-sendable handle, loan, arena address, mutable class alias, `Pointer<T>`, or untrusted foreign pointer cannot cross an actor mailbox merely because it has a serializer. Preserve linearizable mailbox admission and sender invalidation only on successful transfer.
6. **Isolation by domain**: Java/GraalVM, LLVM, Rust/Wasm workers, Forge, and .NET NativeAOT must validate independently that every transferred capability belongs to its permitted heap/isolate/arena and survives only while a valid owner exists. A browser Worker posting a MessagePack or structured clone payload is not a proof of shared-memory pointer safety.

## Suspension, cancellation, and failure rules

- **Conservative v1 rule:** Reject *all* borrowed class/Box views that would remain live across `await`, `select`, actor-send suspension, task cancellation boundaries, or scheduler migration until the compiler proves a pinned frame plus owner lifetime and cancellation cleanup. In particular, mutable loans may never silently survive those boundaries.
- `suspend critical-read` and `suspend critical-write` do not implicitly make locks safe to retain across awaits. Actor state stays sealed behind `handle_state(critical-read |s| -> ...)` and `handle_state(critical-write |s| -> ...)`; the scheduler must show lock release, writer exclusion, and no leaked borrow on every exit.
- `throw` is catchable by nearest eligible `try/catch`; an uncaught throw escalates to `raise`. `raise` bypasses local catches to the nearest `defer/recover`; an unhandled raise becomes `panic`. Actor panic goes exclusively to the supervisor CONTROL path; a failing actor cannot intercept its own panic.
- A **normal** scope exit or controlled unwinding must run the defined cleanup/drop actions exactly once. A fatal Wasm trap, unchecked host termination, or hard process abort must not be falsely described as recoverable or as guaranteeing destructors. A runtime claiming stronger physical reclamation must supply explicit tested evidence.
- A blocked mailbox send, rejected send, or cancelled send must not silently consume the sender's owned handle. The admission linearization point determines whether ownership transfer committed; a successful send and corresponding receiver retirement must be accounted for exactly once.

## Illustrative *not-yet-accepted* syntax

```atto
// Proposal only: Box.of and Arc.of APIs are not yet accepted.
val Box<Parcel> one = Box.of(new Parcel());
val Box<Parcel> two = take! one;   // after this, one is invalid

val Arc<Snapshot> shared = Arc.of(new Snapshot());
val Arc<Snapshot> another = share! shared; // immutable only
// share! new MutableParcel() is rejected without a verified share contract
```

## Registry semantics and transactional mailbox ownership

The companion `ownership-lifetimes-v1.json` contains **illustrative, often incomplete source fragments** and runtime scenarios. They are **not executable AttoLang programs** and must never be fed to a conformance runner as if they compiled. All backend statuses are `NOT_EXECUTED`, even where the Rust/Wasm ownership work offers an independently tested *precedent*. A precedent is not proof of this proposed future `Box`/`Arc` contract.

The expected outcomes have different meanings:

| Expected outcome | Meaning |
|---|---|
| `compile_accept` | A complete future fixture should type-check and lower |
| `compile_reject` | A complete future fixture should produce a precise compile-time diagnostic without any guest artifact |
| `runtime_success` | A successfully compiled fixture must emit and execute, and specified runtime observations must hold |
| `runtime_invariant` | A separately instrumented runtime trace must satisfy the specified invariants; the scenario need not be rejected at compile time |

**A failed mailbox send is not a compile-time error.** It is a runtime admission outcome. Because evaluating `take! owned` may otherwise invalidate the source before `send` knows whether admission succeeded, backends must implement an explicit *two-phase ownership transfer*: stage a transferable payload, commit exactly once only when mailbox admission is accepted, and on rejection/cancellation restore a unique recoverable owner without duplicating it. Whether the rejected `Result` returns the payload or the original binding remains usable is **not decided**; test this choice before accepting the API. A rejected/closed mailbox must not silently leak or destroy the payload.

Similarly, a valid `throw Error(...)` or a recoverable `raise` is not a compile-time rejection. The safety property is exactly-once cleanup during controlled unwinding; fatal host aborts and Wasm traps must not be mislabeled as recoverable. Returning a **copied scalar field** from a borrowed parent need not escape its lifetime; the forbidden example concerns returning an **owned child handle** without nested-loan provenance.

## Mandatory conformance evidence before acceptance

1. Create a typed MIR ownership ledger containing owner id/generation, loan region, transfer outcome, source span, and cleanup obligation. Do not rely only on variable names or Wasm local indices.
2. Provide positive guest executions and negative compile-fail cases for move-after-use, loan escape, conflicting loans, nested receiver aliasing, ternary/if/match joins, loop back-edges, drops/early return, mailbox rejection, cancellation and await/select. The companion JSON is a **proposed case inventory**, not an executed-test receipt.
3. Distinguish `UNSUPPORTED`, `FAIL`, `PASS`, and `NOT_EXECUTED` for every backend and fixture. Host-only fake actor traces, parser-only tests, source-to-JS syntax transpilation, and mocked workers are not `COMPILED_ATTO_GUEST` evidence.
4. For real compiled guest tests, record exact upstream source commit and Git tree, compiler and runtime artifact SHA-256, build command/toolchain, output/exit, diagnostic code, and the unique test ID. Require native/Wasm byte parity where they purport to emit the same module; document differences across JVM/LLVM/.NET/Forge separately.
5. Keep source-org required checks and independent reviewers intact. An alternate private Actions carrier may execute an exact blob-hash-verified, reconstructed tree when budget is exhausted, but must not forge required CI conclusions or publish a private compiler binary. Public promotion requires independent digest approval and protected release workflow.

## Open design decisions

- Whether `Box<T>` and `Arc<T>` are built-in types or prelude-defined nominal abstractions, and canonical allocation constructor names.
- What `Sendable` implementation rules and negative trait bounds are permitted, including generics and actor-to-worker transport.
- Whether any read loan can cross suspension under a pinned, uniquely owned frame and how cancellation/restart deallocates the owner.
- Memory-ordering and real-time allocation budgets for atomic shared types, plus exactly-once destructor/cleanup semantics under controlled unwinding.

**Merge policy:** Accept this as a proposal only after language-spec and runtime owners agree; do not mark backend support or promote compiler artifacts based on this text.
