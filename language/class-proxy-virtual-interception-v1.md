# Compiler-generated class proxies and virtual interception (candidate v1)

**Status: normative candidate, NOT an implemented or executed guest feature.**
This document audits the earlier closed-world delegation prototype in
[`oreslang-source.java#2650`](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2650).
That prototype has typed AOT forwarders but **no virtual interceptor hooks**.
The initialized `atto-source.java` repository does not yet carry that
implementation. Do not infer compiler or runtime support from this contract.

## Entry point and the generated type

The existing candidate entry point remains `new Proxy(new Foo(...))`. The
compiler evaluates the inner constructor **once**, produces a separate nominal
`FooProxy` value, and emits typed members before ordinary binding, type,
ownership, effects and code-generation passes. No JS `Proxy`, JVM reflection,
runtime method enumeration, `Reflection.Emit`, JIT bytecode, or dynamic
property traps are permitted. Generated names are collision checked across
modules, imports, exports and generated declarations.

```atto
define class Counter as
    pub inc(value: int): int {
        return value + 1;
    }
end

fnc main(): int {
    const p = new Proxy(new Counter());
    return p.inc(41);
}
```

This is **a delegation example, not proof of interceptor implementation**.
The compiler-generated class is a different type from `Counter`, not a
subtype that can be used wherever `Counter` is required. No implicit
conversion may expose its target or erase its proxy boundary.

## Contract for future virtual interceptor methods

The following are semantics for implementing the user's requested virtual
interceptor feature, **not newly reserved keywords or a claim that hooks exist**:

1. **Typed method slots.** For each supported public instance method, generate
   a unique symbol-resolved slot with its full nominal signature, receiver
   contract, overload identity, visibility, ownership/lifetimes, return type
   and declared `throws`/`raises`/`panics` or suspension effects.
   Reject two source methods that map to one emitted slot; do not silently
   pick the first. Named/default arguments and annotations must be preserved
   or rejected before code generation.
2. **Virtual receiver dispatch.** A call made *through a proxy receiver*
   must use the proxy's normal virtual dispatch table. An approved override
   must be invoked **exactly once** for that call. Generating an ordinary
   non-virtual forwarder and then claiming it is interceptable is invalid.
   The original target method is invoked only through the compiler-issued
   typed delegation path.
3. **Checked continuation.** If an around-style hook is supported, its
   `proceed` capability is affine and scoped to this invocation: at most
   one invocation, never copied, stored, sent, captured for later execution,
   recursively re-entered or called on the wrong receiver. A hook can
   intentionally short-circuit with a correctly typed result. A declared
   pre/post-only hook cannot skip or duplicate delegation. The surface
   spelling of the hook/continuation is not decided here.
4. **Effects are invariant.** A generated or overridden method cannot
   discard a target's declared effects, forge a narrower effect set, grant
   stronger capabilities or silently turn `raise`/`panic` into `throw`.
   The hook body must be admitted against its checked effect envelope.
   A panic must still reach the supervisor CONTROL path; the interceptor
   cannot recover it. Cancellation, fatal faults and ownership traps are
   not swallowable application errors.
5. **Ownership and identity.** The initial target is moved/owned according
   to the ordinary borrow checker; constructing a proxy is not a deep copy
   nor an unbounded `share`. No method may return the wrapped target
   identity, directly, through a nested generic/struct, or under erased
   return types such as `Any`, `Object` or `dynamic` without a
   proven identity-preserving adapter. Source constructor self-publication,
   FFI backdoors and ordinary aliases are **not covered by the proxy**.
   A proxy must never be advertised as a total mediation/security boundary
   without a constructor-escape and alias-provenance proof.
6. **Explicit bypass boundary.** Calls made on the original object,
   including the target's own `self.method()` calls, are **not intercepted**.
   Do not rewrite those calls implicitly or promise Java Spring-style
   whole-object AOP. User-visible docs must distinguish proxy-receiver calls
   from calls within the target. Nested proxies must not lead to accidental
   double interception.
7. **No hidden members.** Constructors, static methods, private/protected
   fields, private/protected methods, mutable state and actor CONTROL handlers
   do not become public merely because a proxy exists. Actors and
   unproven inherited/generic/structural/async surfaces fail closed until
   the relevant backend can establish all required proofs.
8. **Deterministic AOT layout.** The synthesized proxy and virtual slots
   have stable link-time identities in native, GraalVM, Wasm and .NET NativeAOT
   outputs. Preserve existing visibility and imports. There must be no
   reflection-based runtime fallback or compiler/runtime split-brain dispatch.
9. **Stable unwind.** Hook entry/exit counts and target invocation count
   remain well-defined for normal return, `throw`, `raise`, `panic` and
   cancellation. Cleanup uses the ordinary `defer` machinery, never an
   implicitly inserted, silently failing user hook.

## Required design decision before hook syntax implementation

The typed virtual *slot* is distinct from the per-method callback
*API*. No user-facing hook names, `virtual` modifier, `super` spelling,
or `proceed` syntax are standardized in this candidate. An implementation
must resolve the exact signature and ABI first rather than introducing a
magic untyped `on_call(methodName, args)` catch-all. Existing method
naming conventions remain `snake_case`; member qualification uses a dot,
not `::`.

## Conformance and evidence

`conformance/class-proxy-interception-v1.json` enumerates positive and
negative **planned** checks. The manifest includes experimental typed-before-hook and affine
continuation **design** checks. The source form
`new Proxy(new Foo(), new FooHooks())` is prototyped in the legacy Java
compiler draft and requires independent syntax, effect and ownership review.
The current before-hook prototype accepts only copyable scalar arguments
and statically resolved, bounded helper-call chains.

The separate [affine proceed protocol](class-proxy-affine-proceed-v1.md)
specifies the one-shot continuation state machine, identity fencing and
failure precedence. It is **not** source syntax, guest implementation or
completed backend conformance.

The conformance plan also requires multiple typed-before proxy values with
the same target/hook pair to share a single generated AOT class while
remaining independent instances; duplicate request occurrences must not
cause either a compilation error or duplicate synthetic class definitions.

The manifest is a design review and executable
test plan only after backend-specific harnesses implement each case.
Each backend must report `passed`, `failed`, `unsupported`, or
`not_executed` **per case** with the exact source commit, source tree,
toolchain, generated AST/IR slot, actual guest output or diagnostic, and
nonzero executed test receipts. No positive guest support is claimed here.

The required first-stage implementation sequence is: (1) verify current
delegation prototype's generated AST and type/ownership tests, (2) make
public forwarders truly virtual and verify override dispatch in a real
guest, (3) bind compiler-issued one-shot continuation and effect rules,
(4) verify no alias/identity escape and error/panic control precedence,
(5) port the same contract across backends and run actual AOT binaries.

Private source mirroring for CI requires the source repository's approved
destination and independent authorization. An alternate organization's
available Actions minutes, a local Git-tree copy and the absence of a PAT
do **not** waive those security controls.
