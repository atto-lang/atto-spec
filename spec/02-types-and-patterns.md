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

## Option, Result and propagation

`Option<T>` has `Some(T)` / `None`. `Result<T,E>` has `Ok(T)` / `Err(E)`. Operations include `map`, `and_then`, `map_err`, `unwrap_or`, `unwrap_safe` and explicit conversion. A failure represented as data is not an exception effect.

Postfix `value?` is the target early-return operator: `None` or `Err(error)` exits the enclosing eligible callable without converting into `throw`, `raise`, or `panic`. `unwrap()` asserts presence and **panics** on absent/error variants. Do not silently flatten nested `Option` or `Result` types.

```atto
fnc parse_port(string input) -> Result<int, ParseError> ::
  val port = parse_int(input)?
  return Ok(port)
end
```

Postfix `?` execution is not certified on all backends; see [conformance](11-conformance.md).

## Symbols and matching

Symbol literals use a leading `#`: `#ready`, `#with spaces`. A string `"#ready"` is a different value. Core/standard symbol identity may be shared across isolates; arbitrary user symbols are not cross-isolate-identical by default. `define pub symbol #ready;` is a target declaration form. Colon-prefixed symbols are not accepted.

`match` destructures values/patterns, `switch` dispatches on equality/constant cases, and `if x is type Dog dog` performs nominal refinement. `x as T` is a checked cast; `x as? T` returns `Option<T>` on mismatch. No dynamic reflection is required merely to implement a source-level type test when static metadata is enough.

Overlap, priority (`match first`), exhaustiveness, numeric equality (`1` versus `1.0`), wildcard arms and Symbol identity must be specified and tested consistently; their unsettled edges are catalogued in [open questions](12-open-questions.md).

## Wire portability

Serializable network values and same-domain `Sendable` actor messages are not identical capabilities. Wire encoding must be versioned; native pointers, mutable actor state, host exception objects, code pointers and execution capabilities never cross the wire as raw values. `Result`/`Option` encode/decode round-trips require exact shared test vectors.
