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


Square brackets are not an alternate generic declaration or call grammar. For example, `identity[T=int](42)` and `fnc identity[T](T value): T` are invalid generic forms. See the [generic delimiter contract](../spec/02-types-and-patterns.md#generic-delimiters-and-designated-collection-type-notation-owner-decision-2026-11-25) for the distinct designated collection type shorthand. Named runtime argument labels continue to use colons; named generic arguments use equals within angle brackets.

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

## Generic methods must not inherit Go's original restriction

A generic method is a valid declaration **independently of** whether the
receiver is generic, an interface mentions the method, or a backend currently
implements generic interface dispatch. Do not globally prohibit method-local
type parameters as a workaround for a harder dispatch problem.

```atto
define class Box<T> as
    // T is bound by Box; U is bound only by this method.
    identity<U>(U value): U { return value; }
    replace<U>(T old_value, U new_value): U { return new_value; }
    static fnc choose<U>(U value): U { return value; }
end

define class Utility as
    identity<T>(T value): T { return value; }
end
```

The same declaration-level grammar and bound/default/inference checks
apply to free functions, instance methods, static methods, and actor-local
helper methods. Instance methods have an implicit, typed receiver; static
methods do not. A receiver's generic bindings are visible in methods, but
**method-local parameters are separate lexical binders** with stable
declaration identities, never a reinterpretation of the receiver's type
arguments. A method-local parameter may not reuse an enclosing receiver
type-parameter name: reject `Box<T>.identity<T>` rather than silently
capturing or shadowing `T`. Generic method declaration does not require
an implementing interface, interface conformance, or dynamic dispatch.

Method resolution honors existing member visibility, arity-first overload
rules, receiver mutability, generics, and effects. Two overloads must not
become distinguishable **only** by return-type inference or differing
names of generic parameters. Check inherited methods and overrides under
alpha-equivalence of type binders, substituted bounds, effects, ownership,
visibility, and variance; an implementation valid only for one concrete
`U` does **not** implement a method universally quantified over `U`.
Method specialization cannot weaken access control or forge a receiver.

### Generic interfaces: a separate dispatch problem

The **language target** allows generic methods in interface/trait
requirements; it must not delete generic methods from concrete types'
method sets just because an AOT backend cannot yet dispatch them. Interface
checking quantifies over every admissible method type argument; verifying
one `transform<int>` specialization is insufficient evidence for a
generic `transform<U>` requirement.

There are separate implementation capabilities:

1. **Static receiver / direct concrete method call:** specialize using
   the concrete receiver type arguments and independently inferred or
   explicit method type arguments; no virtual dispatch is required.
2. **Interface/trait generic method call:** resolve a valid conformance
   witness plus the method's concrete type arguments; emit an exact
   type/effect/ownership-preserving dispatch path. A finite closed-world
   dispatch table or a proven uniform dictionary ABI can be used.
3. **Open-world or runtime-type-derived invocation:** only legal when
   the backend proves a complete stable generic calling convention
   across that boundary. Otherwise issue a specific
   `E_GENERIC_DISPATCH_OPEN`/unsupported-profile diagnostic **before
   emitting any artifact**, not an accidental interface-only language ban.

Interface witnesses and any generated vtables are keyed by **declared method
identity and generic signature**, not by a handful of observed
specializations. Exhaustive AOT instantiation closure must include every
reachable indirect call and all implementing receiver alternatives.
Runtime dynamic loading/hot-reload must respect the same versioned
ABI closure; new type specializations cannot silently require JIT or
unverified code.

### Method values and actor boundaries

A **concretely instantiated** bound method value (such as
`box.identity<int>`) retains receiver ownership/lifetime and its exact
callable type. An **uninstantiated** generic method value
(`box.identity` without a unique type instantiation) is higher-rank
polymorphism, a separate capability: require a proven polymorphic callable
ABI or reject explicitly. Never erase it to `Any` or invent an implicit
instantiation.

Actor-local helper methods may be generic, including within
`define serial actor`; their method type arguments do not authorize direct
access to sealed actor state or bypass critical read/write restrictions.
Cross-actor sends are a **separate typed message protocol**, not arbitrary
dynamic invocation of a generic actor method. Every permitted message
instantiation must satisfy the mailbox's Sendable/Serializable and
ownership/transfer requirements and have a finite, proven dispatch and
wire-format identity. Unsupported message instantiations must fail closed.
The declaration of a generic actor-local helper itself must remain legal.

### Compiler identity and cross-backend evidence

Specialization keys include a stable receiver declaration identity, its
concrete type arguments (when any), a stable method declaration identity,
method-local type arguments, and the required calling-convention/ABI
version. Never key solely by method name, textual `T`/`U`, or inferred
return type. Explicit and inferred calls resolving to the same
instantiation must agree on type, effects, ownership, and executable
behavior. The same proof obligations apply in Rust/Wasm, Java/Graal,
LLVM, .NET Native AOT and Forge; no backend may report parity based on
another backend's host-only parsing or formatting fixtures.

The companion registry contains receiver/method-generic positive cases,
invalid binder cases, and distinct explicit **gates** for indirect generic
interface dispatch, uninstantiated method values, and cross-actor generic
message ABI. A gate is not an accepted executable feature and may only
be promoted after exact-head target execution and negative compile
evidence.
