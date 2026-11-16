# Typed result annotations on `match` and `switch` arms (v1 proposal)

**Status:** proposed language contract, **NOT** verified portable compiler/backend behavior. No Java, LLVM, .NET or Rust/Wasm parity is implied by this document.

## Surface grammar

```ebnf
match_arm      = "on", pattern, [ "when", expression ], [ ":", type_ref ], "->", arm_body ;
switch_arm     = ( "case" | "on" ), pattern, [ "when", expression ], [ ":", type_ref ], "->", arm_body ;
switch_default = ( "default" | ( "case" | "on" ), "_" ), [ ":", type_ref ], "->", arm_body ;
arm_body       = expression | block ;
return_match   = "return", "match", [ "<", type_ref, ">" ], subject, "over", { match_arm }, "end", ";" ;
return_switch  = "return", "switch", [ "<", type_ref, ">" ], subject, "over", { switch_arm | switch_default }, "end", ";" ;
switch_stmt    = [ "do" ], "switch", [ "<", type_ref, ">" ], subject, "over", { switch_arm | switch_default }, "end" ;
legacy_switch_stmt = "switch", subject, { switch_arm | switch_default }, "end" ;
```

For `switch`, **`case Pattern` is canonical**; untyped legacy statement `switch subject case P -> { ... } end` without `over` is retained for Java compatibility. Typed `switch<T>` requires `over` so its result type cannot be parsed ambiguously.  `on Pattern` remains an accepted compatibility spelling. `default`, `case _` and `on _` denote the wildcard arm. `match` keeps `on Pattern` as its canonical spelling. Neither statement-form `switch` nor `return switch` has C-style implicit fallthrough. An explicit `break` does not substitute for a value-producing arm; every selected arm must return/yield its checked result or definitely diverge.

The `:` **after the completed pattern/guard** and before the *arm* `->` annotates the **arm's produced value**, never the matched payload, binder type, or thrown error. A `:` inside `{ field: pattern }`, an argument, or a nested type does not terminate the pattern. Parsing is grammar-aware, not a search for the nearest colon. The arrow is `->`, never `=>`. `on _` is canonical; existing `default` variants remain accepted where already supported.

Examples:

```atto
return match<int> result over
    on Err(error) : int -> -3,
    on Ok(value) : int -> match<int> value over
        on Some(n) : int -> n + 1,
        on None : int -> 0
    end,
end;
```

```atto
pub susp fnc choose(): int {
    return match<int> result over
        on Err(error) : int -> await task { return -3; },
        on Ok(value) : int -> await task {
            return match<int> value over
                on Some(n) -> n + 1,
                on None -> 0
            end;
        },
    end;
}
```

## Switch/case examples

```atto
// Return-position value switch.
return switch<int> result over
    case Err(error) : int -> -3,
    case Ok(value) : int -> value + 1,
    default : int -> 0,
end;
```

```atto
// Statement switch: each arm must exit the enclosing callable.
switch<int> state over
    case #ready : int -> { return 42; }
    case #failed : int -> { return -1; }
    default : int -> { return 0; }
end
```

```atto
// Awaited selected case, no eager execution of unselected tasks.
pub susp fnc choose(): int {
    return switch<int> result over
        case Err(error) : int -> await task { return -3; },
        case Ok(value) : int -> await task { return 42; },
    end;
}
```

A compiler must preserve match's single-evaluation, source-order, scope, exhaustiveness, and safety checks for switch, and **must not** duplicate the scrutinee evaluation or evaluate an unselected case body. In the current restricted Rust/Wasm compiler proposal, `switch<T>` in statement position means all cases must definitely return/throw from their enclosing callable. Full first-class switch values and task capture are separate milestones. The symbolic `#ready` example is target language syntax, not a claim the current Rust/Wasm backend supports symbols.

## Type, control-flow and effects

1. A value-producing `match<T>`/`switch<T>` has exactly the result type `T`; every *value-yielding* arm must be compatible with `T` using existing explicit conversion rules (no implicit number, Option, Result, or Future flattening).
2. `on P : U -> e` independently demands that the arm **yield** `U`. When enclosed by `match<T>`, check both constraints and reject incompatible `U` versus `T` even when the arm is unreachable at runtime. Unannotated arms infer their yielded type from the expected match type or their expression.
3. Ordinary `{ return e; }` exits the **lexically enclosing callable**, not the match expression: the return statement is checked against the callable return type, and its control-flow type is bottom (`Never`). Thus a diverging arm is compatible with any match-result type, but its declared `: U` does **not** change the return type of `e`. A block not proven to yield or diverge is rejected for a value match. A `throw` may also diverge according to the error-effect contract; `raise` and `panic` never turn into ordinary values.
4. A `return` **inside `task { ... }`** exits only the task. `task { return e; }` yields `Future<T>` for a task result `T`; `await task { return e; }` yields `T` and requires a `susp`/`suspends` context. The arm annotation applies *after* `await`. `on P : int -> task { return 42; }` is a type error; `on P : Future<int> -> task { return 42; }` is permitted.
5. Every `await` must honor cancellation, scheduler cooperation, borrow/move safety and suspension effects. Task failures retain the established throw/raise/panic/error behavior; annotation never traps, swallows, unwraps or converts failures.
6. Evaluate the scrutinee exactly once; test arms in source order; run guards only after patterns bind; run the chosen arm exactly once. Enforce exhaustiveness, duplicate/unreachable-pattern diagnostics, and arm-local binding lifetimes. A type annotation changes no dispatch behavior.
7. A non-value statement-form `match` or `switch` may use `: U` only where an arm establishes a checked value-result or a definite enclosing-callable exit according to its existing grammar. Implementations **must not** accept a fallthrough block as a successful `U` value.
8. Structured nested patterns, generic result annotations, delimiters and multiline formatting must round-trip without confusing `:` in patterns with the result annotation. A malformed `: ->`, double annotation, or `=>` produces a positioned syntax diagnostic without emitted guest code.

