# Pipeline-native control-flow subject patterns v1

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

55 |> if |x| x > 54 then "greater" else "lesser";

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

The bars contain a single root parameter pattern, using the shared callable-pattern grammar (atto-spec #260). A bare `|pattern| -> expression` is a lambda; after `match` or `switch` the closing bar is followed by `over`, and after `if` it is followed by the condition. No new reserved keyword. A tuple pattern `|(x, y)|` destructures one input, not two formals; named-field patterns are admitted subject to the same shared pattern grammar and checks. Preserve existing subject-elided forms, typed result annotations, and established delimiters where supported. No new `(as x)` or `(bind x)` syntax is introduced here. Ternary and arbitrary-expression stages use ordinary lambdas.

## Static and dynamic rules

- Evaluate the immediate pipeline input exactly once, even for a default-only match or unused binder. Retain the evaluated subject in a typed place or SSA value. Match and switch dispatch on the entire subject, not an arbitrary projection.
- Bind immutable lexical names by default, scoped to the stage and visible in the condition, branches, guards and arms. No leakage into later stages. Apply existing lexical shadowing policy; duplicate binders within a pattern reject. Type annotations check compatibility, not implicit casts.
- Require irrefutable patterns; reject mismatched shape, arity, refutable literal/variant patterns, inaccessible fields and incompatible annotations. Apply ordinary pattern ownership checks, including moves, loans and lifetime constraints; no implicit copy, transfer, allocation, tuple spreading or lifetime extension. Reject use of a whole subject after a partial move where illegal. Unsupported ownership cases must fail closed.
- Preserve exhaustiveness, source-order testing, guard evaluation, result joins and lazy selected-branch execution; switch retains no implicit fallthrough. A native control-flow stage has no hidden lambda return boundary; return exits the nearest enclosing callable. Effects, suspension and early exits retain existing checks.
- Parse bars contextually after the control-flow keyword in a forward value pipeline; reject malformed bindings and absence of a pipeline input. Preserve existing bitwise, logical, actor-stream and callable syntax. Explicit control-flow binding suppresses automatic argument insertion for the stage. For a completed conditional or ternary stage, the next unparenthesized outer pipe continues the entire result; explicitly group nested branch pipelines. Do not globally change precedence or existing multi-formal pipelines.
- Formatter preserves canonical case/default vs on syntax, typed patterns, delimiters and comments. Require parse/format/parse and idempotence.

## Conformance targets (not executed)

| ID | Stage / scenario | Expected |
| --- | --- | --- |
| match-name | `7 |> match |x| over on 0 -> 1, on _ -> x * 6 end` | 42 |
| switch-name | `7 |> switch |x| over case 0 -> 1, default -> x * 6 end` | 42 |
| switch-statement | main above | return 42 from enclosing callable |
| switch-default | `0 |> switch |int x| over case 0 -> 42, default -> x end` | 42 |
| if-name | `7 |> if |x| x > 5 then x * 6 else 0` | 42 |
| ternary-lambda | `7 |> |x| -> x > 5 ? x * 6 : 0` | 42 |
| tuple-if | `(10, 32) |> if |(x, y)| x > 0 then x + y else 0` | 42 |
| tuple-match | `(10, 32) |> match |(x, y)| over on (0, 0) -> 0, on _ -> x + y end` | 42 |
| recursive | named fib lambda with native match, input 10 | 55 |
| once-only | effectful input, repeated name/default-only stage | exactly one evaluation |
| lazy | unselected branch has observable effect | zero unselected effects |
| continuation | selected value piped into another function | full stage result |
| negative | missing source, duplicate names, malformed bars, wrong type/shape, refutable root, escaped name, non-exhaustive value switch, bad branch join, invalid ownership | positioned rejection, no guest artifact |

In addition, verify nesting, wildcard, named-field patterns, typed headers, source-order guards and case-block early returns. Link to existing work: atto-spec #260 (shared aggregate patterns); atto-lang/atto-source.java#1919 (bounded callable pattern slice); atto-lang/atto-source.llvm#941 (scalar subject-elided pipeline match); atto-lang/atto-platform-conformance#633 (pipeline guest fixture candidates); atto-lang/attolang-language-spec.md#1 (historical proposal, not canonical). Integrate rather than duplicate existing work; the legacy omitted-operand receiver syntax is not decided or expanded by this contract.

Every backend must independently compile and execute positive guest fixtures and reject negatives, with pinned exact compiler/tree, source blobs, toolchain, target and actual runner steps. Host-only checks or zero-step Actions do not establish parity. All backend evidence remains NOT_EXECUTED for this new syntax until authenticated receipts exist.
