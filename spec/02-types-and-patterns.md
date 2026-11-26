# 02 — Types, Values, Generics and Pattern Matching

**Status: DRAFT.**

## Class field declaration defaults: implicit `val` (accepted target)

In **ordinary class fields only**, a type-first declaration without an explicit binding modifier means `val`, **independent of the field's type**: `pub int count = 0;` means `pub val int count = 0;`, and `pub Foo child = new Foo();` means `pub val Foo child = new Foo();`. This applies to generic `T` fields too. Explicit `let` permits rebinding; `mut` independently requests writable referent access. Historical implicit-`let` is migration-only.

```atto
define class Person as
  pub string name = "Alice"; // implicit val: fixed binding
  pub mut List<string> items = []; // implicit val mut: fixed binding; writable referent if safe
  pub val int id = 42; // stable binding, no referent writes by default
  pub val mut List<int> scores = []; // stable binding, writable referent if safe
  pub final int birth_year = 1996; // exactly once (checked definite assignment)
  pub const int capacity = 100; // class field initializer must be constexpr
end
```

`let` and `val` govern **rebinding**; `mut` independently governs requested write access through an object reference, subject to ownership, readonly receivers, existing borrows and actor boundaries. `const` prevents rebinding and requires compile-time evaluation for ordinary class fields; the runtime-once `os.read_env` exception is **only** for file/module-level `define const` declarations. `final` requires exactly one assignment and may permit checked deferred construction-time initialization only where a backend can prove it; this differs from a `val` initialized at declaration/construction. No combination may evade the borrow checker. A bare local `int x = 5;` keeps its existing meaning of `const int x = 5;`, rather than the class-field default.

