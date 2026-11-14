# 03 — Functions, Methods, Effects and Pipelines

**Status: DRAFT.**

A free function is declared with `fnc`; class and actor instance methods use an implicit `self` and canonically omit `fnc`. Callables have explicit or inferred return types where grammar permits. Each invocation returns **one value**; tuples/records are themselves one value.

## Signatures and visibility

```atto
pub fnc square(int x) -> int ::
  int result = x * x,
  result
end

define class Ledger as
  let int total: 0

  add(int amount) -> void ::
    self.total = self.total + amount
  end

  static fnc zero() -> int ::
    0
  end
end
```

The `-> T :: ... end` form is the **comma-delimited expression-body** style:
top-level commas evaluate items from left to right and the final expression
is the implicit return value for a non-`void` callable. A brace-delimited
`{ ... }` body remains an explicit statement body, where a result requires
`return`. Ordinary `-> T` end bodies without `::` retain their legacy
statement semantics. Explicit `return` remains accepted inside `::` bodies
for compatibility. The same rule applies to `fnc`, `routine`, class
methods and explicit `mtd` receiver methods. Details and negative rules
are in the [function grammar](16-lexical-and-grammar-reference.md#function-forms).
Backend support must be tested independently; a declared contract alone is
not proof of LLVM or .NET execution.

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
    int x = 5,
    x + 3
end;
```

The `-> Type :: ... end` lambda form uses the same top-level comma
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
