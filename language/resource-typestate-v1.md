# AttoLang resource typestate v1 — proposed contract

**Status: TARGET specification + canonical host-only oracle candidate. NOT enabled in `.atto` compilers or certified for guest execution.**

## Goal and representation

Resource typestate is a **compile-time property of an owned capability**, not a second actor kind, a runtime type tag or a replacement for ownership. A resource has a nominal, module-authenticated protocol ID and a finite set of legal states. Method signatures carry required pre-state(s), post-state(s), receiver access mode, effects and failure outcomes. An unspecialized/foreign/dynamic receiver without verifiable protocol metadata **fails closed**; checking a nominal name string is insufficient.

Examples of desired type-indexed API (illustrative TARGET syntax; not claimed to compile yet):

```atto
// Simplified infallible contracts ONLY to illustrate resource typestate.
// Actual I/O contracts return typed Result outcomes, preserving resource
// ownership and cleanup responsibility on failure and cancellation.
susp fnc open_file(string path): File<Open>;
susp fnc close_file(take! File<Open> file): File<Closed>;
susp fnc read_file(File<Open> file): Bytes;

pub susp fnc main(): int {
  let file = await open_file("log.txt");
  let closed = await close_file(take! file);
  // await read_file(file);    // E_MOVED: take! invalidated the old owner
  // await read_file(closed);  // E_TYPESTATE_ILLEGAL_OPERATION: Closed is not Open
  return 0;
}
```

`File<Open>` and `File<Closed>` are **compile-time indexed views of one unique resource lineage**; the state index can be erased at the ABI only if link-time protocol/effect digests and ownership provenance agree. A `File<Closed>` must not regain an open capability through an unchecked cast, a generic substitution, a dynamic method, or FFI. The compiler also tracks flow-sensitive state on an owning local for in-place operations proved to require `mut`/exclusive access; a successful mutating method may refine the receiver's state without allocating a new resource. Ownership-changing APIs should generally prefer explicit `take!` in both formal and call sites.

Do not add fundamental `resource` or `actor` kinds merely for this: existing nominal classes/opaque types with compiler-authenticated static protocol contracts suffice. Proposed metadata syntax belongs in a separate parser/formatter RFC and must not be silently inferred from arbitrary user-defined methods named `close`, `connect` or `commit`.

## Illustrative protocol tables

| Resource | States | Legal transitions | State-preserving operations | Scope exit |
|---|---|---|---|---|
| File | Open, Closed | `close`: Open -> Closed | `read`/`write` only Open | Open: verified destructor only; Closed: inert |
| Socket | Disconnected, Connected, Closed | `connect`: Disconnected -> Connected; `disconnect`: Connected -> Disconnected; `close`: Disconnected/Connected -> Closed | `send`/`receive` only Connected | Connected: verified teardown or explicit transition; Closed: inert |
| Transaction | Active, Committed, RolledBack | `commit`: Active -> Committed; `rollback`: Active -> RolledBack | `query` only Active | Active: explicit commit/rollback or separately proved rollback guard |
| Builder | Unfinished, Consumed | `finish`: Unfinished -> Consumed | `append` only Unfinished | Unfinished: explicit finish/discard if protocol requires it |

The backend must not synthesize runtime discriminant tests for a state already proved statically. Runtime-dependent transitions return a **typed sum** or checked `Result` that preserves ownership in *every* alternative. On failure, the previous state is retained only when the operation's atomic-failure contract proves it; otherwise the result must express an explicit `Unknown`/`Failed` state, not a fictitious successful post-state.

## Asynchronous I/O, suspending effects and ownership escrow

**Mandatory:** File/network I/O, socket connect/send/receive/close, and any transactional or other operation that can wait for I/O must use the canonical `susp fnc` / `susp mtd` effect (source alias: `suspends`). Callers must `await` a suspending operation from a suspending context; neither ordinary `fnc` nor a non-awaiting call may hide blocking I/O, silently synchronously wait for a future, or erase suspension from a function value's type. CPU-only builder mutation may stay non-suspending when it cannot wait for I/O. See [suspension-effect spelling](susp-effect-shorthand-v1.md).

`await open_file(path)` produces an initialized `File<Open>` **only after a successful awaited completion**. A failed, timed-out, or cancelled acquisition must not publish an open owner; a partially opened OS resource must be released under an independently verified cancellation/unwind contract. The examples above deliberately omit `Result` only to focus on compile-time state indices, not to imply infallible filesystem operations.

For a consuming suspension, such as `await close_file(take! file)`, `take!` consumes the source owner at call/admission time, **before** suspension; the continuation/operation must own the live resource in an explicit pending/escrow state. The caller cannot read, close, transfer or drop it while pending. Successful completion yields `File<Closed>`; failed completion must return a typed outcome that identifies who owns the still-open, closed, or indeterminate resource, or establishes an independently verified cleanup. Never fabricate `File<Closed>` on error, silently restore the consumed `file`, or declare a resource inert merely because a future was cancelled.

