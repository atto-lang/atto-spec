# 27 — Value conditionals and imperative `do if`

**Status:** TARGET grammar decision, 2026-11-14. A backend is conformant only after actual parser, type-checker, runtime/IR, and negative-fixture evidence at an exact commit. The Java reference compiler currently stages this in the opt-in `parseStrictAtto` entry point; legacy entry points retain historical acceptance for source migration. Do not claim five-backend parity from a spec or parser-only test.

## Negated conditional heads: `ifnot` and `unless`

`ifnot` and `unless` are separate reserved keywords with identical semantics: they evaluate the boolean condition exactly once and select the first arm **only when it is false**. This is equivalent to `if !(condition)`, without re-evaluation or implicit coercion. Both are valid in value expressions, imperative `do` statements and brace-style imperative statements. An `else` arm, when present, is chosen when the original condition is true.

```atto
loop {
    do ifnot ready then break; fi
}
loop {
    do unless ready then break; fi
}
val int n = unless ready then 5 else 6 fi;
ifnot ready { retry(); }
```

For either keyword, `true` **does not** execute the first arm; `false` **does**. When the first arm contains `break` or `continue`, the ordinary imperative control-flow context rules still apply; neither is a value expression. The negation is on the condition only, not on individual `elif` predicates.

## Forms and meaning

| Form | Category | Result | Required closing syntax |
| --- | --- | --- | --- |
| `if/ifnot/unless condition then left else right fi` | Expression | Value of the selected branch | `else` and `fi` |
| `condition ? left : right` | Expression | Value of the selected branch | Both arms |
| `do if/ifnot/unless condition then ... [else ...] fi` | Statement | No value | `fi` |
| `if/ifnot/unless condition { ... } [else { ... }]` | Statement | No value | Matching braces only |

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
if_head   = "if" | "ifnot" | "unless" ;
if_expr   = if_head bool_expr "then" expr "else" expr "fi" ;
if_stmt   = "do" if_head bool_expr "then" { stmt } [ "else" { stmt } ] "fi"
          | if_head bool_expr "{" { stmt } "}" [ "else" "{" { stmt } "}" ] ;
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
| `do ifnot true then break; fi` in a loop | Accepted; **does not break** |
| `do unless true then break; fi` in a loop | Accepted; **does not break** |
| `do ifnot false then break; fi` in a loop | Accepted; exits loop |
| `do unless false then break; fi` in a loop | Accepted; exits loop |
| `do unless false then break; fi` outside a loop | Compile failure: invalid loop exit |
| `return unless false then 7 else 9 fi;` | Accepted; returns 7 |
| `do if true then break; fi` outside a loop | Compile failure: invalid loop exit |
| `if ready { act(); } else { retry(); }` | Accepted statement, no `fi` |
| `return if ready then 1 else 2 fi;` | Accepted typed expression, selected branch only |
| `return ready ? 1 : 2;` | Accepted typed expression, selected branch only |
| `return if ready then 1 else "x" fi;` for `int` return | Compile failure: incompatible branch types |

Verify nested loops, statement termination, call arguments, true/false evaluation order, mismatched ownership, and both arms of static type checking in each of Java/GraalVM, LLVM, WASM, Forge, and .NET/AOT. Record each backend as PASSED, FAILED, UNSUPPORTED, or NOT EXECUTED with an exact commit SHA and an actual guest run where applicable.

## Implementation snapshot (backend-specific proof, not blanket parity)

The Java compiler now dispatches `.atto` Truffle source units through strict Atto parsing while retaining deliberate legacy `.ores` admission. JDK 25 Parser/AST lexical conformance passed 15 real checks on an exact-tree private carrier; full Truffle/GraalVM production guest verification **remains unverified**.

The .NET scalar compiler has verified typed SSA `loop`/`break`/`continue` CFG and generated CIL on exact compiler+runtime subtrees: 14 CFG/CIL checks passed. A compiler-emitted conditional CIL assembly was also linked statically into a Linux x64 Native AOT executable and executed with the correct result, [evidence](https://github.com/honeypot-r-us-test/hnpt-lambdas/actions/runs/43672575105). Windows/macOS/actor Native AOT are not proven.

The LLVM compiler has verified a restricted synchronous scalar-loop CFG that supports nested `break`/`continue` and negated imperative guards. An exact-source compiler compiled to LLVM IR, Clang emitted native AOT, and 12 positive binaries plus four rejection cases passed, [evidence](https://github.com/honeypot-r-us-test/hnpt-lambdas/actions/runs/43672622634). Loops with calls, owned resources, scoped declarations, suspension or unverified cleanup fail closed. Hard-real-time, freestanding and Wasm target modes reject general `loop` until proven WCET/termination and cooperative scheduling; broader certification remains tracked in [LLVM issue #1828](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/issues/1828).

Wasm and Forge source-backend conformance is **not yet verified**. The normative language syntax is wider than these currently certified implementation islands; do not infer complete five-backend parity from one backend's fixture.

## Migration

Legacy parsers accepted keyword-delimited imperative `if ... then ... fi` and mandatory `fi` after a braced `if`. Migration must be explicit: rewrite imperative keyword branches to `do if ... then ... fi`, and remove redundant `fi` from braced statements in canonical Atto source. Maintain old parser entry points only for deliberate compatibility until migration is complete; the canonical strict Atto grammar must fail closed.
