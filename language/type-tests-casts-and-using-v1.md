# Type tests, conversion, and scoped using — v1

**Status: proposed; general runtime casts and multi-backend execution NOT VERIFIED (2026-11-16).**

AttoLang remains full-AOT capable. A runtime type predicate requires a known
or statically proven type tag. No conversion may reinterpret arbitrary memory,
bypass ownership, or quietly introduce dynamic reflection.

## Distinct operations

| Syntax | Meaning | Result |
|---|---|---|
| `x is T` | Type predicate, not conversion | `bool` |
| `x is !T` | Negated type predicate | `bool` |
| `on is T as val v` | Type-pattern test, then bind | branch-local `v: T` |
| `T.from(x)` or `T.try_from(x)` | Explicit, type-defined value conversion | T or Result, according to API |
| `using acquire() as r { ... }` | Resource lifetime with cleanup | scoped resource |
| `x as T` | **Not admitted by this contract** | needs separate decision |

`as val name` is a binding qualifier, NOT a conversion operator. In
`using resource as handle`, `as` names the scoped resource, not a cast.

## Outside pattern matching

```atto
fnc inspect(Any candidate): int {
    if candidate is int then
        return 1;
    fi
    return 0;
}
```

A conditional may also bind one fresh, immutable, branch-local name only
after the type predicate succeeds:

```atto
fnc inspect(Any candidate): int {
    if candidate is int as val n then
        return n + 1;
    else
        return 0;
    fi
}
```

The binder `n` is usable only in the `then` arm; it is not visible to
`else`, later statements, or a sibling `elif`. The binder is never
initialized or moved on a failed test. `if x is T as n` is invalid
without a binding qualifier. A compiler supporting `as let` must implement
distinct mutable-name semantics, not silently map it to `as val`.
`if x is T as val n then` is the current bounded Rust/Wasm implementation
profile; general dynamic `Any` requires typed tags and ownership proofs.
Conditional capture currently requires a simple stable identifier operand and
a `then` block. Other forms, including combined `&&` capture and expression
scrutinees, need explicit grammar and dataflow validation.

A successful type test refines the inspected value only while the compiler
can prove its identity and storage are stable. For mutable variables, aliases,
suspension, borrows, actors, or shared references, a stale refinement is
forbidden. The type-test operand is evaluated once. A mismatch is ordinary
false, never a type-cast panic.

`is !T` complements T within the known subject type universe. Excluding int
from a general open Any does NOT establish that the value is string. A type
test on an erased generic, arbitrary FFI object, untagged pointer, or
unreifiable type is a compile-time error unless specialization proves a tag.

## Inside pattern matching

```atto
pub fnc classify(Any value): int {
    return match<int> value over
        on is int as val n when n > 40 -> n + 1,
        on is int -> 0,
        on is string -> -1,
        on _ -> -2
    end;
}
```

- Type test happens before capture; only the matched arm owns its binder.
- `when` reads the already-bound, correctly refined name.
- Failed tests/guards leak no binder, loan, or hidden effect into later arms.
- `on is int as n` is invalid: no implicit binding category.
- `as let n` must respect mutable binding rules; a backend that cannot do so
  must reject rather than lower to `as val n` silently.
- A guard does not prove exhaustiveness; wildcard and explicit closed-case
  coverage still obey reachability, overlap and duplicate-arm diagnostics.
- `is !T` is NOT a reinterpret cast to a different T.
- Switch/case must reuse these semantics once its typed patterns are supported.

The return-expression `match<int>` above is **target syntax**, not evidence
that all backends can lower it.

## Explicit numeric and reference conversion

AttoLang rejects implicit primitive widening/narrowing, pointer
reinterpretation, enum-to-integer casts, float-to-integer truncation,
and reference downcasts. Where defined, a conversion is an explicitly
typed API: lossless `T.from` may return T; fallible `T.try_from` returns
`Result<T, ConversionError>` with checked bounds and rounding rules.
There is no default numeric conversion ABI. `typeof` inspects types; it
does not convert data. Unsafe layout reinterpretation requires a separate
capability-gated FFI/unsafe contract, not ordinary casts.

## `using` is resource scope, not type casting

```atto
using telemetry.span("request") as span {
    span.set_attribute("role", "server");
    do_work();
}
```

A compiler that supports `using` must define resource acquisition and
exactly-once cleanup for normal return, exception/unwind, and cancellation.
Suspension retains the resource frame without leaking or double-closing it.
Hard process abort is not a catchable unwind. Incomplete cleanup machinery
must fail closed without a guest artifact.

## Proof gate

1. Execute guest Wasm/native outputs for positive and negative type tests,
   typed binders, guard success and fallthrough, and mismatch handling.
2. Reject missing capture qualifier, unsupported mutable capture,
   dynamic Any without runtime representation, unknown type tags,
   unchecked `as T`, and misuse of `using`.
3. Verify failed compilation emits no guest artifact or extra capability import.
4. Record compiler SHA, input, target, ABI, actual guest result, and evidence
   status (`passed` / `failed` / `unsupported` / `not executed`) per backend.
5. Repeat for actor/ownership/FFI/suspends boundaries and all backends claiming
   support; host AST or binary-validation tests alone do not prove behavior.

Current Rust browser compiler has only bounded *monomorphic scalar Any*
specialization; it is not general runtime Any or a verified resource manager.
The Java/LLVM/.NET/Wasm/other backends require independent execution receipts.
