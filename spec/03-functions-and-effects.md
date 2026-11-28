# 03 — Functions, Methods, Effects and Pipelines

**Status: DRAFT.**

A free function is declared with `fnc`; class and actor instance methods use an implicit `self` and canonically omit `fnc`. Every named callable must explicitly declare its return type, including `void`; explicit `-> infer` (or `: infer`) is allowed, but a concrete result type is preferred. Omitted return annotations are invalid. Each invocation returns **one value**; tuples/records are themselves one value.

## Mandatory named-callable return annotations

The accepted AttoLang v1 rule is that **every named function, routine, class/actor instance or static method, out-of-line method, and actor receive handler must explicitly annotate its return**. Accepted syntax includes name-first `name(params) -> T` or `name(params): T` and return-first `[fnc] T <- name(params)`, where `T` can be a concrete type, `void`, or the explicitly requested inference placeholder `infer`. The return-first form also allows braces, `begin`/`end`, and an explicit statement/`end` body; its `<-` token is not an assignment operator. Inference is permitted but less desirable for public APIs and cross-module signatures; the compiler resolves it statically or reports an error, never silently choosing void. For example:

~~~atto
fnc calculate(int x) -> int { return x + 1; }
fnc shutdown() -> void { }
fnc choose() -> infer { return 42; }
~~~