The full typed-CFG contract must cover:
1. A versioned suspension effect on the callable/method signature and typed MIR, plus a distinct awaited-call operation or explicit begin/pending/resume transitions. A plain synchronous `Call` is **not** an acceptable representation of suspending I/O; missing `await` and effect erasure are errors.
2. An exclusively owned resource survives `await` in the continuation frame with protocol ID, incarnation, generation, current state, cleanup authority and pending transition. It is not automatically closed at each suspension point. No mutable/shared loan may be retained across suspension without a separately proven suspension-safe lifetime, pinned frame, cancellation fencing and alias-safety witness. Pending operations may not be duplicated, replayed, or sent to another actor by borrowing.
3. **Separate success, error, timeout and cancellation edges** for any potentially fallible in-flight transition. Each edge must settle the same linear pending authority exactly once, preserve the appropriate state and cleanup responsibility, and forbid any post-transition use while an outcome is unresolved. Early `?`, `throw!`, `raise!`, `return`, `defer` and task cancellation carry the same obligation.
4. Explicit resource cleanup on cancellation/timeout must be asynchronous when cleanup requires I/O, must not block an executor/actor thread, and must finish or securely transfer responsibility to a verified runtime owner before final task settlement. A synchronous destructor may release only an independently proven non-blocking resource; the existing `VerifiedDestructor` model flag alone does not certify async close.
5. A strict backend that has not implemented pending-ownership and all relevant outcome/cleanup edges must **reject** suspendable state-changing resource calls, rather than lower them to an optimistic synchronous success transition. A static oracle can model a fully authenticated, already-resolved outcome, but that host result is not executable async proof.

**Required negative source tests:** missing `await`, `await` outside `susp`, suspending effect erased by a callable type/indirect call, use after `take!` before or after suspension, live borrow across unsupported suspension, double completion, cancelled in-flight close that leaks an owner, unmodeled timeout/unwind edges, error falsely treated as Closed, and synchronous/blocking fallback. Successful guest tests must explicitly exercise resumed completion and cancellation races, not only parse syntax.

## Ownership and loans

- `take!` transfers the **current typestate and unique capability**. The source is unusable; the destination may be used only according to its actual state. Transfers into an already-live owner are rejected. No implicitly consuming ordinary argument calls.
- An ordinary nonprimitive argument, or explicit `borrow!`, is a **scoped readonly loan**. Only declared state-preserving readonly actions are allowed through it. No `close`, `commit`, `connect`, `finish`, `drop!`, transfer or state refinement through a shared loan.
- `borrow! mut` / `mut` on a proven writable referent gives an **exclusive loan**; state transitions may be admitted through that loan when the full declared method effect is known. Mutable loans exclude shared loans, moves, drops and direct owner access until end-of-loan. No silent mutation through a readonly formal.
- `copy!` is not a way to duplicate a unique resource capability; a type's `Copy` proof must explicitly exclude unique external authority. `copy!!` clones data, **not** a file descriptor/socket/transaction identity unless a separately defined resource duplication capability proves a fresh independent instance. `share!` cannot erase protocol or mutable-alias restrictions.
- Borrowed views cannot outlive their owner, cross `await`/`select`/task cancellation or an actor boundary without the existing independent lifetime, pin, Send and cleanup proofs; even synchronous-looking method syntax cannot conceal a suspending operation. A transferred actor handle retains its resource protocol/epoch; actor message protocol typestate is separate but can compose with resource typestate.

## CFG and checked effects

1. Name/type/effect resolution binds a **closed nominal protocol ID**, method contract and current owner root before call lowering. Compiler-generated MIR carries `Init`, checked readonly `Call` / exclusive `CallMut` / `CallThrough`, `Borrow`/`EndBorrow`, `Take`, `Drop` and **all** explicit/implicit exits. Import aliases, monomorphization, hot loads and AOT linkages must preserve protocol fingerprints.
2. Each basic block propagates a set of possible state indices for each live owner. At a join, **union** predecessor states (including may-be-uninitialized/moved). An operation is valid only if it is permitted in *every* possible state; a branch-local proof does not bleed into another branch. A state-preserving inspection may be legal on a union when all states allow it.
3. A call requires the declared receiver access mode and the compatible live-loan set. State transitions require exclusive access. An unresolved overload, callback, FFI operation, reflection, dynamic dispatch or effectful closure must fail closed unless complete verifiable effect summaries are supplied.
4. Every source exit—including error propagation `?`, `throw!`, `raise!`, `panic!` where applicable, `return`, `^`, `defer`/`finally`, cancellation and actor teardown—must verify deterministic release. `Closed`/terminal inert states can exit; a live state may exit only with an independently verified no-throw destructor/rollback on **all relevant exit paths**. A transaction whose `Active` state requires commit/rollback cannot silently disappear.
5. A method whose post-state differs by outcome must encode separate successor facts, not promise one uniform state on both paths. The original host oracle modeled only atomic single-post-state actions. Its new restricted pending-transition extension models an explicit four-outcome branch but still **rejects cycles, unsupported unwind and unverified runtime cleanup**. Ordinary `Call`/`CallMut` events never establish an awaited, cancellation-safe I/O transition. No source compiler may treat this restricted success as whole-program certification.
6. Checker budgets are explicit: 64 protocols, 128 states/protocol, 256 methods/protocol, 64 resource places, 1,024 unique loan IDs, 4,096 CFG blocks, 16,384 edges, 1,024 operations/block and 100,000 operations/graph. Exceeding a bound fails closed.

