# Control-flow delimited subjects and pipeline subject patterns v1

Status: language-owner-approved syntax direction; implementation and guest execution not verified.

## Syntax

```atto
value |> match |x| over
    on 0 -> 1,
    on _ -> x * x
end;

value |> switch |int x| over
    case 0 -> 1,
    default -> x * x
end;

55 |> if |x| x > 54 then "greater" else "lesser" fi;

55 |> |x| -> x > 54 ? "greater" : "lesser";
```

**Switch uses canonical `case` and `default`; match uses canonical `on` and `on _`.** Retain existing compatibility spellings only as defined by [typed-match-switch-arms-v1](typed-match-switch-arms-v1.md). The pipeline header does not change the distinction between statement switch and value switch. No implicit fallthrough. Statement-position case blocks can explicitly return from the enclosing callable, whereas value-position arms must yield the checked result or definitely diverge.

```atto
pub fnc main(): int {
    7 |> switch |x| over
        case 0 -> { return 1; }
        default -> { return x * 6; }
    end;
}
```

In a pipeline-native header, the bars contain a single root parameter pattern, using the shared callable-pattern grammar (atto-spec #260). A bare `|pattern| -> expression` is a lambda; after `match` or `switch` the closing bar is followed by `over`, and after `if` it is followed by the condition. No new reserved keyword. A tuple pattern `|(x, y)|` destructures one input, not two formals; named-field patterns are admitted subject to the same shared pattern grammar and checks. Preserve existing subject-elided forms, typed result annotations, and established delimiters where supported. No new `(as x)` or `(bind x)` syntax is introduced here. Ternary and arbitrary-expression stages use ordinary lambdas.

## Standalone delimited subjects (approved extension)

Outside the immediate RHS of a forward value pipeline, `match |expression_list| over` and `switch |expression_list| over` are alternate subject delimiters. Their contents are expressions resolved in the existing lexical environment, not declarations. The existing undelimited subject spelling remains valid.

```atto
fnc classify(int v): int {
    return match |v| over
        on 0 -> 1,
        on _ -> v * v
    end;
}

fnc combine(int a, int b): int {
    return switch |a, b| over
        case (0, 0) -> 0,
        default -> a + b
    end;
}
```

- Determine the header mode from the immediate syntactic relationship to the pipe, never name resolution or the presence of a pipeline elsewhere in the enclosing callable. A match inside a piped lambda body is standalone unless that match itself is the immediate pipeline stage.
- In explicit-subject mode, one expression retains its original type and identity. Two or more comma-separated expressions form an ordered logical product with one component per expression. Evaluate left to right exactly once, even on default-only dispatch; stop on an exceptional or diverging evaluation and clean up already-initialized owned components according to normal rules.
- Neither form spreads arguments, changes a callable's arity, implicitly flattens nested products, or creates a new callable. A product may be represented by typed slots rather than a heap tuple, but ordinary tuple type, ownership and lifetime semantics must be preserved. Arm patterns destructure the product with ordinary pattern rules. Existing outer names remain in scope; explicit headers do not introduce names. Computed expressions do not acquire invented names.
- In pipeline mode, `value |> match |(x, y)| over` destructures one input, whereas `value |> match |x, y| over` remains invalid (two root formals). This differs intentionally from standalone `match |x, y| over`, which reads two existing expressions. No implicit spreading in either mode.
- Parse the standalone list with grammar-aware comma/bar delimiters; nested parentheses preserve grouping. For v1, an unparenthesized top-level single bar closes the header; group bitwise OR explicitly, e.g. `match |(a | b)| over`. Logical OR tokens and nested expression grammar are preserved. Reject empty lists, unresolved names and patterns used as standalone declarations. Formatter must preserve the semantic header mode and grouping.
- This extension covers standalone match/switch only; the existing standalone if grammar remains unchanged. Pipeline-native if bindings and ordinary lambdas retain their existing rules.

Acceptance cases: standalone single subject; multiple subjects and nested tuple components (no flattening); computed subjects with observable left-to-right once-only evaluation; explicit subject inside a named recursive pipeline lambda; grouped bitwise OR; standalone switch case/default; unresolved explicit subject; root arity mismatch in pipeline mode; and ownership violations across components. All require backend execution or relevant positioned rejection, not just parser acceptance.

### Delimited-header edge-case audit

- Mode is fixed during parsing from the enclosing production: direct native pipeline stage versus ordinary match/switch expression. No fallback from one mode to another after a lookup/type error. An ordinary match inside a named lambda, guard, arm, or nested call is not made a native stage by an outer pipe.
- Preserve list cardinality and nested product shape in the AST. In explicit mode `|a|` has the type of a; `|a,b|` has a two-component product type; `|(a,b),c|` has shape ((A,B),C). The latter cannot match a flat three-component pattern. Repeated explicit expressions such as `|a,a|` are permitted when normal ownership rules allow; repeated declarations such as `|(x,x)|` in binder mode reject. Do not confuse these two checks.
- A standalone `|missing|` must resolve and type-check even if every arm is a constant fallback. A pipeline root pattern must also be checked even if every binding is unused. Empty headers reject in both modes; v1 does not introduce empty unit-subject or zero-argument call semantics.
- Delimited explicit expressions are evaluated in source order into distinct typed slots. Use ordinary evaluation of each expression, not deduplication by spelling or AST equality. The same effectful expression written twice must run twice; a single expression matched against many arms runs once. Preserve nonlocal exits, cleanup and ownership, including early failure of a later component.
- No implicit conversion of `|x,y|` to `|(x,y)|` by the formatter or parser in native mode. Do not normalize standalone `|v|` into a pipeline or rewrite a nested tuple to multiple arguments. Record header mode, root arity and spans; reject unsupported constructs rather than silently changing shape.
- Trailing comma, empty entries, and ungrouped top-level bitwise OR in explicit headers are intentionally not admitted by this v1 proposal; nested tuple/call punctuation follows its existing grammar. Group the OR expression explicitly. Keep canonical switch case/default and ordinary match on/on _ rules.

Conformance PR atto-lang/atto-platform-conformance#633 contains ten additional source fixtures covering explicit scalar/product/computed/nested subjects, recursive named lambda with standalone match, native tuple destructuring, and unresolved/duplicate/arity/empty rejection. These fixtures are not execution evidence. Still require effect counters, early error cleanup, repeated explicit expressions, nested shape mismatch diagnostics, formatter round-trip and non-Copy ownership tests.

## Static and dynamic rules

- Evaluate the immediate pipeline input exactly once, even for a default-only match or unused binder. Retain the evaluated subject in a typed place or SSA value. Match and switch dispatch on the entire subject, not an arbitrary projection.
- Bind immutable lexical names by default, scoped to the stage and visible in the condition, branches, guards and arms. No leakage into later stages. Apply existing lexical shadowing policy; duplicate binders within a pattern reject. Type annotations check compatibility, not implicit casts.
- Require irrefutable patterns; reject mismatched shape, arity, refutable literal/variant patterns, inaccessible fields and incompatible annotations. Apply ordinary pattern ownership checks, including moves, loans and lifetime constraints; no implicit copy, transfer, allocation, tuple spreading or lifetime extension. Reject use of a whole subject after a partial move where illegal. Unsupported ownership cases must fail closed.
- Preserve exhaustiveness, source-order testing, guard evaluation, result joins and lazy selected-branch execution; switch retains no implicit fallthrough. A native control-flow stage has no hidden lambda return boundary; return exits the nearest enclosing callable. Effects, suspension and early exits retain existing checks.
- Parse bars contextually after the control-flow keyword: a direct forward-pipe stage has one root binding pattern; a standalone match/switch has an explicit subject-expression list. Reject malformed headers and unresolved names. Preserve existing bitwise, logical, actor-stream and callable syntax. Explicit control-flow binding suppresses automatic argument insertion for the stage. For a completed conditional or ternary stage, the next unparenthesized outer pipe continues the entire result; explicitly group nested branch pipelines. Do not globally change precedence or existing multi-formal pipelines.
- Formatter preserves canonical case/default vs on syntax, typed patterns, delimiters and comments. Require parse/format/parse and idempotence.

## Audit hardening: parser, dispatch and ownership invariants

The following is a proposed refinement of the approved syntax; existing switch/match arm contracts and ordinary conditional terminator rules remain authoritative.

- Parse a native binding stage only as the immediate RHS of a forward value pipe, with one complete root pattern between the bars. Standalone match/switch headers use the explicit-subject grammar below. For match/switch, the optional existing result type header precedes the binding (for example `switch<int> |int x| over`); `over` follows the closing bar. For if, parse the ordinary Boolean condition and existing then/else/fi grammar after the closing bar. Use explicit `fi` in portable fixtures. Do not reinterpret ordinary `if` conditions, lambda bars, bitwise OR, logical OR, or an actor pipe. Reject `|x, y|` in a native unary header; `|(x, y)|` is a single tuple pattern. No new bare or prefix binder syntax is implied.
- Keep the stage subject binding separate from arm-local pattern binders and from result annotations. A header name is in scope in guards and bodies, but never in the source expression to its left or the following stage. Arm-local names follow existing shadowing rules and cannot leak to sibling arms. Nested native stages have independent typed subject slots; closing a nested stage restores the outer lexical environment.
- Match/switch must preserve the complete original subject for dispatch. Evaluate the input before any guard, including default-only and discard-only patterns. A checked binding plan may establish read-only projections or loans before dispatch; it must not consume a field that subsequent dispatch or guards require. A backend without sound deferred move/loan lowering must reject such patterns. Do not silently upgrade a borrow into ownership or materialize an implicit copy. Release loans and destroy owned temporaries exactly once on normal exit, nonlocal return, error and cancellation; enforce existing suspension checks.
- Lower the construct to a typed subject temporary plus control-flow regions, not to a synthetic callable. Guard failure proceeds to the next arm; an unconditional fallback terminates coverage. Keep canonical switch `case/default` and canonical match `on/on _`, while retaining only compatibility forms already specified in the existing arm contract. Reject duplicate unconditional cases, extra arms after unconditional fallback, incompatible header/arm annotations and non-Boolean guards. Do not reinterpret a guarded catch-all as exhaustive.
- A statement switch may continue after the selected case completes, under existing statement rules. A value switch must produce a checked value on every normally completing path; a block that merely falls through is not a value. Explicit `return` or `^` exits the nearest enclosing callable, not a synthetic pipeline lambda. A return inside an actual nested lambda or task keeps its own boundary. A subsequent pipeline stage executes only on a normal value-producing path. Preserve existing rules for break and continue; this contract introduces no new targets.
- Parse and format using complete syntax trees, including typed headers and nested bars. For a native if stage, an outer pipe after the completed conditional consumes its result; a pipe inside a branch belongs to that branch under existing delimiter/grouping rules. Do not change precedence globally, including existing ordinary callable/ternary pipelines. Test both legacy and new spellings independently.

### Additional executable acceptance oracles (pending)

Use separate source fixtures, not a single aggregate smoke test that can hide an unevaluated branch. Each positive needs a precise exit/stdout or effect-count oracle; each negative needs a relevant positioned diagnostic and no emitted guest artifact. Infrastructure failures, unsupported syntax, and unexecuted tests are separate evidence states.

- Switch nonlocal exit: cases return 42 and a later enclosing return 99 is not reached. Separate statement switch normal continuation must reach the next statement without fallthrough.
- Switch value with mixed yielding and diverging arms: the selected value reaches a following stage; selecting the return arm bypasses it. A nested real lambda return must not escape the enclosing callable.
- Once-only: an effectful subject increments an observable counter; assert counter == 1 even with default-only, multiple failed guards, repeated reads and a discarded root. A trapping subject must not reach the fallback.
- Dispatch: tuple subject (10, 32), case (0, 0) versus default, and a distinct matching non-default case. Test guard order with a false first guard and true second guard, and prove unselected bodies execute zero times.
- Ownership: reject non-Copy destructive projections used again by dispatch, escaping stage-local loans, conflicting mutable loans and illegal live loans across suspension. Verify destructor/cleanup counts in supported owned cases.
- Grammar/formatter: round trip typed switch, typed arm result, nested patterns, comments, logical OR in conditions, nested stages, canonical case/default and legacy aliases; reject unresolved standalone subject names, empty/malformed bars, extra root formals in a pipeline binding, extra explicit subject in a pipeline binding, duplicate pattern names and incompatible types. Confirm unrelated callable and actor pipeline behavior is unchanged.
- Recursive named lambda: input 10 gives 55, using an explicit return type; test both ordinary match and native pipeline match. Avoid naive Fibonacci(55) as a CI fixture (overflow for int and excessive recursion).

## Conformance targets (not executed)

| ID | Stage / scenario | Expected |
| --- | --- | --- |
| match-name | `7 \|> match \|x\| over on 0 -> 1, on _ -> x * 6 end` | 42 |
| switch-name | `7 \|> switch \|x\| over case 0 -> 1, default -> x * 6 end` | 42 |
| switch-statement | main above | return 42 from enclosing callable |
| switch-default | `0 \|> switch \|int x\| over case 0 -> 42, default -> x end` | 42 |
| if-name | `7 \|> if \|x\| x > 5 then x * 6 else 0 fi` | 42 |
| ternary-lambda | `7 \|> \|x\| -> x > 5 ? x * 6 : 0` | 42 |
| tuple-if | `(10, 32) \|> if \|(x, y)\| x > 0 then x + y else 0 fi` | 42 |
| tuple-match | `(10, 32) \|> match \|(x, y)\| over on (0, 0) -> 0, on _ -> x + y end` | 42 |
| recursive | named fib lambda with native match, input 10 | 55 |
| once-only | effectful input, repeated name/default-only stage | exactly one evaluation |
| lazy | unselected branch has observable effect | zero unselected effects |
| continuation | selected value piped into another function | full stage result |
| negative | unresolved explicit subject, duplicate binding names, malformed bars, wrong type/shape, refutable root, escaped name, non-exhaustive value switch, bad branch join, invalid ownership | positioned rejection, no guest artifact |

In addition, verify nesting, wildcard, named-field patterns, typed headers, source-order guards and case-block early returns. Link to existing work: atto-spec #260 (shared aggregate patterns); atto-lang/atto-source.java#1919 (bounded callable pattern slice); atto-lang/atto-source.llvm#941 (scalar subject-elided pipeline match); atto-lang/atto-platform-conformance#633 (pipeline guest fixture candidates); atto-lang/attolang-language-spec.md#1 (historical proposal, not canonical). Integrate rather than duplicate existing work; the legacy omitted-operand receiver syntax is not decided or expanded by this contract.

Every backend must independently compile and execute positive guest fixtures and reject negatives, with pinned exact compiler/tree, source blobs, toolchain, target and actual runner steps. Host-only checks or zero-step Actions do not establish parity. All backend evidence remains NOT_EXECUTED for this new syntax until authenticated receipts exist.
