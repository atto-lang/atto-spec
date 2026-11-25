# 22 — Concurrent Actors and Shared Ownership

**Status: TARGET amendment, 2026-11-10. No backend implementation certification.**

This amendment records the language owner's explicit concurrency and ownership direction. It supersedes the earlier serial-by-default draft statement in chapter 05. Existing compiler/runtime implementations must migrate through tested changes; accepting a declaration does not establish the runtime guarantee.

## Actor declarations and state

```atto
define actor ConcurrentWorker as
  state {
    let int count: 0
  }
end

define serial actor SerialWorker as
  state {
    let int count: 0
  }
end
```

These are declaration-shape examples, not executable conformance fixtures. Ordinary actors permit multiple active turns and execute on a multithreaded runtime. `serial` limits that actor to one live DATA `receive()` invocation, including suspension; independently invoked receiver methods may still run concurrently. It does not require a dedicated OS thread or make the actor single-threaded. Capacity and fairness are explicit runtime policy; concurrent permission does not promise simultaneous execution on every machine.

All mutable state containers, including actor `state {}`, are sealed. `critical-read` grants compatible immutable scoped loans; `critical-write` grants one exclusive scoped loan and excludes conflicting readers/writers. A compiler must reason about nested referents and aliases, not only the state variable's binding. Serial scheduling does not waive loan lifetime, escape, suspension or cleanup checks. State loans cannot outlive the region or cross suspension without an explicit proven safe continuation protocol.

The [attached state and lifecycle proposal](../language/actor-attached-state-and-lifecycle-v1.md) specifies one equivalent inline or nominally attached schema per actor incarnation. Successful mailbox admission is not proof of activation or execution; no receive may execute before definite initialization. Its syntax remains a target with independent parser, compiler and runtime gates.

## Critical scopes, scalar copy-out and actor-boundary effects

A critical callback is a compiler-owned lexical state loan, not a general
guest callback that may perform arbitrary effects. During a live
`critical-read` or `critical-write` scope, unproved suspension, mailbox
admission/commit, actor hops, task capture, foreign calls and I/O are
disallowed. Nested/reentrant scope admission must fail closed until a
separate deadlock-safe ordering contract is proved. Ordinary live borrows
that might alias the state cannot overlap critical admission unless the
compiler has authenticated non-aliasing provenance.

A compiler may copy out an independently owned **scalar** value from a
guarded actor field *within* the scope when its typed MIR proves that the
copy contains no reference, pointer, borrowed view, or capability into the
actor arena. The guard must be exited (and runtime reader/writer admission
released) **before** any mailbox send or suspension using that copy. The
current canonical Rust V0 oracle provides `CriticalCopyI64` for this narrow
`i64`-only operation; broader Copy types require separate recursive
ownership proofs. Merely naming an expression "copy" does not make
nested mutable referents safe.

An inline source expression such as `self.send(s.count)` inside a
`critical-read` body can be accepted only if the compiler can
**prove and lower** an effect-equivalent sequence: guarded scalar read,
owned copy-out, scope release, then nonparking send. Otherwise it is a
compile-time rejection, never a mailbox call holding the state loan.
In particular, the compiler may not silently change the ordering of
multiple side effects, drop error paths, or let a callback leak the state
view. The runtime must independently fence generation, physical
retirement, and canceled sends.

Cross-backend admission requires executed identical `.atto` tests for
safe copy-out/send-after-exit, denied send-during-loan, denied state-view
escape, read-only mutation, wrong-owner copy-out and failure cleanup.
Source-level AST acceptance or a host-only Rust MIR model alone does not
prove Java/Graal, LLVM AOT, or .NET NativeAOT behavior.

## Actor heaps and stacks

Every actor owns a guest heap/allocation domain and a logical stack domain. Custom arenas are an implementation strategy. Concurrent turns need distinct live frames/continuations within the actor's accounted stack domain; they cannot concurrently mutate one ordinary stack pointer. Stack overflow containment and quota accounting follow chapter 18.

