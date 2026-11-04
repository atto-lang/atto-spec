# 02 — Types, Values, Generics and Pattern Matching

**Status: DRAFT.**

## Type system

AttoLang is statically typed and **nominal by default**. Two classes with the same fields are not automatically interchangeable. Explicit structural compatibility is permitted at designated call boundaries using `structural` or `struct{...}` / `structural {...}` forms after type-checker admission; structural typing is not a universal runtime cast.

Primitive families include booleans, signed/unsigned integral types, floating-point types, strings, bytes, arrays, records, enums, function references and typed handles. Exact widths, overflow modes, numeric promotion, float corner cases, and ABI packing require cross-backend tests. No backend may rely on host-language unchecked overflow when the source specifies checked arithmetic.

An immutable binding does not imply deep immutability of every reachable object. The ownership model controls mutation, copying, sharing and lifetime separately.

## Classes, records, structs, enums, ADTs

- **Class:** nominal identity and methods; declared fields have explicit ownership semantics.
- **Record/struct:** value/data oriented types. Structural matching and call compatibility require explicit admission.
- **Enum:** nominal variants; enum methods are intended; same-named variants from distinct enum types are not interchangeable.
- **ADT:** product/sum constructors with typed fields and proof-checked matches; overlapping constructors/patterns require static diagnostics.
- **Sealed / non-sealed classes:** intended hierarchy contracts; `sealed` bounds known subtypes for exhaustive checking, while `non-sealed` explicitly permits extension where policy allows.

```atto
define enum Status as
  Pending
  Ready
  Failed
end

fnc describe(Status status) -> string ::
  return match status over
    Status.Pending -> "pending"
    Status.Ready   -> "ready"
    Status.Failed  -> "failed"
  end
end
```

This is an intended idiom, **not** an assertion that each enum and match spelling already executes in every backend.

## Generics and overloading

`T` and multi-parameter generics are monomorphized or otherwise represented with **equivalent source semantics** on every backend. Defaults and named generic arguments are design targets:

```atto
fnc build<A=int, B=bool, C=B>() -> A ::
  return default_value<A>()
end

val x = build<A=int, C=bool>()
```

A generic default can depend on an earlier parameter. Callable overload resolution is **arity first**, then admitted nominal distinctions (particularly nominal enum types), rather than guessing between shape-compatible structural candidates. Ambiguity must be rejected.

"Arity" is a range, because of omittable and rest formals ([chapter 03](03-functions-and-effects.md)). A candidate with `r` required formals, `o` omittable formals and no rest formal accepts any supplied argument count `n` with `r ≤ n ≤ r + o`; with a trailing rest formal it accepts `n ≥ r`. A trailing closure counts as one supplied argument. Resolution is:

1. Keep the candidates whose arity range contains `n`.
2. Among those, keep the candidates whose formals admit the arguments' static nominal types.
3. Exactly one candidate MUST remain. Zero is a "no matching overload" error; two or more is an ambiguity error. Labels, defaults and return types never break a tie.

Declaring two overloads whose arity ranges overlap **and** whose formal types cannot be told apart nominally SHOULD be diagnosed at the declaration, not only at call sites.

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

Type arguments are **types**, not runtime expressions. At a **use site** such as `Container<T=string, U=T>`, the right-hand `T` resolves in the type scope surrounding that use (for example an enclosing generic formal named `T`); it never refers to `Container`'s own `T` formal or to the `string` just bound to it. If no `T` is in scope at the use site, the specialization is rejected. Only a **declaration** default (such as `Second=First` in `Pair<First, Second=First>`) refers to the declaring type's earlier formals. Named-call labels such as `make<T=string>(value: x)` are runtime-value binding keys and belong to a distinct namespace. A generic type may declare a formal named `Item` instead of `T`; `Vector<T=int>` is legal only if that particular imported Vector declaration really exports a type formal spelled `T`.

For example, for `Pair<First, Second=First>` the bindings `Pair<Second=string, First=int>` and `Pair<int, Second=string>` must yield the same ordered type vector. `Pair<First=int, First=string>`, `Pair<int, First=string>`, `Pair<Second=string, int>`, `Pair<Third=int>` and `Pair<First=42>` must be rejected. A declared default may reference earlier parameters after explicit bindings/inference, but may not reference a later formal, itself, or an unrelated runtime value.

