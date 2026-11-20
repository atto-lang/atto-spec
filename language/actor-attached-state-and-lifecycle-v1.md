# Actor attached state and guarded lifecycle v1

**Status: TARGET DESIGN — NOT CROSS-BACKEND VERIFIED (2026-11-19).** This is the AttoLang source-language target for every `atto-source.*` implementation. It does not certify any backend, actor scheduler or compiled guest. It extends the protected-class-state design while retaining **actor-specific** mailbox, lifecycle, supervisor and TenantVM rules. See the associated `atto-platform-conformance` registry for portable cases and explicit evidence gates.

## Equivalent actor state declaration forms

An actor may have exactly **one** private per-instance state schema, declared either inline or attached out of line. The schemas are semantically equivalent when their fields, initializers, ownership, namespace and owner nominal identity match:

```atto
define actor Counter as
  state {
    let int count;
  }
  on_start(): void using state.write {
    self.handle_state(critical-write |s| -> { s.count = 0; });
  }
  receive(ActorMail<int> mail): void using state.read, state.write {
    self.handle_state(critical-write |s| -> { s.count += mail.value; });
    val observed = self.handle_state(critical-read |s| -> s.count);
    stdio.println(observed);
  }
end
```

```atto
define actor Counter as
  on_start(): void using state.write {
    self.handle_state(critical-write |s| -> { s.count = 0; });
  }
  receive(ActorMail<int> mail): void using state.read, state.write {
    self.handle_state(critical-write |s| -> { s.count += mail.value; });
    val observed = self.handle_state(critical-read |s| -> s.count);
    stdio.println(observed);
  }
end

define state on actor Counter as {
  let int count;
}
```

The canonical attached spelling is `define state on actor Counter as { ... }`; its terminating `}` completes the declaration (no second `end`). The inline form is `state { ... }`. The formatter preserves the selected form and field/initializer semantics; it must **never** silently move state between owners, replace `let` with `val`, or erase an explicit `using` effect. The attached declaration may precede or follow the actor definition and may follow `declare actor Counter;` when nominal owner resolution is complete. Symbol resolution is by *exact package/namespace and nominal actor ID*, not a bare name or structural shape.

An out-of-line attachment is allowed for a *fully defined actor with no inline state block*, including actors with inline lifecycle and receive methods. Reject any second attachment, inline-plus-attached pair, mismatched or unresolved owner, imported/foreign-package owner, wrong owner kind (class/struct), duplicate fields, member collisions and ambiguous namespace linkage. State is never a static/global singleton, public field, structurally projected trait member, or an ordinary actor instance property. Each actor incarnation has independently allocated and fenced state; restart does not alias the old incarnation.

## Types, initialization and lifecycle

`let int count;` is permitted only with proven **definite assignment** before the first read. In this example `on_start` writes `count = 0` inside the exclusive guard; the checker must prove that every successful activation path initializes each required state field exactly once before any `receive` or other state-reading hook executes. An explicit initializer such as `let int count: 0;` is permitted and evaluated per actor incarnation. Reads of uninitialized memory must never be synthesized as zero defaults. Missing initialization on any successful path is a compile error. A throw, raise, panic or cancellation during initialization must abort activation, notify supervision and prevent receiver execution, never publish partially initialized state.

An implementation may return an actor handle from `spawn` before activation completes, but it must fence the mailbox from **executing** messages until activation succeeds. A successfully admitted `counter.send(1)` means **mailbox admission only**; it is not proof of processing, acknowledgement or `stdio.println` completion. A program that immediately returns from `main` is not a deterministic output test. A conformance runtime must explicitly supervise and await the accepted turn's completion or drain/ack before asserting an output trace, and must count abandoned messages separately from processed messages.

## Effects and guarded capabilities

A callable using `critical-read` must declare `using state.read`; one using `critical-write` must declare `using state.write`. A callable using both modes declares both. `state.write` authorizes access only to the current actor's protected state, not other actors' state or ambient writable aliases. In a write lease the bound view is exclusive; in a read lease it is readonly. A read projection may return independently owned, copyable scalar data, such as `int`; it cannot return a borrowed field, `Pointer<T>` or a reference to the state view. `self.handle_state` is a compiler-authenticated actor intrinsic, not a spoofable user method; the state binder exists only inside the callback.

`critical-read` grants concurrent readers only where the actor's scheduling model permits concurrency; `critical-write` excludes all readers/writers for that particular incarnation. Reader/writer fairness, cancellation, actor STOP/quiescence and generation-fenced revocation must be enforced by the runtime, not assumed from a lexical AST scope alone. Backends may elide a host lock only with an equivalent mechanical exclusivity proof. Acquiring a lease must not park a scheduler carrier thread.

No `await`, `select`, `yield`, `spawn`, reentrant or nested state guard, uncontrolled call, cross-actor turn, escape of `s`, alias capture, pointer cast or actor send is allowed while a guarded view is live. Every exit path (normal, throw, raise, panic, cooperative cancellation, trap, STOP) releases or invalidates the view exactly once; no stale generation can reacquire or release newer state. `stdio.println(observed)` is outside the guard and therefore not a lock-held I/O operation. `mail.value` is `int` and may be copied into the guarded operation without transferring `ActorMail` or its owner.

Because the example performs a write and a separate read, another turn may update the actor between those two guards if message concurrency is greater than one. Thus `observed` is a **valid later snapshot**, not necessarily the count immediately after this message's increment. An atomic increment-and-return must use one proven exclusive transaction returning a copied scalar; that result-bearing critical-write feature needs separate syntax and backend proof before it is assumed runnable.

## Cross-tenant and backend admission

All actor state and lease tickets belong to a specific TenantVM, actor ID, incarnation and scheduler/continuation generation. No compiler lowering may cross TenantVM boundaries through shared memory, ref-counted pointers, actor handles, foreign aliases, raw memory, FFI, or process-global state. Cross-tenant messaging requires explicit separately authorized serialization/admission and never transports the lease binder.

A backend must reject unimplemented grammar/effects/storage/lifetime features with a stable diagnostic **before producing a guest artifact**; it must not execute `state` as ordinary accessible fields or silently desugar guard calls to unsafe accesses. Rust/Wasm's existing restricted scalar Worker-local implementation and host-side Java/LLVM prototypes do not establish general Atto guest parity.

## Conformance and evidence requirements

The portable conformance registry must include the **exact** two actor shapes above and negative cases for duplicate/foreign attachment, uninitialized reads, readonly mutation, direct state access, missing effects, scope escape, suspension, reentrant acquisition, and generation-fenced post-STOP access. Verify parser/type/ownership refusal with zero emitted artifact on every negative source. Verify at least two actual accepted actor messages (1, then 2), correct state snapshots under controlled serial execution, independent actor instances, successful/failed on_start, rollback/cleanup on faults, concurrent read/write exclusion, non-parking admission, and TenantVM isolation in each runnable backend. Preserve exact source/target commit SHA, tree/blob integrity, compiler executable, job steps, toolchain, and guest traces. Status remains `NOT_EXECUTED` per backend until independently executed compiled-guest evidence is recorded.

Related: [protected class state](out-of-line-receivers-constructors-and-state-v1.md), [shared ownership and guards](shared-ownership-and-guards-v1.md).
