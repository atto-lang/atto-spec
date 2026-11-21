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

**Java:** The production Truffle parse boundary dispatches `.atto` to the strict parser and preserves deliberate legacy `.ores` admission; the prechecked-AST lease cannot bypass the strict lexical gate. The exact 288-file production Java Git tree and original conditional test were mirrored without credentials, built under Temurin JDK 25, and **22 Truffle guest/typechecker JUnit checks passed with zero skips**, [evidence](https://github.com/honeypot-r-us-test/hnpt-lambdas/actions/runs/43675484432). The test uses the Truffle fallback runtime, **not GraalVM Native Image or a native-thread-carrier proof**.

**.NET:** The compiler's typed loop CFG and generated CIL passed 14 focused reference/CLR checks on exact Core/Runtime source subtrees. Two committed `.atto` fixtures were then lowered through the actual compiler and statically linked into **Linux x64 Native AOT** executables: `unless` loop/break exited 4; nested `ifnot`/`unless` continue/break exited 2, [source-controlled dual-job evidence](https://github.com/honeypot-r-us-test/hnpt-lambdas/actions/runs/43675974767). Windows/macOS and actor-runtime Native AOT remain unverified.

**LLVM:** A restricted synchronous scalar-loop CFG supports nested `break`/`continue` with negated guards. The current source compiler blobs were verified against PR head `b6f7a6a57bd71755611b89ef38f340cb85f2167e`, built with LLVM 22, and used to execute **12 native binaries plus five compiler-negative and three target-negative tests**, [exact-head evidence](https://github.com/honeypot-r-us-test/hnpt-lambdas/actions/runs/43675719165). A separate exact-source **AddressSanitizer/UndefinedBehaviorSanitizer** build and four positive scalar guest cases passed, [sanitizer evidence](https://github.com/honeypot-r-us-test/hnpt-lambdas/actions/runs/43675805303); leak detection was disabled. Calls, owned/scoped resources, suspension and unverified cleanup still fail closed. The hard-real-time, Cortex-M and Wasm32 target modes explicitly reject general `loop` until WCET, termination, and cooperative scheduling are proven; broader certification remains tracked in [LLVM issue #1828](https://github.com/ores-truffle-oreslang/oreslang-source.llvm/issues/1828).

**Wasm and Forge:** Source backend conformance is **not verified** and is tracked in [Wasm #491](https://github.com/ores-truffle-oreslang/oreslang-source.wasm/issues/491) and [Forge #283](https://github.com/ores-truffle-oreslang/oreslang-source.forge/issues/283). A target rejecting unsupported control flow is correct fail-closed behavior, not an implementation or guest-execution parity pass. All implementation PRs remain drafts; neither five-backend parity nor full hard-real-time guarantees may be inferred.

## Migration

Legacy parsers accepted keyword-delimited imperative `if ... then ... fi` and mandatory `fi` after a braced `if`. Migration must be explicit: rewrite imperative keyword branches to `do if ... then ... fi`, and remove redundant `fi` from braced statements in canonical Atto source. Maintain old parser entry points only for deliberate compatibility until migration is complete; the canonical strict Atto grammar must fail closed.
