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
```

For `switch`, **`case Pattern` is canonical**; `on Pattern` remains an accepted compatibility spelling. `default`, `case _` and `on _` denote the wildcard arm. `match` keeps `on Pattern` as its canonical spelling. Neither statement-form `switch` nor `return switch` has C-style implicit fallthrough. An explicit `break` does not substitute for a value-producing arm; every selected arm must return/yield its checked result or definitely diverge.

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
