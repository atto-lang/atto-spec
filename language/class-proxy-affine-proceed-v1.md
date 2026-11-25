# Affine proceed for compiler-generated proxy interceptors (candidate)

**Status: design and test protocol only; no user syntax, compiler lowering,
runtime, or backend conformance is certified.** This document refines
[class-proxy-virtual-interception-v1.md](class-proxy-virtual-interception-v1.md).

## Scope

An around interceptor gets a compiler-issued *invocation-scoped* continuation
for one resolved virtual method slot. Its type contains the exact receiver
identity, module/slot identity (name + arity plus checked nominal signature),
argument ownership, return type, exceptional effects, and code generation.

The continuation is **affine**: it may be consumed **zero or one time**.
A zero-consumption around hook is an intentional *typed short-circuit*, not
an implicit invocation of the target. A before/after hook is a distinct
contract and cannot secretly skip or repeat target invocation.

This is an internal compiler/IR contract, **not** a proposal to add
`proceed`, `virtual`, a reflection catch-all, or any new source keyword.

## Activation and state machine

Each proxied call constructs one frame with a unique invocation ID,
the resolved original target and its code generation, the current dispatch
slot, permitted effect envelope, actor/isolate domain, and one continuation
capability. No runtime user callback may forge a frame or access the
underlying target directly.

| State | Operation | Next state | Required outcome |
| --- | --- | --- | --- |
| AVAILABLE | authorized proceed | CLAIMED | Mark consumed *before* dispatching downstream |
| CLAIMED | downstream completes/throws/raises/panics | CONSUMED | Preserve original outcome and cleanup precedence |
| AVAILABLE | hook returns a valid short-circuit value | CLOSED | Return value without invoking downstream |
| AVAILABLE | hook throws/raises/panics | CLOSED | Propagate original exceptional control |
| CLAIMED/CONSUMED/CLOSED | second proceed | unchanged | Compile failure if statically provable; otherwise fatal typed continuation misuse |
| any | capture/store/send/return token | none | Compile rejection; no token escapes the frame |
| any | await/suspend without pinned-frame proof | none | Compile rejection; no implicit async promotion |

The transition AVAILABLE -> CLAIMED must be atomic in any backend with
concurrent entry. A second thread or reentrant use of the *same token*
must not race to invoke the target a second time. Distinct method
invocations use distinct frames and may proceed independently.

On normal return from an around hook, **exactly one** of the following
must hold: (a) it returned a checked value without using proceed, or
(b) it used proceed once and returned a checked value. Void return is
an explicit valid value. A bare implicit fallthrough is not a hidden
proceed. If the hook does not call proceed, the target was never invoked.

## Typed IR obligations

One possible *internal*, non-source IR shape:

```text
proxy_enter(invocation_id, receiver_id, slot_id, generation, envelope)
  -> affine Continuation<Arguments, Return, Effects>
consume_proceed(token, arguments) -> Return ! Effects
close_without_proceed(token, checked_return) -> Return
proxy_exit(invocation_id, outcome)
```

The compiler must prove token uniqueness through SSA/control-flow merges,
including loops, branches, closures, field assignment, parameter passing,
`defer`, exceptions, and hot loading. Static ownership/borrow errors cannot
be delegated to a permissive runtime object. Runtime state is defense in
depth for unsafe or dynamically linked AOT boundaries.

Before, after, and around have distinct effects:

- **before:** runs once before target delegation; its normal return is
  followed by one target call. If before fails, target is not invoked.
- **after:** runs once only after a **normal** downstream return; does not
  run automatically during throw, raise, panic, or cancellation. It may
  transform a result only with a checked return/effect adapter.
- **around:** may short-circuit or consume a one-shot continuation. No
  surrounding proxy layer may cause the same downstream frame to run twice.
- **failure handling:** no implicit `after` substitutes for explicit
  `defer`/cleanup. A panic remains untrappable and reaches supervisor
  CONTROL. Raise follows nearest defer/recover rules; throw follows
  catch/escape rules. Cancellation/authority/host fatal errors retain
  their precedence over cleanup errors.

## Ownership and security

A continuation is neither `Copy` nor `Share` nor a serializable
`Sendable` message. The compiler prohibits storage in fields, arrays,
closures, actor messages, thread-local state, FFI handles, or return
values. No `take!` transfer can extend its invocation lifetime.

For this first contract, interceptor parameters that would need the same
owned mutable object *both in a hook and downstream* cannot be forwarded
until the borrow checker proves an explicit reborrow/move plan. The legacy
Java before-hook candidate currently restricts shared parameters to
copyable scalar values; it does not implement around continuations.

An interceptor does not mediate calls issued on a separate alias of the
original target, or the target's own `self.method()` calls. Do not
advertise security-total mediation without alias-provenance proof.

## Stable AOT implementation plan

1. Generate stable named slot IDs and typed AST/MIR method entries.
2. Introduce a compiler-owned affine continuation type, never a user
   constructible class or reflection-based trampoline.
3. Perform an interprocedural escape and exceptional-control-flow proof,
   including hot-reload generation pinning.
4. Lower each state transition with deterministic per-invocation storage
   in Java/GraalVM, LLVM, Wasm, .NET NativeAOT, Rust/Cranelift, Forge, and JS.
5. Verify all backends with executable source fixtures and exact-commit/tree
   receipts. Host-only specification tests are **not** this evidence.

## Required conformance oracles

Test one proceed, zero proceed, repeated proceed, recursive proceed,
cross-frame/wrong-receiver use, token escape, stale code generation,
concurrent token reuse, nested proxy ordering, target failure precedence,
panic supervisor notice, and invalid effect narrowing. Test both static
rejection and runtime defense in depth where applicable. Until a backend
has an executable receipt, mark its case `not_executed` rather than
`passed` or `unsupported` by assumption.