A constructor has no return annotation, since construction is not an ordinary return-valued callable; lambdas retain separately specified contextual inference. See the [normative return-type contract](https://github.com/atto-lang/atto-spec/blob/main/language/explicit-callable-return-types-v1.md). This is an accepted target; backend execution and formatter parity remain separately gated.

## Candidate static binding type queries

Explicit `infer` is already part of the target return annotation contract. The separate [static binding type query proposal](../language/return-binding-type-query-target-v1.md) describes `typeof name` and parenthesized compatibility input; it does not certify backend support or permit omitted annotations.

See [canonical lambdas and AOT closure semantics](../language/canonical-lambdas-and-closures-v1.md) for capture provenance, effect checks and full-AOT code-plus-environment lowering. Existing typed inline annotations, braced bodies and separately gated comma-body profiles remain intact.

## Flexible inline callable contracts

A named callable may place its mandatory result annotation before or after the entire inline `effects`, `budget`, `throws`, `raises`, and `panics` sequence. Brace and `begin`/`end` statement bodies work for either placement; a final result annotation following the clauses also admits newline-started statements terminated by `end` without `begin`. The five equivalent spellings, parser boundaries and conformance requirements are specified in [flexible contract headers](../language/java-style-failure-signature-bodies-v1.md#flexible-contract-headers-effects-budget-and-result-placement-2026-11-26). This is a syntax target, not backend execution evidence.

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

## Comma callable bodies: versioned candidate

`::` retains its existing optional statement-header delimiter meaning in the established profile, including return-first declarations. The separate comma-body proposal (#35) selects an implicit-tail body for name-first `-> T :: ... end` **only in an explicitly selected future profile**. No working edition selector is established here. Do not reinterpret existing statement bodies or return-first effect headers. In the candidate profile, top-level comma items evaluate once left to right; nested call/tuple/generic commas retain their roles. A non-void body needs a terminal expression of the declared type, never a declaration. Empty items and trailing commas reject. Statement bodies need explicit `return` or `^`; `^` cannot return a declaration. Legacy explicit return and semicolon bodies must be preserved or migrated explicitly, not heuristically mixed with comma sequencing. A runtime local needs explicit `val`/`let`, not type-first const shorthand. Formatter preserves body kind and effects; conversion requires checked equivalence. See the [return-first contract](../language/return-first-and-begin-callables-v1.md) and [initialization contract](27-implicit-const-and-const-mut.md).

## Lambda bodies, explicit results and comma sequencing

**Canonical typed inline lambda:** `|params| => ReturnType -> expression`.
The fat arrow `=>` introduces the return **type annotation**; the slim
arrow `->` introduces the executable **expression**. These roles also
align with function-type notation `(int, int) => int`, where `=>`
specifies a result type. Parenthesized `|params| (=> ReturnType) -> expression`
is an accepted but noncanonical annotation alias. The reversed
`|params| -> ReturnType => expression` is invalid.

```atto
val inferred = || -> 5 + 3;
val typed = || => int -> 5 + 3;
val typed_alias = || (=> int) -> 5 + 3;
val typed_with_local = || => int -> val int x = 5, x + 3;
val inferred_with_local = || -> val int x = 5, x + 3;

val block = || -> int { return 8; };
val comma_block = || -> int ::
    val int x = 5,
    x + 3
end;
```

In the opt-in candidate comma-body profile, the `-> Type :: ... end` lambda form uses the same top-level comma
sequence and implicit terminal-result rule as `fnc`, `routine` and `mtd`.
An explicit `void` result permits a terminal effect expression with no
value result; a non-`void` declaration must match the inferred terminal
expression type. An ordinary `{ ... }` lambda body remains a statement
body with explicit `return`.

An inferred **same-line** comma sequence may begin with a local declaration
(`val`, `const`, `let` or a supported type-first immutable binding),
then one or more comma-delimited items, ending in a value expression.
A bare `|| -> left, right` must not consume a caller's second argument
as part of the lambda: explicit grouping or `:: ... end` is required
for general comma sequences lacking a leading binding.

### Pipeline lambda contracts

```atto
fnc foo(int n): Tuple[int, int] {
    return tuple(n, n + 1);
}

val reporter = || -> void ::
    5 |> foo |> |x, y| -> stdio.println(x + y)
end;

val compact = || => void ->
    5 |> foo |> |x, y| -> stdio.println(x + y);
```

A value pipeline always forwards **one** value. For a lambda stage with
multiple parameters (`|x, y|`), the single upstream value must be a
statically typed tuple of matching arity, destructured exactly once in
order. A scalar, array or mismatched tuple must fail type checking.
No implicit extra arguments, reflection or copy of ownership-sensitive
elements is introduced by the comma-body feature.

For an unparenthesized `|n| -> expression` pipeline stage, the next
top-level `|>` belongs to the enclosing pipeline; use parentheses to
nest a pipeline inside a lambda expression. The same boundary rule applies
to typed `|n| => Type -> expression` and inline local sequences.

### Backend implementation and verification boundary (2026-11-14)

These are **historical PR candidates**, not language parity or production
acceptance. A test fixture, syntax-only formatter and a zero-step GitHub
workflow must never be counted as executable guest evidence.

| Target | Current candidate | Evidence status |
| --- | --- | --- |
| Java/Graal | [compiler #3079](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/3079) | Parser, types and real guest tests authored; source Actions not executed |
| LLVM | [native #1785](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/pull/1785) | Scalar `::` and named `|>` candidate; closure syntax denied; native execution not yet verified |
| .NET | [CIL #523](https://github.com/ores-truffle-oreslang/oreslang-source.net/pull/523) | Scalar fnc/routine `::` candidate; nominal mtd and lambdas denied; NativeAOT run unverified |
| Forge | [stage-0 #280](https://github.com/ores-truffle-oreslang/oreslang-source.forge/pull/280) | Explicit fail-closed `::`/lambda tests, no closure lowering |
| WASM | [wasm32 #488](https://github.com/ores-truffle-oreslang/oreslang-source.wasm/pull/488) | Authenticated LLVM-to-Wasm compiler gate, native guest not yet run |
| Browser playground | [compiler gate #115](https://github.com/atto-lang/atto-lang.github.io/pull/115) | Pinned independent Rust/Wasm compiler denies unimplemented forms pending upgrade |
| Rust formatter | [formatter #143](https://github.com/ores-truffle-oreslang/oreslang-format/pull/143) | Exact head `c4065f6`, 2/2 CI jobs passed; this is formatting only |

Conformance should progress from grammar and AST preservation, through
type/ownership and effect validation, to real target execution and AOT
artifact evidence. Backends may temporarily reject a proposed form
with an explicit diagnostic; they must not accept it into an unsafe
incomplete lowering or emit a false successful parity receipt.

## Parameter binding and reassignment (v1 target)

In the opt-in borrow-default profile, parameters have fixed local bindings unless marked `rebind`. `mut` requests writable referent access and `take!` specifies transfer at entry; `rebind` does not alter the caller's binding or signature dispatch. Owned replacement values have separate proven origin, cleanup and lifetime. See [explicit parameter rebinding](../language/implicit-argument-borrow-v1.md#explicit-parameter-rebinding-v1).

## Named function, method and constructor arguments (v1 target)

The detailed normative distinction between **`T? name`**, **`T name?`**, and **`T? name?`**, including omission provenance and negative conformance cases, is in [chapter 27](27-optional-and-named-arguments.md). This section is a summary and must not be read as a separate lowering rule.

Runtime value arguments use **`label: expression`**, whereas generic type arguments use **`T=Type`**. Ordinary assignment in a call is **not** a named argument. The dedicated `StructName(field=value)` target applies only to statically resolved implicit nominal struct fieldwise initialization, not ordinary callable arguments (see [layout chapter](27-collection-layout-named-generics.md)). This surface is intended for ordinary functions, instance/static methods and constructors with statically known parameter names; dynamic/foreign/opaque callables without a verified name-bearing signature reject named calls.

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

## Call-argument ownership inference (target)

In the versioned opt-in borrow-default profile, an ordinary nonprimitive reference-backed formal borrows rather than consumes. A read-only call may omit `borrow!`; a proved transitive write effect requires an exclusive writable loan requested with `mut`. Seal effects in the resolved signature before call admission. Receiver and supplied arguments evaluate once in lexical order, with each prior loan checked against subsequent argument effects. Permutation into formal slots neither duplicates nor retires a loan. Explicit `borrow!` cannot repair missing provenance. Keep explicit consuming `take! T` formals and `take! owner` arguments, and the separate `rebind` rule. See [implicit argument borrowing](../language/implicit-argument-borrow-v1.md) and [ownership](04-ownership-and-memory.md#implicit-argument-borrowing-target).

## Unified inferred effect analysis (target)

See [the unified semantic effect model](../language/unified-inferred-effects-v1.md). Inference over typed call graphs includes cleanup, latent effects and exceptional edges. Effect rows are upper bounds, not authority grants or resource bounds. Preserve the existing source grammar, typed exception distinctions, checked pipeline setup/completion boundaries and protected state loan effects; fine-grained semantic IR identifiers are not automatically accepted source tokens.

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
