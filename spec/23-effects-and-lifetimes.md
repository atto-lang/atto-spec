# 23 — Effects, lifetimes, and actor-domain borrow safety

**Status: DRAFT TARGET, 2026-11-10. No backend certification.** This amendment tightens chapters [03](03-functions-and-effects.md), [04](04-ownership-and-memory.md), [06](06-async-and-scheduling.md), [07](07-errors-and-failure.md), and [22](22-concurrency-and-shared-ownership.md). The [machine-readable candidate contract](../contracts/attolang-effects-lifetimes-v1/contract.json) and `.atto` fixtures establish reviewable expectations, **not executed guest evidence**.

## Decision: Rust-grade safety, actor-native ergonomics

Adopt the *guarantees* of affine moves, immutable shared loans, exclusive mutable loans, flow-sensitive non-lexical lifetimes (NLL), initialized-before-use, and exactly-once owned resource release. Do **not** add Rust's `&` / `*` syntax or require users to annotate lifetimes in common code. AttoLang's canonical ownership forms remain `take!`, `copy!`, `borrow!`, `borrow! mut` and `share!` (subject to parser parity; legacy `rt` spellings are migration aliases under the current ownership contract).

All backends MUST enforce the same safety theorem: **an access is admissible only when the typed operation has both (1) a valid lifetime/ownership proof and (2) the required effect/capability admission.** Neither one substitutes for the other. The static checker must operate on typed CFG/MIR after macro expansion and checked call resolution, not on untrusted tokens or a host-library-only model.

### Three independent-but-composed dimensions

1. **Ownership/right:** exclusive owner identity, active compatible loans, move/drop state, projected field roots and derived aliases; exactly one semantic owning authority per owned region. Multiple readers are borrowers, not new owners.
2. **Region/lifetime:** flow-sensitive loan liveness and outlives constraints for stack, task frame, actor heap, immutable shared region, I/O lease and FFI resource; actor identity, region generation, supervisor epoch, and physical quiescence fence reuse.
3. **Effect and permission:** latent/transitive effect row, caller's admitted upper bound, and separately minted runtime authority. An effect annotation promises what *may happen*; `using`/capability/critical access cannot be forged by listing an effect.

A missing or ambiguous proof is **unknown**, never an empty effect set or a `'static`-like lifetime. Unknown imported code, callbacks, virtual dispatch, trait dictionaries, macro-generated calls, FFI and runtime intrinsics must fail closed in strict contexts until trusted summaries are supplied. Static dispatch and monomorphization can resolve effects ahead of time; dynamic dispatch requires a sealed verified effect bound without reflection.

## Effect rows and handlers

Effect rows are **upper bounds** under a subset relation. Their source spelling is pending grammar reconciliation between `with` and `using` in older backends; the semantic contract is independent of that choice. Compute them transitively across direct calls, closure captures, polymorphic callbacks, dynamic dispatch, constructors, destructors, task starts, futures, actor sends, pipelines and compiler-inserted operations. A `Future<T>` or `Task<T>` may carry **latent** effects that are checked at execution/await/subscription, not erased by construction. Do not equate `pure` with `no_alloc`, `no_throw`, bounded execution or termination. Observational purity prohibits ambient reads, writes, I/O, scheduler/time/RNG observation and unverified FFI, while invocation-private allocation and ordinary exceptional failure can have separate permitted facts.

Keep `throw<E>`, `raise<E>`, `panic` and authenticated cancellation distinct. `trap` may discharge **ordinary throw only**, after exactly-once cleanup; it does not discharge raise, panic, cancellation, I/O or other effects. Error effects are typed, not merely an unlabelled global `throw` bit. No host exception class can manufacture authenticated cancellation or a guest panic. Effects do not grant resource, tenant or actor capabilities.

`critical-read` and `critical-write` are **logical admission** plus lifetime-scoped state capabilities. They are not a declaration that a host mutex can be held across suspension. A protected region permits many compatible readers or one exclusive writer. The writer path must not starve indefinitely under the specified fair admission policy; nested same-continuation access must fence outer aliases during an inner exclusive scope. Forbid await, blocking I/O, carrier parking or guest callback escape with a live critical loan unless a separately proven pin/segmentation and revalidation protocol is implemented.

## Non-lexical lifetimes, actor restart, and suspension

Infer a loan's live interval from CFG use points and *all* exits (branch, loop, throw, raise, panic, defer, return, tail call, cancellation). End a loan at last actual use when safe, rather than artificially at the lexical end of a block. A move of a borrowed owner, a second incompatible loan, or a reference stored outside its owner's region is rejected. A copied scalar is independent of the originating loan; a projected borrow or readonly view is not automatically a copy.

Every `await`, `select`, `nb task`, `rt cooperate`, actor turn boundary, carrier migration, hot reload and cross-tenant/FFI call is a potential suspension or identity boundary. A loan may cross only when the owned allocation is pinned through the full continuation, the continuation has exclusive/non-interfering access, the compiler proves the lifetime, and cancellation/retirement is fenced. Ordinary actor-state/stack/request-view loans fail closed across suspension by default. Task/Future completion is *logical*; actor memory and I/O leases are not reclaimable until **physical quiescence** has been observed. Cancellation or restart does not silently forgive live loans.

Chapter 22 currently defines **concurrent-default actors** with `serial actor` opt-in as a target. Older serial/nonreentrant implementations are not evidence of that target. Either actor mode still needs the same ownership/effect rules; a serial scheduler is **not** a substitute for borrow checking. Supervision carries control authority, not an ambient mutable alias to actor state. Ownership transfer to a supervisor is a move with prior authority invalidated, never two owners; reclamation waits for outstanding loans and pinned continuations.

## Compiler and runtime proof boundary

- The frontend emits typed CFG/MIR effect rows, provenance roots, loan regions, projection paths, actor/tenant epochs and continuation/cancellation fences. Macro expansion, call argument evaluation order, destructors and tail-call lowering cannot erase this metadata.
- Codegen for Java/GraalVM, LLVM, .NET NativeAOT, Wasm, Forge and Cranelift consumes the *same admitted facts*; a missing feature must reject source instead of switching to unchecked host memory or reflection.
- FFI requires an audited, versioned ABI summary with ownership, thread safety, lifetime and effects; raw addresses are never an actor message or portable guest reference.
- Runtime uses fair non-parking reader/writer admission and generation-checked 32-bit actor-arena offsets/handles where applicable. Bounds, provenance and lifetime checking do not become optional merely because an actor is `serial`.
- Cleanup is exactly once on normal and supported failure/cancellation unwinds. Hard kill, OOM and host corruption cannot guarantee destructors; document that limit instead of claiming otherwise.

## Mandatory conformance and release gate

The candidate corpus covers use-after-move, incompatible loans, move while borrowed, last-use NLL success and borrow across suspension. Extend it with named effects, unknown indirect calls, latent Task/Future effects, trap/raise/panic separation, actor-state lock fairness, cancellation/physical retirement, supervisor restart epochs, FFI, cross-tenant transfer, and malicious projected aliases. Each rejection needs a **specific ownership/effect/lifetime diagnostic**, not any parser error. Positives need real same-byte guest execution and checks for exactly-once cleanup; native claims additionally need race/sanitizer or equivalent memory evidence.

Use compiler-head SHA, source tree, fixture blob, workflow blob, run/job attempt, nonzero meaningful runner steps, observed result and artifact checksum. Zero-step CI, source-free canaries, parser-only tests and a checked contract file are explicitly **not** guest parity. This PR is an auditable target only, not an assertion of implementation.
