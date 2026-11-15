# 27 — Value conditionals and imperative `do if`

**Status:** TARGET grammar decision, 2026-11-14. A backend is conformant only after actual parser, type-checker, runtime/IR, and negative-fixture evidence at an exact commit. The Java reference compiler currently stages this in the opt-in `parseStrictAtto` entry point; legacy entry points retain historical acceptance for source migration. Do not claim five-backend parity from a spec or parser-only test.

## Forms and meaning

| Form | Category | Result | Required closing syntax |
| --- | --- | --- | --- |
| `if condition then left else right fi` | Expression | Value of the selected branch | `else` and `fi` |
| `condition ? left : right` | Expression | Value of the selected branch | Both arms |
| `do if condition then ... [else ...] fi` | Statement | No value | `fi` |
| `if condition { ... } [else { ... }]` | Statement | No value | Matching braces only |

Expression-form `if` requires a boolean condition and compatible static value types on both arms. Evaluate its condition exactly once, evaluate only the selected arm, and honor ownership/move/borrow checks when joining branch results. The initial portable implementation supports a single expression per value arm. A future block-valued extension must specify tail-expression rules explicitly rather than treating an imperative block as a value.

There is no implicit conversion from statement `if` to expression `if`, and no implicit fallback for a keyword-delimited `if` without `do`. The `else` of a value `if` is mandatory; the `else` of a statement `if` is optional.

## Control transfers are not values

A bare `break`, `continue`, or `return` cannot serve as the result of an `if` expression, even when a backend models unreachable paths using a bottom/never type. No implicit coercion of a control-transfer statement into a value expression is admitted. Such transfers are permitted in a `do if` or brace-style conditional when the enclosing lexical context allows them.

```atto
// OK: a typed conditional value.
val int selected = if ready then 7 else 9 fi;

// OK: a loop exit, never a value.
loop {
    do if complete then break; fi
    work();
}

// OK: alternative imperative spelling.
loop {
    if complete { break; }
    work();
}

// ERROR: expression-style if is not an imperative break.
loop {
    if complete then break; fi
}

// ERROR: expression-style if has no else value.
val int answer = if ready then 7 fi;

// ERROR: a control transfer cannot be a value arm.
val int answer = if ready then break else 7 fi;
```

`break` and `continue` must still be rejected outside the correct loop. `return` must still be rejected outside the correct callable. A nested closure cannot use a `break` belonging to an outer loop. Existing ownership and effect diagnostics apply equally to the two imperative forms.

## Grammar and front-end boundary

```ebnf
if_expr   = "if" bool_expr "then" expr "else" expr "fi" ;
if_stmt   = "do" "if" bool_expr "then" { stmt } [ "else" { stmt } ] "fi"
          | "if" bool_expr "{" { stmt } "}" [ "else" "{" { stmt } "}" ] ;
ternary   = expr "?" expr ":" expr ;
```

Context is significant: `return if ...`, assignment initializers, call arguments and parentheses require expressions, whereas a statement-level `do if` or brace-style `if` is an imperative statement. The lexer reserves `do` and `if` separately; do not add a fused `do-if` token. Both imperative syntaxes lower through the same conditional statement representation; value `if` may share checked lowering with the ternary expression.

The formatter preserves `do if` versus brace-style `if`; it must never silently rewrite a value-form conditional into imperative statements. New source and regression fixtures use `.atto`. Legacy `.ores` remains for explicit compatibility tests.

## Required diagnostics and conformance gates

| Input condition | Required outcome |
| --- | --- |
| `if true then break; fi` in a loop | Compile failure: use `do if` |
| `return if true then 1 fi;` | Compile failure: missing `else` value |
| `return if true then break else 1 fi;` | Compile failure: control transfer is not an expression value |
| `do if true then break; fi` in a loop | Accepted and exits the loop |
| `do if true then break; fi` outside a loop | Compile failure: invalid loop exit |
| `if ready { act(); } else { retry(); }` | Accepted statement, no `fi` |
| `return if ready then 1 else 2 fi;` | Accepted typed expression, selected branch only |
| `return ready ? 1 : 2;` | Accepted typed expression, selected branch only |
| `return if ready then 1 else "x" fi;` for `int` return | Compile failure: incompatible branch types |

Verify nested loops, statement termination, call arguments, true/false evaluation order, mismatched ownership, and both arms of static type checking in each of Java/GraalVM, LLVM, WASM, Forge, and .NET/AOT. Record each backend as PASSED, FAILED, UNSUPPORTED, or NOT EXECUTED with an exact commit SHA and an actual guest run where applicable.

## Migration

Legacy parsers accepted keyword-delimited imperative `if ... then ... fi` and mandatory `fi` after a braced `if`. Migration must be explicit: rewrite imperative keyword branches to `do if ... then ... fi`, and remove redundant `fi` from braced statements in canonical Atto source. Maintain old parser entry points only for deliberate compatibility until migration is complete; the canonical strict Atto grammar must fail closed.
