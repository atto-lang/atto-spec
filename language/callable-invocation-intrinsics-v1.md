# Callable invocation intrinsics v1

**Status: owner-directed TARGET; backend implementation and performance evidence NOT_EXECUTED.**

## Surface and resolution

For a statically resolved callable value `f` of signature `(A, B) => R`, the expressions `f(a, b)`, `f.call(a, b)` and `f.apply(tuple(a, b))` all invoke that callable and return the same declared result and effects. `f.call()` and `f.apply(tuple())` are the zero-arity equivalents when the empty tuple is supported. A one-element tuple is constructed with the established tuple constructor. These are compiler-provided operations on callable types, not methods stored in a function instance.

Resolve the base expression and its static type before recognizing these intrinsic names. Ordinary class/functor members called `call` or `apply` retain their normal member resolution; do not intercept them by name alone. A resolved method reference retains its receiver with the original lifetime and ownership constraints. Neither intrinsic accepts a special receiver parameter or rebinds self/this. There is no intrinsic `bind` and no automatic partial application or currying. Ordinary user-declared methods named bind are not prohibited.

```atto
fnc add(int a, int b) -> int { return a + b; }

fnc main() -> int {
    val f = |int a, int b| -> add(a, b);
    val args = tuple(20, 22);
    return args |> f.apply;
}
```

Explicit partial application uses lexical closures, for example
`5 |> |int x| -> (|int y| -> add(x, y))`. Insufficient arguments to an ordinary multi-formal callable are an arity error, not a request for partial application. The existing separately admitted multi-parameter pipeline-lambda tuple-destructuring profile is unchanged; this amendment does not remove any established pipeline expansion behavior. Explicit `.apply` is the portable unambiguous invocation of a callable from a statically shaped Tuple or Record. Ordinary `.call(t)` and `.call(r)` pass one complete argument; they never implicitly expand a product.

## Product invocation boundary (owner direction 2026-11-27)

```atto
fnc combine(int x, int y): int { return x * 10 + y; }
val t = Tuple.of(4, 2);
val r = Record.of(y := 2, x := 4);
combine.call(4, 2); // 42
combine.apply(t); // 42, positional
combine.apply(r); // 42, named
```

No spread is required for either apply form. Named binding uses the same verified slot planner as ordinary named calls, without using labels to invent overloads. Record apply does not imply implicit Tuple-to-Record conversion, contextual conversion of an existing value, or a new default/variadic policy. This explicitly supersedes the tuple-only apply restriction in the prior draft and historical spread profile; see the positional Tuple / named Record correction in #321. A callable type that has erased names still supports positional Tuple apply; Record apply requires a retained statically verified name-bearing signature. The effect and ownership plan must be identical to the corresponding ordinary invocation; evaluation of a Record's field initializers may not be reordered to match formal slots.

## Static admission and checked lowering

- `.call` consumes the same call-item grammar and resolved signature as direct invocation, with identical arity, overload resolution, labels/defaults (only where already admitted), generic inference, ownership, receiver, effects and diagnostics.
- `.apply` takes exactly one statically typed fixed Tuple or closed Record matching the resolved fixed formal slots. Tuple elements bind by index, including complete Pair values with repeated or dynamic keys; no named fallback or implicit Pair payload extraction. Record fields bind by statically available unique parameter name, independent of field order; a Pair-valued field stays a Pair. Reject wrong arity/types, missing/extra fields, unavailable formal names, dynamic/open records, arrays, implicit omission and unproved rest expansion. No runtime key lookup or dynamic array-to-call conversion. A tuple containing one tuple-valued formal is distinct from a tuple expanded into multiple formals.
- Evaluate the base once and then the supplied arguments or tuple expression once, in established source evaluation order. For a pipeline evaluate its LHS once before its RHS. Apply evaluates the product expression and its initializers in source order, then associates checked projections with formal slots without introducing copies, moves, borrows, evaluation or cleanup inconsistent with the checked direct-call plan. An existing Tuple or Record's projections obey ordinary place/partial-move rules; do not consume the whole tuple unless the source ownership contract requires it. Reject when a safe projection/transfer proof is unavailable.
- Reuse the normal checked call plan, including effect and lifetime checks, exception/cancellation cleanup and any call-once restrictions. Resolve overloads and generic instances statically. In ambiguous or unsupported cases reject before guest emission.
- A callable-operation reference such as `f.apply` has a statically typed unary Tuple or Record parameter selected by its contextual callable signature; where the shape cannot be resolved uniquely, require an explicit lambda or annotation; `f.call` has the original argument shape. Receiver/callee expression is evaluated once at reference creation and captured only as permitted by normal closure rules. Escaping references may use the ordinary AOT closure representation; immediate invocations/pipeline stages must not introduce an adapter object. No receiver substitution, host-JavaScript Function.prototype semantics or reflection.

