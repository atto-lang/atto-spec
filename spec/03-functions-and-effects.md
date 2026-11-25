# 03 — Functions, Methods, Effects and Pipelines

**Status: DRAFT.**

A free function is declared with `fnc`; class and actor instance methods use an implicit `self` and canonically omit `fnc`. Callables have explicit or inferred return types where grammar permits. Each invocation returns **one value**; tuples/records are themselves one value.

## Signatures and visibility

```atto
pub fnc square(int x) -> int ::
  return x * x
end

define class Ledger as
  let int total: 0

  add(int amount) -> void ::
    self.total = self.total + amount
  end

  static fnc zero() -> int ::
    return 0
  end
end
```

This `-> T :: ... end` style is one of the valid [function forms](16-lexical-and-grammar-reference.md#function-forms). Backend support differs until grammar parity is proved.

## Named function, method and constructor arguments (v1 target)

Runtime value arguments use **`label: expression`**, whereas generic type arguments use **`T=Type`**. Ordinary assignment in a call is **not** a named argument. This surface is intended for ordinary functions, instance/static methods and constructors with statically known parameter names; dynamic/foreign/opaque callables without a verified name-bearing signature reject named calls.

```atto
fnc combine(int first, int second) -> int ::
  return first * 10 + second
end

val a = combine(second: 2, first: 1) // 12
val b = combine(1, second: 2)         // 12
// obj.set_value(value: 7, mode: #checked)
// Pair(first: 1, second: 2) uses the same binder only if Pair exposes named constructor formals.
```

**Checked binding plan:** Resolve the callable by its established owner/name/arity and nominal policy; labels do not select an overload. Match each source argument to one uniquely declared formal slot. Positional arguments fill a leading prefix; reject positionals after the first named argument, missing/unknown/duplicate labels, collisions between positional and named bindings, wrong types, unsupported spreads, absent required slots and ambiguous overloads. A required `T? name` has source type `Option<T>`; it is **not an omittable slot**. The independent `T name?` spelling marks an omittable formal, and `T? name?` combines both properties. Omission is permitted only with a statically checked declaration default (including `None` for an Option slot), never by inventing zero/null or shifting positional slots. Explicit `None` is a supplied typed expression, unlike absent slots or the separate contextual `_`/`omit` markers; any unsupported omission form fails closed. Parameter labels are part of source/override/interface compatibility, not additional runtime dispatch keys.

**Evaluation invariant:** evaluate the callee/receiver, then every supplied source argument expression **exactly once in lexical source order**, validating borrow/move/effects and cancellation along that order. Only after successful evaluation and checking may the compiler permute temporaries into declaration-order ABI slots. A named call cannot duplicate, skip or reorder side effects, or evade type/ownership/permission gates. Compile-time specialization, tail calls, suspendable/resumable methods, constructors and AOT code must consume the same checked plan; unsupported forms fail closed rather than becoming maps/records or dynamically reflected name lookup.

### Named-call edge cases and stable signatures

- **Formal uniqueness and naming:** declarations MUST reject duplicate parameter names, including shadowing introduced by parameter destructuring or receiver aliases. Binding is case-sensitive and against the *resolved callable signature*, not field names or imported aliases. Public callable/interface/override renames that change a named-call label are source-breaking API changes even if their positional ABI stays unchanged; labels cannot select overloads.
- **Arity and overloads:** resolve ordinary candidate sets using established arity/nominal policy before matching labels; do not use a label to rescue or distinguish an otherwise ambiguous overload. Explicit generic instantiation and inferred generic types must agree with the **formal slot selected by the checked value binding**, not source item index.
- **Optional-slot forms:** `T? name` is required `Option<T>`; `T name?` is omittable `T`; `T? name?` is omittable `Option<T>`. A non-Option omitted slot requires an admitted declaration default. Missing, explicitly omitted, and supplied `None` are different checked call items; no expression is evaluated for an omitted slot. A trailing rest formal is not an optional fixed slot.
- **Syntactic ordering:** a positional prefix may precede labeled values; a positional or spread item following the first label is normally rejected. A *single final anonymous trailing closure* is a separately gated exception only if the exact statically proven remaining final formal is callable; it must never be generalized to ordinary positionals or silently accepted by targets without that checked contract.
- **Evaluation and failure:** an invalid binding fails **before** the receiver or any user argument is evaluated. For a valid binding, evaluate the receiver first, followed by supplied argument expressions once in original lexical order. If one expression raises/throws, later expressions are not evaluated; no result permutation may bypass cleanup, permission, borrow/move or effect checking.
- **Indirect/foreign/variadic dispatch:** a closure, external ABI, foreign constructor, protocol dispatch or actor spawn may use labels only when it carries an authenticated static parameter-name map and its dispatcher consumes the identical checked plan. Tuple/record spread expansion and ownership-sensitive forwarding require separate static proof. No runtime `Map`-style rebinding fallback.
- **Diagnostics and tooling:** reject unknown labels, duplicates, collisions with positional bindings, missing required slots, extra arguments, malformed omission and invalid trailing closures deterministically with source spans. The formatter must preserve evaluation order and must not silently turn `name: value` into `name = value`.

**Compatibility boundary:** A readonly record, `Map<K,V>`, tuple spread, structural product, named type metadata and actor message field are not interchangeable named-call argument packs. Static record-to-named forwarding requires an independently checked closed-field expansion with proven evaluation/ownership semantics. Formatters preserve source argument order and labels rather than sorting expressions to declaration order.

## Effect types

A callable can be annotated for potential `throws`, `raises`, `panics` or `suspends` effects. The compile-time effect set is an upper bound used for diagnostics and safe call admission; it is not a license to perform privileged operations. `trap` describes a non-throwing boundary for ordinary throw effects, but does not catch panics or cancellation. Precise declaration syntax and effect-polymorphic inference are still being reconciled.

`async`/`suspend` callables may yield a Future or a Task; the declared carrier type matters. Awaiting a value must not turn a borrowed stack address into a dangling alias or monopolize an OS thread.

## Purity and critical sections

`pure` functions have no externally observable mutation; source effects must obey their declared bound. `critical-read` and `critical-write` are explicit concurrency/lock admission modifiers or callback grants, not promises that the host has acquired a particular OS mutex. A critical write requires exclusive ownership of the protected region; read loans can coexist when no conflicting writer is active.

A critical loan **MUST NOT** leak through a returned pointer, task capture, suspension, actor turn, hot reload, or untrusted domain transition without a separately verified lifetime and capability proof. Await must not hold a blocking host mutex by default.

## Functional pipelines and actor pipelines

```atto
val normalized = raw
  |> trim
  |> parse_value
  |> validate
```

`|>` passes the previous value through a functional transformation. The target actor pipeline spelling is:

```atto
val graph = spawn Reader() pipe spawn Transformer() pipe spawn Writer()
```

`pipe` constructs an owned, typed connection graph. Only explicitly compatible actor pipeline roles may join it; supervisor/control messages cannot become data stages; cycle edges require separately bounded feedback channels. This is still a **source-lowering target**, not a claim that the pipeline expression executes on current LLVM/Java main.

The proposed factory spelling is `Actor.pipe(Reader(), Transformer(), Writer())`, with `Actor.pipe(Reader, Transformer, Writer)` as **zero-argument constructor sugar**. Both are compiler-lowered new-actor graph construction, distinct from `Actor.connect(reader_ref, writer_ref)`, which wires already-spawned actor references without adopting them:

```atto
val builder = Actor.pipe(Reader(), Transformer(), Writer())
val with_defaults = Actor.pipe(Reader, Transformer, Writer)
val reader = spawn Reader()
val writer = spawn Writer()
val connection = Actor.connect(reader, writer)
```

**Reconciliation proposal:** `Actor.pipe(...)` returns an **unstarted, single-use builder** and the outer `.start()` attempts transactional actor admission, producing a typed start result (possibly suspendable). The infix `pipe` remains immediate-spawn syntax and shares the same post-start graph semantics. Thus the factory and the infix forms have equivalent constructed topology but **not** identical direct expression return types. Exact `start()` error/effect carriers remain under review. See [factory contract](14-actor-pipeline-factories.md) and [nested pipeline builder hardening](15-nested-actor-pipelines.md). Neither is yet executable backend parity.

## Macros and compile-time evaluation

`define macro` must expand or lower ahead of target runtime execution, be hygienic or explicitly expose controlled capture, produce source-mapped diagnostics, and be deterministic under a pinned toolchain. Macros cannot manufacture permissions or bypass import boundaries. Runtime reflection and runtime code evaluation are not implicit substitutes for macros. Cross-backend macro compilation and behavior require independent executable fixtures.


## Existing `using` keyword: deterministic scoped resources (v1 target)

**Decision:** make the spelling `using telemetry.span("checkout") as span { ... }`
a first-class, compiler-checked AttoLang construct. This **reuses the existing
`using` keyword**, not a new telemetry-specific keyword, decorator, macro
or application instrumentation wrapper. The LLVM hosted-AOT subset has restricted guest execution evidence.
Java's compiler-owned guest scope implementation has separate candidate
tests; this amendment does not certify their execution.

```atto
using telemetry.span("checkout") as span {
    span.set_attribute("order.type", order.kind)
    let result = await process_order(order)
    return result
}
```

Proposed grammar addition for a `using` statement (integrate with any other
existing uses of that keyword, do not reject them):
```ebnf
using_statement = "using" expression "as" identifier block ;
block           = "{" statement* "}" ;    (* existing brace scope *)
```
The body and binding use ordinary lexical scoping. Evaluate the resource
expression exactly once. The compiler requires an admitted scoped-resource
protocol (provisional contract name `ScopedResource` with deterministic
`close_scope`). The acquired resource is bound in the body; neither the
unique handle nor its mutable borrowed view may escape the lexical scope.
It cannot be sent through channels or actor mailboxes. Immutable,
capability-free trace context may be propagated independently.

**Verified implementation boundary (12 November 2026):** the native
LLVM hosted-AOT parser, compiler and Clang-linked runtime have an executed
non-suspending `telemetry.span("literal")` scope subset (five native
guest cases at `-O0` and `-O2`, five compiler-denial cases on the
[approved source-blob carrier](https://github.com/streempilot-test/browser-studio-e2e/actions/runs/43324098880)).
That subset intentionally forbids observable scope-handle methods and
suspension. Java main uses a compiler-owned lexical span and a trusted
runtime provider. Its checked-in guest tests target nesting, `await`, cancellation
and host-controlled recording; exact executed receipts are required. Full guest AOT, live JIT attach, and
asynchronous scope parity across backends require independent execution
evidence. See the [Java guest tests](https://github.com/atto-lang/atto-source.java/blob/b02efee4c036557278284ca444655e19cd0adc64/src/test/java/dev/oreslang/TelemetryUsingSpanLanguageTest.java)
and the [shared telemetry contract](https://github.com/atto-lang/atto-common-source/pull/122).


`close_scope` executes exactly once **after the body terminates** by
fallthrough, `return`, `?` early propagation, `trap`, `throw`,
`raise`, `panic`, cancellation or exceptional unwind. `using` is
a proper-tail-call cleanup barrier. A legal `await` or `select`
suspension does **not** end the scope: its resource token and immutable
parent context are kept in the continuation and completed when the body
actually exits. Resource acquisition failure follows the expression's
ordinary error semantics and cannot close a never-acquired resource.

A `SpanScope` is **runtime-owned and nominally sealed at the trust
boundary**: a guest module or class with the same names
(`telemetry.span`, `SpanScope`, or `close_scope`) cannot impersonate
the built-in tracing capability. The public source-level contract is one
affine `ScopedResource<SpanScope>` abstraction, not a `uint64` token,
heap object identity, or user-implementable duck-typed interface.
A backend may implement its internal handle as a compiler-owned opaque
token, a proven heap value, or a continuation-owned frame provided the
*observable* lifetime, observer operations, and effects are equivalent.
The scope alias cannot shadow another live owned scope. Guest calls to
`close_scope` are forbidden; closure is generated and enforced by the
compiler, not delegated to an ordinary method lookup.

A telemetry `SpanScope` is a specialized scoped resource whose cleanup is
non-throwing, non-suspending, nonblocking and cannot alter guest-visible
effects, exceptions, cancellation, or supervisor CONTROL priorities. The
underlying native recorder/collector may drop events under bounded pressure.
Disabled instrumentation yields a clock-free, allocation-free no-op span
scope; ordinary argument and attribute expressions still run with their
normal evaluation effects. Guard expensive attribute construction using
`span.is_recording()` when needed.

`using` scopes and automatic compiler/runtime/stdlib spans share one
logical context, preserve parentage across `await`/actor handoffs, and
avoid duplicate semantic HTTP server spans. A non-recording context may
remain valid for propagation when explicit propagators are enabled.

**Mandatory compiler and execution gates:** parse and format round-trip;
wrong resource/cleanup protocol; scope escape/borrow and actor transport
rejection; normal return/early exit/exception/panic/cancel exactly-once
cleanup; suspension/resume and scheduler migration; disabled-path purity;
telemetry failure isolation. All must be independently proven on each
supported backend before implementation labels are upgraded.

See [common-source native auto-instrumentation v1](https://github.com/ores-truffle-oreslang/oreslang-common-source/pull/279)
for the versioned event ABI and conformance targets.
