# AttoLang resource typestate v1 — proposed contract

**Status: TARGET specification + canonical host-only oracle candidate. NOT enabled in `.atto` compilers or certified for guest execution.**

## Goal and representation

Resource typestate is a **compile-time property of an owned capability**, not a second actor kind, a runtime type tag or a replacement for ownership. A resource has a nominal, module-authenticated protocol ID and a finite set of legal states. Method signatures carry required pre-state(s), post-state(s), receiver access mode, effects and failure outcomes. An unspecialized/foreign/dynamic receiver without verifiable protocol metadata **fails closed**; checking a nominal name string is insufficient.

Examples of desired type-indexed API (illustrative TARGET syntax; not claimed to compile yet):

```atto
// Simplified infallible contracts for illustration; production I/O returns
// Result with explicit resource ownership in every success/failure variant.
fnc open_file(string path): File<Open>;
fnc close_file(take! File<Open> file): File<Closed>;
fnc read_file(File<Open> file): Bytes;

pub fnc main(): int {
  let file = open_file("log.txt");
  let closed = close_file(take! file);
  // read_file(file);  // E_MOVED: ownership was transferred
  // read_file(closed); // E_TYPESTATE_ILLEGAL_OPERATION: Closed is not Open
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

## Ownership and loans

- `take!` transfers the **current typestate and unique capability**. The source is unusable; the destination may be used only according to its actual state. Transfers into an already-live owner are rejected. No implicitly consuming ordinary argument calls.
- An ordinary nonprimitive argument, or explicit `borrow!`, is a **scoped readonly loan**. Only declared state-preserving readonly actions are allowed through it. No `close`, `commit`, `connect`, `finish`, `drop!`, transfer or state refinement through a shared loan.
- `borrow! mut` / `mut` on a proven writable referent gives an **exclusive loan**; state transitions may be admitted through that loan when the full declared method effect is known. Mutable loans exclude shared loans, moves, drops and direct owner access until end-of-loan. No silent mutation through a readonly formal.
- `copy!` is not a way to duplicate a unique resource capability; a type's `Copy` proof must explicitly exclude unique external authority. `copy!!` clones data, **not** a file descriptor/socket/transaction identity unless a separately defined resource duplication capability proves a fresh independent instance. `share!` cannot erase protocol or mutable-alias restrictions.
- Borrowed views cannot outlive their owner, cross `await`/`select`/task cancellation or an actor boundary without the existing independent lifetime, pin, Send and cleanup proofs. A transferred actor handle retains its resource protocol/epoch; actor message protocol typestate is separate but can compose with resource typestate.

## CFG and checked effects

1. Name/type/effect resolution binds a **closed nominal protocol ID**, method contract and current owner root before call lowering. Compiler-generated MIR carries `Init`, checked readonly `Call` / exclusive `CallMut` / `CallThrough`, `Borrow`/`EndBorrow`, `Take`, `Drop` and **all** explicit/implicit exits. Import aliases, monomorphization, hot loads and AOT linkages must preserve protocol fingerprints.
2. Each basic block propagates a set of possible state indices for each live owner. At a join, **union** predecessor states (including may-be-uninitialized/moved). An operation is valid only if it is permitted in *every* possible state; a branch-local proof does not bleed into another branch. A state-preserving inspection may be legal on a union when all states allow it.
3. A call requires the declared receiver access mode and the compatible live-loan set. State transitions require exclusive access. An unresolved overload, callback, FFI operation, reflection, dynamic dispatch or effectful closure must fail closed unless complete verifiable effect summaries are supplied.
4. Every source exit—including error propagation `?`, `throw!`, `raise!`, `panic!` where applicable, `return`, `^`, `defer`/`finally`, cancellation and actor teardown—must verify deterministic release. `Closed`/terminal inert states can exit; a live state may exit only with an independently verified no-throw destructor/rollback on **all relevant exit paths**. A transaction whose `Active` state requires commit/rollback cannot silently disappear.
5. A method whose post-state differs by outcome must encode separate successor facts, not promise one uniform state on both paths. The present host oracle models only atomic, single-post-state actions and **rejects cycles and unsupported exceptional exits**. No source compiler may treat this restricted success as whole-program certification.
6. Checker budgets are explicit: 64 protocols, 128 states/protocol, 256 methods/protocol, 64 resource places, 1,024 unique loan IDs, 4,096 CFG blocks, 16,384 edges, 1,024 operations/block and 100,000 operations/graph. Exceeding a bound fails closed.

## Canonical model and implementation boundary

`atto-borrow-checker.rs::typestate_v1` is a **separate host-only acyclic CFG model**: it validates protocol inventories, tracks branch-state unions, move/drop and loan conflicts, blocks wrong-state calls, rejects missing initialization, and distinguishes `Inert`, `VerifiedDestructor` and `ExplicitTransition` cleanup states. `VerifiedDestructor` is a claim supplied by a trusted compiler adapter, **not proof of a destructor or of unwind/cancellation behavior**. The V1 model is not wired to `.atto` source parsing, typed MIR v1, the Rust/Wasm browser compiler, or any Java/LLVM/.NET/Forge/Wasm backend. Do not call it compiled-guest conformance.

Next admission gates: (1) parser/formatter treatment of an explicit, non-forgeable protocol declaration or metadata artifact; (2) typed HIR/MIR post-state and receiver-effect contracts with exhaustive effect census, checked generics and imports; (3) canonical borrow+typestate composition without double-counting/cancel escape; (4) positive/negative `.atto` fixtures for all four resources including exceptional edges, loops, aliasing, reflection and actor hops; (5) exact-head executed guest tests for every backend, with original/temporary mirror tree and per-blob SHA verification if Actions are blocked. A zero-step job is **NOT EXECUTED**.

**Minimum negative diagnostics:** `E_TYPESTATE_NOT_LIVE`, `E_TYPESTATE_ILLEGAL_OPERATION`, `E_TYPESTATE_LOAN_CONFLICT`, `E_TYPESTATE_MUT_BORROW_REQUIRED`, `E_TYPESTATE_INCOMPLETE`, `E_TYPESTATE_PROTOCOL_JOIN`, `E_TYPESTATE_LOAN_JOIN`, `E_TYPESTATE_UNKNOWN_METHOD`, `E_TYPESTATE_CFG_CYCLE`, and strict budget/invalid-protocol errors. These are canonical oracle diagnostics, not yet `.atto` compiler diagnostics.