## Pending-transition host contract (P0, 2026-11-21)

The canonical oracle draft now exposes a restricted, compile-time **four-outcome asynchronous transition**. It models ownership and control flow, **not** a runtime future, an OS close syscall, or proof that a backend emitted the corresponding cleanup paths:

- `BeginAsync { from, pending, method }` is admissible only for a verified `susp`, exclusive, state-changing method with explicit `AsyncOutcomes { on_error, on_timeout, on_cancel }`. It consumes the source owner immediately into a **single pending escrow**. The old place is moved/unavailable before any suspension; no overlapping loans may exist.
- `AwaitPending { pending, into }` must be the last operation in its CFG block, with exactly four **distinct, ordered successor blocks**: success (index 0), ordinary error (1), timeout (2), cancellation (3). Each successor receives the resource exclusively under `into` with its protocol-certified state. Pending escrow is removed on each edge, exactly once.
- The success state comes from the resolved method's declared post-state. Every failure state is explicit, and can be `Open`, `Closed`, or `Indeterminate` only if independently warranted by the operation's ABI/atomicity contract; the verifier never guesses. An `Indeterminate` state requiring explicit transition is not droppable or returnable without verified cleanup. A declared rollback on cancellation is not evidence that the OS operation actually rolled back.
- A block cannot return with live pending escrow. Duplicate pending IDs, missing or extra outcome edges, outstanding borrows, an already-live result place, forged/unknown method states, repeated completion and incompatible pending joins must fail closed. The initial oracle supports at most one concurrent pending resource per CFG execution path, has a finite pending-ID budget, and rejects control-flow cycles.
- An awaiting call represented by `AwaitCallMut` still rejects state change with `E_TYPESTATE_ASYNC_TRANSITION_UNSUPPORTED`: lowering must use the escrow-and-four-outcome contract instead. Only a compiler-authenticated typed-MIR inventory can attest that the source await, result branches, unwind/cancellation and emitted code are complete.

No backend should interpret the four-path host model as a cancellation guarantee. In real execution, an abandoned task or hard actor termination may not execute an ordinary language-level cancellation continuation. A separate **runtime-owned, generation-fenced cleanup authority** or proven structured cancellation completion is required to settle the pending resource before retiring its owner; where unavailable, reject the program before guest-code emission. A resource-owning destructor that might perform I/O must be asynchronous, not a blocking hidden `drop!` or an unverified `VerifiedDestructor` flag.

**Additional required negative fixtures:** no fourth edge; duplicate target edges; pending escape; use/drop of moved source before/after await; double completion; wrong result state from error/timeout; missing cancellation contract; leaked `Indeterminate`; live shared/mut loan entering begin; conflicting pending owners at join; cancellation racing success; stale actor incarnation on completion; mismatch between source `susp` effect, typed MIR and emitted guest instructions.

## Canonical model and implementation boundary

`atto-borrow-checker.rs::typestate_v1` is a **separate host-only acyclic CFG model**: it validates protocol inventories, tracks branch-state unions, move/drop and loan conflicts, blocks wrong-state calls, rejects missing initialization, and distinguishes `Inert`, `VerifiedDestructor` and `ExplicitTransition` cleanup states. `VerifiedDestructor` is a claim supplied by a trusted compiler adapter, **not proof of a destructor or of unwind/cancellation behavior**. The V1 model is not wired to `.atto` source parsing, typed MIR v1, the Rust/Wasm browser compiler, or any Java/LLVM/.NET/Forge/Wasm backend. Do not call it compiled-guest conformance.

Next admission gates: (1) parser/formatter treatment of an explicit, non-forgeable protocol declaration or metadata artifact; (2) typed HIR/MIR post-state and receiver-effect contracts with exhaustive effect census, checked generics and imports; (3) canonical borrow+typestate composition without double-counting/cancel escape; (4) positive/negative `.atto` fixtures for all four resources including exceptional edges, loops, aliasing, reflection and actor hops; (5) exact-head executed guest tests for every backend, with original/temporary mirror tree and per-blob SHA verification if Actions are blocked. A zero-step job is **NOT EXECUTED**.

**Minimum negative diagnostics:** `E_TYPESTATE_NOT_LIVE`, `E_TYPESTATE_ILLEGAL_OPERATION`, `E_TYPESTATE_LOAN_CONFLICT`, `E_TYPESTATE_MUT_BORROW_REQUIRED`, `E_TYPESTATE_INCOMPLETE`, `E_TYPESTATE_PROTOCOL_JOIN`, `E_TYPESTATE_LOAN_JOIN`, `E_TYPESTATE_UNKNOWN_METHOD`, `E_TYPESTATE_CFG_CYCLE`, and strict budget/invalid-protocol errors. These are canonical oracle diagnostics, not yet `.atto` compiler diagnostics.