Guest actor-heap references use checked 32-bit arena-relative offsets or handles. The runtime may run on a 64-bit host, and domain/generation metadata need not fit inside the offset. Each access checks the owning actor or explicitly shared domain, allocation generation, extent, alignment and arithmetic overflow. Never cast an arbitrary host pointer into a guest ref32. Exhausted arenas fail explicitly; additional arenas require explicit domain identity, not offset wraparound. Retirement waits for all physical frames, borrows and I/O uses to finish.

## Mailbox first, protected shared memory where admitted

The default communication path is the actor mailbox with bounded admission and explicit ownership transfer. Shared memory is permitted when a region retains exactly one owning authority and either one exclusive writer or compatible readers. A shared handle does not duplicate ownership. Transfer invalidates the previous owner's authority; reclamation waits for outstanding loans. Cross-tenant sharing also requires an explicit isolation permission and cannot be inferred from borrow safety.

Typed pipe endpoints may use the proposed `io.in` and `io.out` names. Exact call signatures remain a grammar/API decision; this amendment does not invent read/write methods or claim those names compile today. A shared-memory pipe implementation must preserve the same capacity, backpressure, closure, cancellation and supervision contract as its mailbox transport. It exposes typed capabilities, never raw actor-heap pointers. Publication, ownership transfer and failed admission must be atomic from the guest's perspective; generation-fenced shutdown must prevent stale access and double retirement.

## Singletons and symbols

Use the `singleton` keyword for singleton declarations. Scala-style `object` is not a singleton alias. The complete declaration grammar is a separately testable syntax obligation.

Singletons and shared symbol storage have one owning domain. Mutable singleton state and interning-table updates require the same exclusive-writer/compatible-readers discipline as other shared regions. Immutable published symbols may be read concurrently without granting mutation authority. Shared backing storage does not imply globally equal user symbols: preserve the namespace and cross-isolate identity rules in chapter 02. Do not copy mutable singleton state per actor as a substitute for shared identity, or use host-global tables to bypass tenant permissions. Initialization, restart and reclamation must fence stale capabilities.

## Compiler architecture and parity gates

Java, C#/.NET and C++/LLVM keep native ownership checks integrated with their existing type/IR passes. Collecting constraints in the same pass can avoid another AST walk; CFG joins, loops and lifetime analysis may still require a worklist/fixed point. Same-pass collection is not a claim that every borrow decision can be made in one traversal.

The canonical Rust verifier lives in [atto-borrow-checker.rs](https://github.com/ores-truffle-oreslang/atto-borrow-checker.rs). Shared language rules, compiler-derived place/type provenance and independently checked positive/negative cases govern equivalence. A local/canonical disagreement blocks emission. The current bounded Rust model does not yet certify critical regions, actor generations, loops, singleton initialization or real backend execution.

Before any implementation/parity claim, execute the same `.atto` cases on Java, LLVM and .NET:

- Concurrent readers succeed; a conflicting writer waits or receives the specified typed denial. Serial actors never overlap live `receive()` invocations, but independent non-`receive` methods may overlap a suspended or running receive.
- Unguarded state mutation, reader mutation, alias escape and unauthorized singleton writes fail before emission with the expected semantic diagnostic.
- One-owner handoff succeeds; the prior owner and stale-generation ref32 fail. Check arena boundary, overflow, wrong-domain and retirement races.
- Mailbox and shared-memory pipe variants preserve bounded admission, failed-send ownership, cancellation and physical cleanup.
- Shared singleton/symbol identity obeys namespace and tenant boundaries; interning races do not duplicate ownership.
- Compiler-local and canonical checks agree on supported operations, diagnostics and cleanup plans. Unsupported effects fail closed.

New sources use `.atto`. Retain `.ores` only under the existing explicit migration compatibility contract. Historical execution reports remain historical and do not override this target.
