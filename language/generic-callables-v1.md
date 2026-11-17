# Generic callable signatures, instantiation, and AOT safety (v1)

Status: **target language contract** (2026-11-17). This is a source-language
specification, **not** evidence that any backend executes all examples.
It extends [callable body styles](callable-body-styles-v1.md) without replacing
their existing return or statement-delimiter rules.

## Declaration syntax

A generic parameter list follows the callable name, before the value
parameters. Both return-type introducers and all existing body styles apply to
generic functions, routines and supported instance/static methods.

```atto
fnc identity<T>(T value): T {
    return value;
}

fnc identity_end<T>(T value) -> T
    value
end

fnc preserve<T>(T value): T -> {
    return value;
}

fnc preserved<T>(T value) -> T {
    return value;
}

fnc passthrough<T>(T value) -> T ::
    value
end

define class Store as
    fnc get_or<T>(T fallback) -> T { return fallback; }
    static fnc pick<T>(T value) -> T { return value; }
end
```

For **function declarations**, `: ReturnType` and `-> ReturnType` have the
same return-type meaning; the second form also admits the already-specified
comma/`end` implicit-tail body. `: ReturnType -> { ... }` uses the explicit
braced-body marker. A brace body does **not** implicitly return its final
expression. The `fnc`/legacy `method` prefix on instance methods may be
removed by the formatter; `static fnc` must be preserved.

```ebnf
callable          = modifiers, ("fnc" | "routine"), identifier,
                    [generic_parameters], "(", value_parameters, ")",
                    [return_header], [effects], callable_body ;
generic_parameters = "<", generic_parameter, {",", generic_parameter}, ">" ;
generic_parameter = identifier, [":", bound], ["=", type_reference] ;
return_header     = ":", type_reference | "->", type_reference ;
```

The bound syntax is the language's existing checked nominal/trait/interface
bound syntax; do not treat arbitrary expressions as constraints. Top-level
`fnc` and methods follow the same generic grammar. Generic type arguments
to **calls** remain distinct from generic parameters to **declarations**.
A parser must distinguish a declaration `<...>` from expression comparison,
nested `<...>` types and the `->` return/body markers by grammar position,
not by capitalization or regex.

## Binding and inference

- Each type parameter is a **type**, not a dynamic `Any` or a runtime value.
  Its name has lexical scope over all later parameters, the value-parameter
  types, return type, constraints and body. Duplicate type parameter names,
  collisions with the same callable's value-parameter binding, and an
  unbound type name are diagnostics. An outer type parameter can be referenced
  without accidentally capturing a shadowed inner declaration.
- Type parameters can appear in parameter and return positions and as
  arguments of nested types such as `Option<T>`, `Result<T, E>`,
  `Map<K, V>` or `Box<T>` **when that instantiation is supported**.
  Merely accepting the syntax does not license an unsupported backend ABI.
- Call-site binding uses known argument types, explicit type arguments,
  applicable generic defaults, and an unambiguous expected result type when
  the checker can prove it. Do not infer `T` from an arbitrary body or
  silently substitute `Any` when insufficient evidence exists.
- `identity(42)` may infer `T=int`; `identity<int>(42)` is explicit.
  `make<T>()` with no applicable inputs/default/unique expected result
  requires an explicit type argument.
- Positional generic arguments precede named ones. Named arguments bind by
  parameter **name**, never declaration position; duplicate/unknown names,
  missing required generics, too many arguments, and positional-after-named
  arguments are errors. A default may depend on **earlier** resolved generic
  parameters but not later/unbound parameters; defaults must be checked after
  substitution. Named binding order must not change evaluation order of
  **value** arguments.
- Generic specialization preserves nominal type identity, the language's
  arity-first overload rules, explicit effects, variance restrictions,
  ownership/borrows, `copy!`/`copy!!`, `take!`, and actor isolation.
  Instantiating a template does not grant copying, sharing, sendability or
  new method dispatch capabilities. Generic bounds must be rechecked with
  concrete substituted types, not just accepted at template declaration.

## Return checking is not syntax checking

```atto
fnc missing<T>(): T {
} // parses; E_RETURN: a value of T is not returned

fnc missing_end<T>() -> T
end // fails: no terminal result

fnc discard<T>(T value): void {
} // allowed, subject to ordinary body checks
```

`T` is not implicitly nullable/default-constructible. An explicit return
must have a type compatible with the **instantiated** return type. The body
must satisfy existing definite-return rules on every reachable path.
An abstract/foreign signature is only exempt when an explicit, independently
defined declaration grammar grants that exemption; an empty ordinary body
is never an abstract declaration.

## Compiler and AOT hardening

A native/full-AOT build must close over every permitted concrete
instantiation **before artifact emission**. No runtime compiler, `eval`,
unbounded runtime type specialization, or erased host `Object` fallback is
permitted. An implementation can monomorphize or use proven shared layouts,
provided concrete type/effect/ownership contracts and dispatch identity are
preserved. Instantiations must have deterministic canonical keys, bounded
template expansion and recursive specialization quotas, and cycle diagnostics.

Every compiler stage must either:
1. parse, resolve, type-check, ownership/effect-check, specialize and emit the
   real program; or
2. reject the still-unsupported profile with a stable diagnostic **without
   emitting a guest artifact**.

Never claim a syntax-only parser, host-only oracle, partial AOT wrapper, or a
single concrete `Option<int>` instantiation proves generic implementation.

## Required conformance

The machine-readable [generic callable cases](../conformance/generic-callables-v1.json)
cover both return spellings, all body styles, nested generic return types,
named/defaulted arguments, inference, invalid duplicate/bad-order bindings,
missing returns, and unsupported specialization gates. Each backend must
report `PASS`, `FAIL`, `UNSUPPORTED`, or `NOT_EXECUTED` per case, tied to
an exact source commit/tree, compiler artifact and (for positive cases)
executed guest behavior. Syntax-only tests are not guest evidence.

As of the initial audit, `atto-source.rs` deliberately rejects top-level
`fnc name<T>` before regular function parsing. Its generic `Option`/`Result`
runtime ADTs are limited to specifically admitted concrete instantiations.
`atto-format` and full backends are independently gated; this document
does not claim cross-backend parity.