## Runtime footprint gate

Lower recognized intrinsics to the same typed invocation IR used by ordinary calls, with static Tuple-index or Record-field projections for apply. The callable representation, ABI, alignment, dispatch table, per-function metadata and runtime initialization must be unchanged solely by the presence of these operations. No new per-call method lookup, boxing, refcount activity, heap allocation or indirect dispatch relative to the equivalent explicit call/projection baseline. No extra GC roots or runtime argument type checks. Existing callable environments and existing tuple storage are not charged as intrinsic-specific allocations.

Immediate Tuple or Record literals should be scalar-replaced/directly marshalled without an additional tuple object wherever the equivalent direct call can do so. An existing product may require loads according to its layout. An escaping adapter is an ordinary closure, not a mandatory runtime method table. Do not promise byte-identical instruction sequences for distinct input storage, effect ordering, calling conventions or optimization settings. Require identical canonical call lowering for equivalent checked argument plans, and measure incremental allocations, dispatch and layout. On managed targets use the equivalent host/guest baseline; do not claim native pointer sizes for all targets.

## Required conformance

Execute independently on all applicable atto-source.* targets (Java/Graal, LLVM, Forge, Rust, Cranelift, .NET, Wasm, JS, Atto self-hosted, realtime and HDL where supported). Unsupported callable profiles must explicitly reject, not silently substitute another backend. Native target coverage includes i686/32-bit where supported, AMD64 and ARM64; Wasm32 and relevant managed targets use their own ABI.

- Direct/call/apply equivalence for 0/1/2/heterogeneous parameters, tuple-valued formal, void and value results, existing product versus immediate literal. Record order reversal, zero-field Record, unknown or erased formal names, named Tuple with repeated keys, whole Pair versus payload, aggregate-valued ordinary `.call` versus `.apply`, and a nested aggregate occupying exactly one slot.
- Lambda, first-class callable, escaping closure, method reference, generic specialization; ordinary functor member collision; callable operation references immediate and escaping; explicit partial application; pipeline single evaluation and existing tuple-lambda compatibility.
- Wrong arity/type, array or open Record instead of fixed product, extra special receiver argument, intrinsic bind, ambiguous overload, implicit currying, move-after-use, double consuming call, invalid borrow escape or suspension, effect mismatch. Include ordinary named/rest behavior only where direct invocation already supports it.
- Side-effect order and exactly-once evaluation, exceptional evaluation/cleanup, argument transfers and return/effect parity.
- Compare canonical call IR and artifact dispatch paths at unoptimized and optimized settings. Record callable representation size/alignment, allocation counts and call/dispatch counts against an equivalent direct baseline, including an existing tuple baseline and immediately invoked method references. Benchmark separately; no timing-only proof of zero overhead.

Evidence must pin compiler commit/tree, fixture identity, target, optimization flags, toolchain, generated IR/artifact, compile/run commands and actual guest results. Host models and zero-step CI are not execution evidence. No backend PASS or performance guarantee is claimed by this document.
