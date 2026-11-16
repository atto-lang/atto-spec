# Option suffix and omittable formal parameters (Atto v1)

Status: **normative target contract** for Atto; check backend-specific admission and proof below. This specification does not imply all `Option<X>` instantiations, defaults, named calls, actor transports or backends execute yet.

## Two independent syntactic dimensions

```atto
mtd (Foo self) run(X? x?): void { }
fnc run(X? x?): void { }
routine run(x?: X?): void { }
```

* A `?` immediately following a **type reference** is sugar for `Option<type>`: `X?` ≡ `Option<X>`. It is not a pointer, nullability bit, omitted argument, or an implicit value coercion. The full expanded type participates in type equality, generics, ownership and ABI checking.
* A `?` immediately following the **formal parameter identifier** makes that parameter **omittable** at the call site. Documentation, grammar nodes and diagnostics MUST say *omittable*, not *optional*, to avoid confusion with `Option<T>`.
* `X? x`: caller **must** supply `x` (which may be `None`). `X x?`: caller may omit `x` only with a valid explicit default; absent a default this is a declaration error. `X? x?`: caller may omit `x`, which supplies a canonical `None: Option<X>` if no explicit default is given.
* Presence is not value: explicitly passing `None` satisfies the argument, while omitting an omittable `Option<X>` formal produces a `None` at the correct position. Both are the same `Option<X>` value inside the callee; neither induces an implicit `X -> Option<X>` conversion.

## Contextual, deterministic grammar

The lexical token `?` has one spelling, but the parser owns the context and produces **different AST nodes**:

```ebnf
type_ref           ::= primary_type ["?"]
formal             ::= type_ref ["mut"] IDENT ["?"] ["=" default_expr]
                     | IDENT ["?"] ":" type_ref ["mut"] ["=" default_expr]
formals            ::= "(" [formal {"," formal}] ")"
call_argument      ::= expression | IDENT ":" expression
type_pattern_field ::= IDENT ["?"] ":" type_pattern
value_pattern_field::= IDENT ["?"] ":" value_pattern
postfix_expression ::= primary_expression {"?" | other_postfix}
```

The parser must distinguish `OptionType(T)`, `Param.omittable`, `FieldPattern.presence_optional` and `Expr.Propagate` by **syntactic context**, never capitalization, adjacency, whitespace, word boundaries or type-name heuristics. A ternary `condition ? yes : no` is an expression-only form and cannot reinterpret a formal or type suffix. `x?: X?` and `X? x?` are identical. `X ? x ?` is identical irrespective of spaces/comments.

`X??` is rejected in v1 (write `Option<Option<X>>` explicitly). `void?`, uninstantiable `X?` and unsupported `Option<X>` ABI instantiations must fail with a precise type diagnostic, not map to `Any`, an untagged pointer or `X`.

## Call binding and overload resolution

1. Bind explicit positional arguments left-to-right. Named arguments (when supported by a backend) bind by formal identifiers exactly once. Duplicate or unknown labels reject; positional arguments following a named argument reject. Missing required formals reject.
2. For every unbound omittable formal, type-check its explicit default, or synthesize `None: Option<X>` if its type is `Option<X>`. No implicit default values for arbitrary `X`. Evaluate explicit arguments once, in source order; synthesized `None` must not affect observable user-expression ordering.
3. Positional-only frontends require omittable formals to be a trailing suffix. When named-argument binding is executable, non-trailing omittable formals may be enabled only if the binding algorithm proves all required formals are supplied; never shift a positional argument to guess which slot is missing.
4. Overloads must have **disjoint admitted call shapes**, not merely distinct declared maximum arities. Under positional-only binding, each declaration admits an interval `[required_count, total_count]`. Two declarations with the same name and overlapping intervals are an `E_AMBIGUOUS` declaration error, regardless of inferred argument types. Do not resolve this by guessing a type or choosing a different overload depending on `None`. Methods are scoped to owner and method name; the implicit `self` does not count as a user argument. Once named calls are enabled, perform an equivalent call-shape collision check.
5. At the compiled ABI boundary the full declared parameters remain present. Omission is a call-site binder operation: it never shortens the compiled function signature, escapes ownership checking, or changes `ActorMail`, supervisor CONTROL, dispatch or serialization protocols.

## Examples

```atto
fnc mandatory(int? value): int { return 1; }
fnc omit(int? value?): int { return 2; }
routine named(value?: int?): int { return 3; }

mandatory(None);  // valid
mandatory();      // E_ARITY: Option<int> does not make parameter omittable
omit();           // valid: inject None: Option<int>
omit(None);       // valid: explicitly supplied
omit(Some(7));    // valid: explicitly supplied
omit(7);          // E_TYPE: no implicit int -> Option<int>
named();          // valid
```

A raw `?` after an expression remains result/option propagation:

```atto
fnc propagate(int? x): int? {
    return Some(x?);
}
```

The expression example is illustrative syntax; exact propagation and nesting remain subject to the backend's effect/type rules, not this sugar contract.

## Implementation and verification gate (2026-11-16)

* Rust/Wasm compiler candidate: type postfix is admitted only for `int?` and `Result<int,string>?` (canonical `Option<int>` and `Option<Result<int,string>>`), with omittable formals of those types and trailing positional omission; explicit defaults and named calls still fail closed. Class `mtd` uses normal checked class lowering.
* Target-only actor `mtd (Foo self) run(X? x?)` syntax is recognized but generic `Option<X>` actor ABI is **not** linked. An explicit `E_UNSUPPORTED_TYPE` is required before executable codegen.
* Full generic `Option<X>`, non-trailing omission via named arguments, default expressions, all other backends and cross-backend ABI/conformance are **not verified**. Do not call this five-backend parity until guest compilation and execution pass on each backend, with exact source SHA evidence.
* Regression tests must cover function/routine/mtd orientation, nested generic terminals, type equality, omitted/exact None/Some, wrong payload, arity interval collisions, method/actor dispatch, ownership, pattern `x?:`, ternary, postfix propagation and whitespace/comment sensitivity.