## Verification gates

- Positive: explicit and inferred `int` / `bool` / `Result<T,E>`; nested `match<T>`; guarded payload binding; binary expressions; exhaustive `switch`; mixed value and diverging arms; `Future<T>` arms; `await task` arms in suspending callables.
- Negative: arm type conflict, header-vs-arm conflict, ordinary task without await in `: int`, illegal await in non-suspending callable, mismatched future type, non-exhaustive arms, unreachable duplicates, braced fallthrough, invalid annotation position, and ownership violations spanning await.
- Prove real parsed/checked/executed guests (not fixtures alone) on **Rust/Wasm, Java, LLVM and .NET** independently. Pin exact tree/blob identities, native and guest return/stdout/diagnostic oracles, and failure/unsupported/not-executed distinctions. A backend that rejects syntax remains **UNSUPPORTED**, not certified.
- Compiler implementation can be staged: parser/typed-return subset first; first-class value match, nested expressions, `switch<T>`, and async runtime only after real executable evidence. Backends must fail closed rather than silently accept an annotation they do not check.

## Compatibility

Unannotated `on P -> e` and existing `case P -> e` retain their meanings. The new annotation is optional and does not change unrelated callable `fnc foo(): T`, pattern-field `:`, typed bindings or the existing typed `match<T>` header. Canonical formatter spacing: `on P : T -> e` for match and `case P : T -> e` for switch; preserve guards and nested field-pattern colons.


## ADT payload binders, `when` and exhaustive coverage

The pattern `Ok(value)` or `Err(error)` binds the selected variant's
payload to an immutable, arm-local name. The same syntax applies to
`Some(item)`, to `case` labels in a typed `switch`, and to whole-value
bindings such as `on n when n > 0`. A binding exists for its guard and
body only, never in sibling arms or after the match. The scrutinee must
be evaluated exactly once. A guard is checked as `bool`; it is evaluated
only after the variant matches and **after the payload binder has been
initialized under a successful tag test**. Its false result means
"try the next arm", not "take the selected arm anyway".

An empty tagged pattern such as `Ok()`, `Err()`, `Some()`, or explicit
`Ok(_)`, `Err(_)`, `Some(_)` matches the variant but discards its
payload; it must not create implicit locals named `value` or `error`.
Constructors `Ok()` and `Err()` are *not* valid payload constructors;
`None` is a zero-payload variant and `None()` is not accepted in the
currently admitted language profile.

A guarded pattern `on Ok(v) when predicate(v)` **does not make
`Ok` exhaustive**, because its guard can fail. Even two guarded
patterns `on Ok(v) when v > 0` and `on Ok(v) when v <= 0` cannot
be accepted as unconditional coverage without a separately verified
decision procedure; the v1 checker is deliberately conservative.
An unguarded `on Ok(v)` / `on Ok()` / `on Ok(_)` does cover all `Ok`
values. The same applies to `Err` and `Some`. A successful unguarded
wildcard `on _` or `default` covers the remaining cases, and must
be unreachable to any subsequent arm. Repeated *guarded* cases of
the same variant are allowed until an unguarded one consumes that
variant. A later case for an already unconditionally covered variant
is rejected as unreachable.

```atto
fnc checked(): Result<int,string> {
    return Ok(41);
}

pub suspends fnc main(): int {
    return match<int> checked() over
        on Err(error) when error != "E3" : int -> 0,
        on Ok(value) when value > 5 : int ->
            await task { return value + 1; },
        default : int -> 10,
    end;
}
```

The return arm result annotation `: int` is independent of the
payload binder's type. `when` never affects the `match<int>` result
type; it affects only dispatch. The `return` inside a task exits the
task, not the parent function.

The executable Rust/Wasm profile referenced by [compiler #247](https://github.com/atto-lang/atto-source.rs/pull/247)
currently admits `Result<int,string>`, not a general
`Result<int,Error>` with a structured `error.code` property. The
supported inequality token there is `!=`; do not silently
interpret `!==` as a different or equivalent operator without
separate compiler and formatter contract approval. Java/LLVM/.NET
must independently implement/check the same typed binding,
guard ordering and exhaustiveness contract before parity is claimed.

The arm-local binder mechanism is distinct from the ordinary
callable/lambda argument binder `|x| -> expression`, the
`for value in iterator` loop binder, and optional
`if expression as let value` conditional binding. Those forms
share lexical scoping principles, but are not interchangeable
syntax; a backend that has not implemented them must reject
rather than silently desugar to an untyped global.