This is an accepted *semantic target*, not a claim that every backend already distinguishes `final`, `val`, `const` and `mut` in typed IR. Native/independent backend parity is pending. Normative implementation guide: [atto-spec class field binding defaults v2](https://github.com/atto-lang/atto-spec/blob/main/language/class-field-binding-defaults-v2.md); executable requirements: [atto-platform-conformance v2 registry](https://github.com/atto-lang/atto-platform-conformance/blob/main/contracts/class-field-binding-defaults-v2.json).


A runtime `val` binding is not by itself deep immutability. Typed local `const` requires compile-time evaluation and frozen constant data; explicit `const mut` materializes a fresh owned mutable instance per execution, never a mutable pooled alias. See [chapter 27](27-implicit-const-and-const-mut.md).

## Type system

AttoLang is statically typed and **nominal by default**. Two classes with the same fields are not automatically interchangeable. Explicit structural compatibility is permitted at designated call boundaries using `structural` or `struct{...}` / `structural {...}` forms after type-checker admission; structural typing is not a universal runtime cast.

Class, trait, interface and type-alias **declarations are types, not runtime values**. Class instances remain valid parameter and result values; static member receivers are compiler-only. Value shadowing is lexical. See [type-declaration/value separation](../language/type-declarations-not-runtime-values-v1.md). Namespace aliases and explicitly admitted static type queries are governed by separate contracts; none implies a first-class runtime type descriptor.

Primitive families include booleans, signed/unsigned integral types, floating-point types, strings, bytes, arrays, records, enums, function references and typed handles. Exact widths, overflow modes, numeric promotion, float corner cases, and ABI packing require cross-backend tests. No backend may rely on host-language unchecked overflow. Dynamic integer overflow is an ordinary thrown guest error under the November 23 target; see [integer rules](17-primitives-and-core-types.md#integer-rules).

An immutable binding does not imply deep immutability of every reachable object. The ownership model controls mutation, copying, sharing and lifetime separately.

## Classes, records, structs, enums, ADTs

- **Class:** nominal identity and methods; declared fields have explicit ownership semantics.
- **Record/struct:** value/data oriented types. Structural matching and call compatibility require explicit admission.
- **Enum:** nominal variants; enum methods are intended; same-named variants from distinct enum types are not interchangeable.
- **ADT:** product/sum constructors with typed fields and proof-checked matches; overlapping constructors/patterns require static diagnostics.
- **Sealed / non-sealed classes:** intended hierarchy contracts; `sealed` bounds known subtypes for exhaustive checking, while `non-sealed` explicitly permits extension where policy allows.

```atto
define enum Status {
    Pending,
    Ready,
    Failed
}

fnc describe(status: Status): string {
    return match status over
        on Pending -> "pending"
        on Ready -> "ready"
        on Failed -> "failed"
    end;
}
```

This is the **TARGET canonical idiom**, not a claim that each spelling executes in every backend. Field-bearing patterns support a whole-variant scoped borrow using `on Run { job_id, payload } as r`; the borrowed view `r` is narrowed to the selected variant. See [chapter 27](27-typed-enum-pattern-aliases.md).

## Generics and overloading

`T` and multi-parameter generics are monomorphized or otherwise represented with **equivalent source semantics** on every backend. Defaults and named generic arguments are design targets:

```atto
fnc build<A=int, B=bool, C=B>() -> A ::
  return default_value<A>()
end

val x = build<A=int, C=bool>()
```

A generic default can depend on an earlier parameter. Callable overload resolution is **arity first**, then admitted nominal distinctions (particularly nominal enum types), rather than guessing between shape-compatible structural candidates. Ambiguity must be rejected.

## Named generic type parameters and specialization (v1 target)

A **generic declaration** introduces *type-parameter identifiers*, optionally with type defaults. A **specialization** binds those identifiers to type arguments; it does not create a runtime object or perform an expression side effect. Illustrative source (not yet a five-backend execution claim):

```atto
define class Box<T, Alloc=DefaultAllocator> as
  T value
end

val box: Box<Alloc=PoolAllocator, T=int>
val vector: Vector<T=int>
val array: Array<T=int>
val list: ArrayList<T=string>
val same: Box<int, Alloc=PoolAllocator>
```

`Vector<T=...>`, `Array<T=...>` and `ArrayList<T=...>` are **conditional on those nominal types actually declaring a generic parameter named `T`** in the imported standard library or package. The spelling is not a promise that all three are implemented or equivalent on every backend. Existing collection shape notation such as `Vector[int]` is a separate bracketed **sequence-shape** channel; it must not be silently rewritten as `Vector<T=int>`. Existing `<rank=2>`, `<messages=...>` and other type/storage metadata are likewise a separate, declaration-validated metadata channel, never an undeclared generic parameter.

The same generic-binding algorithm applies to class, interface, trait, actor, alias, function and method type parameters, where those declarations are supported:

1. Resolve the nominal declaration and its ordered generic formals before binding; compare parameter names **case-sensitively**. A `name=Type` binding is permitted only for a declared generic formal of that name; metadata keys are admitted only by their own explicit schema. Unknown keys, duplicate keys (including positional + named collisions), excess arguments, positional arguments after the first named argument, and ambiguous metadata/generic key collisions are errors.
2. Positional arguments fill successive declaration slots from the beginning. Once a named argument occurs, all subsequent type arguments must be named. Named arguments can appear in any order after the positional prefix; canonical semantic identity is **declaration order**, never textual label order. `Box<T=int, Alloc=PoolAllocator>` and `Box<Alloc=PoolAllocator, T=int>` denote the same specialization.
3. Apply explicit bindings first, infer only where inference is permitted and unambiguous, then expand defaults in declaration order. A default may reference only earlier declared formals (e.g. `C=B`). Reject missing required formals, conflicting inferred and explicit types, forward references and cycles. Non-trailing defaulted formals may be omitted by **name**; positional omission never shifts later supplied positional arguments into a different slot.
4. Resolve defaults and type aliases in the defining module's type environment, then substitute already-bound earlier parameters. Reject unbound type names, non-type values in type slots, invalid constraints, arity mismatch and alias recursion before code generation. Type argument erasure or host-language reflection cannot change observable specialization identity.
5. A formatter may canonicalize spelling only when proven semantically equivalent. It must preserve the identity of generic versus metadata versus sequence-shape parameters, source spans, and the declared type of each argument. Tree shaking, static registries, instantiation caching and AOT specialization keys must use the same fully resolved ordered type vector.

### Named-specialization negative and lifecycle cases

Type arguments are **types**, not runtime expressions. In `Container<T=string, U=T>`, the right-hand `T` resolves in the available type environment; it is not an unevaluated runtime variable and is not automatically the name of the `T` formal being declared. Named-call labels such as `make<T=string>(value: x)` are runtime-value binding keys and belong to a distinct namespace. A generic type may declare a formal named `Item` instead of `T`; `Vector<T=int>` is legal only if that particular imported Vector declaration really exports a type formal spelled `T`.

For example, for `Pair<First, Second=First>` the bindings `Pair<Second=string, First=int>` and `Pair<int, Second=string>` must yield the same ordered type vector. `Pair<First=int, First=string>`, `Pair<int, First=string>`, `Pair<Second=string, int>`, `Pair<Third=int>` and `Pair<First=42>` must be rejected. A declared default may reference earlier parameters after explicit bindings/inference, but may not reference a later formal, itself, or an unrelated runtime value.

A specialization cache key MUST include the resolved **nominal declaration identity** (module/package/version/visibility context, including hot-load generation as applicable), its ordered fully resolved type vector, and any independently declared compile-time layout metadata. A compiler MUST derive and authenticate this identity from the resolved declaration graph, not from a user-supplied display label. Layout metadata must be schema-validated and serialized in stable key order before specialization cache lookup; identical textual type vectors from distinct nominal declarations never alias. Source-free reference oracles may exercise this key structure but do not prove compiler-owned identity or guest lowering. A type-vector-only string key is not globally unique. Alias expansion, bounds and privacy checks occur before a specialization is published, and a failed binding must not leave a partially cached specialization. Compile-time defaults must never trigger runtime effects.

For generic functions/methods, value-argument name binding and type-argument name binding are **separate phases**: first resolve the callable and bind labeled runtime values against its declared value formals; then infer any remaining type arguments from those matched formal/actual pairs. Explicit generic types cannot be silently overridden by inference. Calls whose type-argument or value-argument binding is not supported on a target backend must fail closed before emitting executable IR.

## Option, Result and propagation

`Option<T>` has `Some(T)` / `None`. `Result<T,E>` has `Ok(T)` / `Err(E)`. Operations include `map`, `and_then`, `map_err`, `unwrap_or`, `unwrap_safe` and explicit conversion. A failure represented as data is not an exception effect.

Postfix `value?` is the target early-return operator: `None` or `Err(error)` exits the enclosing eligible callable without converting into `throw`, `raise`, or `panic`. `unwrap()` asserts presence and **panics** on absent/error variants. Do not silently flatten nested `Option` or `Result` types. The precise one-layer `map`, `and_then`, `map_err`, nested-ADT `transpose`/`flatten` equations, and the requirements for error-domain identity are specified in [the nested functor contract](23-functors-and-nested-adts.md).

```atto
fnc parse_port(string input) -> Result<int, ParseError> ::
  val port = parse_int(input)?
  return Ok(port)
end
```

Postfix `?` execution is not certified on all backends; see [conformance](11-conformance.md).

## Symbols and matching

Symbol literals use a leading `#`: `#ready`, `#with spaces`. A string `"#ready"` is a different value. Core/standard symbol identity may be shared across isolates; arbitrary user symbols are not cross-isolate-identical by default. `define pub symbol #ready;` is a target declaration form. Colon-prefixed symbols are not accepted. Shared symbol storage has one owning interning domain; published immutable values admit reader loans, and interning-table mutation requires exclusive authority. Shared storage does not change the equality or cross-isolate identity rules above.

The singleton declaration keyword is `singleton`, not Scala-style `object`. Singletons and symbol storage use the shared-memory single-owner/reader-writer model; singleton identity alone grants no mutable access. See [chapter 22](22-concurrency-and-shared-ownership.md) for the ownership and lifetime target; full declaration grammar and backend admission must be tested before claiming support.

`match` destructures values/patterns, `switch` dispatches on equality/constant cases, and `if x is type Dog dog` performs nominal refinement. `x as T` is a checked cast; `x as? T` returns `Option<T>` on mismatch. No dynamic reflection is required merely to implement a source-level type test when static metadata is enough.

### Match arm introducers

Ordinary patterns require `on`, including literals, constructor patterns without `is`, and the wildcard `on _`. A type-test pattern may begin directly with `is`; `on is` remains equivalent input syntax. This rule applies to statement and value matches, with explicit or piped subjects, and either outer delimiter. The formatter prefers `is` for a type-test arm and must preserve comments and arm boundaries. It must not remove `on` from any other pattern.

```atto
const int x = match value over {
    on 42 -> 100;
    is int -> -20;
    on _ -> 0;
};
```

A literal arm followed by a type-test arm is an ordered specialization: the literal is tried first, then the type test, then the remaining fallback. This narrow overlap is permitted without `match first`; other overlapping explicit patterns retain the existing proof rules. Unreachable arms remain diagnosable, and the fallback is needed only where the subject domain is not already exhausted. Both spellings of the type-test arm have identical binding, guard, ownership and evaluation semantics. Use an explicit semicolon or comma after an expression arm before a bare `is` arm so that an infix type test inside the expression is not confused with the next arm. No change to switch or select syntax is implied.

Overlap, priority (`match first`), exhaustiveness, numeric equality (`1` versus `1.0`), wildcard arms and Symbol identity must be specified and tested consistently; their unsettled edges are catalogued in [open questions](12-open-questions.md).

## Wire portability

Serializable network values and same-domain `Sendable` actor messages are not identical capabilities. Wire encoding must be versioned; native pointers, mutable actor state, host exception objects, code pointers and execution capabilities never cross the wire as raw values. `Result`/`Option` encode/decode round-trips require exact shared test vectors.
