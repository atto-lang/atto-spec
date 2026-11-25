# Result/Option payload discard patterns (v1 proposal)

**Status:** proposed portable AttoLang semantic contract. Rust/Wasm implementation is tracked in [atto-source.rs #246](https://github.com/atto-lang/atto-source.rs/pull/246), stacked on #245 and #236; this document does not certify Java, LLVM, .NET, or any backend.

## Pattern grammar

```ebnf
result_pattern = ("Ok" | "Err"), "(", [ "_" | identifier ], ")" ;
option_pattern = "Some", "(", [ "_" | identifier ], ")" | "None" ;
```

Inside `match` and `switch/case` **patterns**, `Ok()` and `Ok(_)` both match the `Ok` variant and **discard** its payload. `Err()` and `Err(_)` do the same for `Err`; `Some()` and `Some(_)` for `Some`. `Ok(value)`, `Err(error)`, and `Some(value)` instead introduce explicit **arm-local** lexical bindings of the corresponding typed payload. No binder named `value`, `error`, `_`, or any other identifier is synthesized by an empty or wildcard pattern. `_` is a wildcard, never a variable.

The canonical formatter may preserve `()` or `(_)`; either form has **exactly identical** pattern-matching semantics. `Ok`, `Err`, and `Some` with no parentheses are not shorthand for matching their payload-bearing variants. `None` is already a nullary variant: `None()` and `None(_)` are arity errors. A pattern for a variant of the wrong ADT family is a type error. A named payload binding on a truly payload-free variant is an arity error.

These rules are **contextual**: a constructor `Ok()`, `Err()` or `Some()` still must satisfy the variant's actual constructor payload type/arity. The existence of a discard pattern never permits constructing an omitted non-void payload. Backends may represent a genuinely void/zero-field variant differently under a separately specified typed constructor contract.

## Guards, ownership, and exhaustiveness

- Evaluate the matched scrutinee exactly **once**, and test patterns/guards in source order. `when` is evaluated only if the variant tag matches; its expression must have type `bool`.
- A named payload binder is initialized **before** its guard executes. Projection is tag-checked: no guard or arm may read an `Err` payload from an `Ok` or vice versa. A discard must perform no payload projection/binding just to check its tag.
- A discarded payload is not implicitly copied, borrowed, moved, taken, or made visible as a new lexical variable. Existing scrutinee ownership, lifetime, and cleanup obligations still apply; discarding the pattern binder does **not** leak heap data or waive required destruction.
- Bindings live only in their own arm and its guard. Referring to a nonexistent implicit binding must fail with an unbound-variable diagnostic **before guest code emission**. An explicit outer lexical variable with the same spelling follows normal shadowing rules; there is no special synthetic fallback.
- An **unguarded** `Ok()` or `Ok(_)` covers the entire `Ok` variant; similarly for `Err` and `Some`. A guarded variant pattern alone is **not** exhaustive, even if its guard appears tautological. A subsequent unguarded pattern for the same variant after a prior unguarded one is unreachable. `Result<T,E>` is exhaustive when both variants have unconditional coverage, or a reachable unguarded wildcard/default provides it. Equivalent rule for `Option<T>`: `Some` plus `None`.
- These rules apply identically to `on` arms in `match` and `case` arms in `switch`, with or without `: T` arm annotations, and independently of whether the selected arm returns immediately or uses `await task`. Suspension and capture rules are unchanged: discarding a payload cannot create task captures.

## Examples

```atto
fnc checked(): Result<int,string> { return Ok(41); }

pub suspends fnc main(): int {
    return match<int> checked() over
        on Err() : int -> 0,
        on Ok(value) when value > 5 : int ->
            await task { return value + 1; },
        on Ok(_) : int -> 10,
    end;
}
```

```atto
return switch<int> checked() over
    case Err(_) : int -> -1,
    case Ok() : int -> 42,
end;
```

```atto
// Reject E_UNBOUND: Ok() deliberately does not bind 'value'.
return match<int> checked() over
    on Ok() : int -> value + 1,
    on Err() : int -> 0,
end;
```

## Minimum conformance matrix

**Accept and execute:** `Ok()` / `Err()` / `Ok(_)` / `Err(_)` in both match and switch, `Some()` / `Some(_)` with `None`, mixed named and discarded arms, guarded fallthrough, named guards reading payloads after tag checks, wrong-tag guard short-circuit, exact-once scrutinee evaluation, typed-arm return, and supported `await task` arm. Assert guest exit and/or stdout.

**Reject without emitting guests:** implicit binder references in body or guard, leaked arm-local binders, two unguarded spellings of the same variant, exhaustive claims from guarded-only variants, mismatched ADT families, `None()` / `None(_)`, wrong payload arity in constructor position, and invalid non-bool guards.

**Backend evidence:** pin compiler commit/tree and fixture Git blobs; run real native/AOT-produced guests as well as diagnostic/no-artifact negatives separately on Rust/Wasm, Java/Graal, LLVM, and .NET NativeAOT. Record `PASS`, `FAIL`, `UNSUPPORTED`, and `NOT_EXECUTED` distinctly. A PR or workflow queued without executed steps is **not** successful conformance evidence.

Related typed-arm proposal: [typed-match-switch-arms-v1.md](typed-match-switch-arms-v1.md).