A specialization cache key MUST include the resolved **nominal declaration identity** (module/package/version/visibility context, including hot-load generation as applicable), its ordered fully resolved type vector, and any independently declared compile-time layout metadata. A compiler MUST derive and authenticate this identity from the resolved declaration graph, not from a user-supplied display label. Layout metadata must be schema-validated and serialized in stable key order before specialization cache lookup; identical textual type vectors from distinct nominal declarations never alias. Source-free reference oracles may exercise this key structure but do not prove compiler-owned identity or guest lowering. A type-vector-only string key is not globally unique. Alias expansion, bounds and privacy checks occur before a specialization is published, and a failed binding must not leave a partially cached specialization. Compile-time defaults must never trigger runtime effects.

For generic functions/methods, value-argument name binding and type-argument name binding are **separate phases**: first resolve the callable and bind labeled runtime values against its declared value formals; then infer any remaining type arguments from those matched formal/actual pairs. Explicit generic types cannot be silently overridden by inference. Calls whose type-argument or value-argument binding is not supported on a target backend must fail closed before emitting executable IR.

## Option, Result and propagation

`Option<T>` has `Some(T)` / `None`. `Result<T,E>` has `Ok(T)` / `Err(E)`. Operations include `map`, `and_then`, `map_err`, `unwrap_or` and explicit conversion. `unwrap_safe` is a reserved name whose semantics are not yet specified (PROPOSED); implementations MUST NOT ship it under that name until a contract exists. A failure represented as data is not an exception effect.

Postfix `value?` is the target early-return operator: `None` or `Err(error)` exits the enclosing eligible callable without converting into `throw`, `raise`, or `panic`. `unwrap()` asserts presence and **panics** on absent/error variants. Do not silently flatten nested `Option` or `Result` types.

**Eligibility of `?` (TARGET).** The *eligible callable* is the innermost enclosing `fnc`, method, lambda/callback or `nb { }` Task body. `?` never crosses that boundary: inside a `handle_state(critical-write |s| -> { ... })` callback it returns from the callback, not from the enclosing `receive`. With operand type `Option<U>` the eligible callable MUST return `Option<_>`. With `Result<U, E>` it MUST return `Result<_, E>` with the **same** `E`. There is no implicit error conversion and no `Option`↔`Result` conversion; mismatches are compile errors (use `map_err` or another explicit conversion). `?` is rejected inside `defer` and `finally` bodies, at module top level, and in `const` initializers. On early return, owned locals are dropped and `defer` blocks run exactly as for an ordinary `return`.

```atto
fnc parse_port(string input) -> Result<int, ParseError> ::
  val port = parse_int(input)?
  return Ok(port)
end
```

Postfix `?` execution is not certified on all backends; see [conformance](11-conformance.md).

## Symbols and matching

Symbol literals use a leading `#` followed by an identifier: `#ready`, `#one_for_all`. An unquoted symbol ends at the first character that cannot continue an identifier, so `#with spaces` is the symbol `#with` followed by the identifier `spaces`, never one symbol. A symbol that contains spaces or other non-identifier characters needs a delimited form; `#"with spaces"` is PROPOSED (S-49). A string `"#ready"` is a different value. Core/standard symbol identity may be shared across isolates; arbitrary user symbols are not cross-isolate-identical by default. `define pub symbol #ready;` is a target declaration form. Colon-prefixed symbols are not accepted.

`match` destructures values/patterns, `switch` dispatches on equality/constant cases, and `if x is type Dog dog` performs nominal refinement. `x as T` is a checked cast; `x as? T` returns `Option<T>` on mismatch. No dynamic reflection is required merely to implement a source-level type test when static metadata is enough.

Overlap, priority (`match first`), exhaustiveness, numeric equality (`1` versus `1.0`), wildcard arms and Symbol identity must be specified and tested consistently; their unsettled edges are catalogued in [open questions](12-open-questions.md).

## Wire portability

Serializable network values and same-domain `Sendable` actor messages are not identical capabilities. Wire encoding must be versioned; native pointers, mutable actor state, host exception objects, code pointers and execution capabilities never cross the wire as raw values. `Result`/`Option` encode/decode round-trips require exact shared test vectors.
