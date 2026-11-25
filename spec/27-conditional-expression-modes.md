# 27 — Statement if, expression if and conditional value blocks

**Status: TARGET / draft. No backend is certified by this document.** This contract refines the existing statement-only conditional-expression v1 contract and the draft value-block/range PR #32. It deliberately specifies the requested arm-local `return` syntax, which is **not** equivalent to a function return.

## Three distinct forms

```atto
// 1. Imperative, not value-producing. A closing fi is not necessary.
if ready {
  process()
} else {
  recover()
}

// 2. Value-producing. This form requires else and closes with fi.
const int v = if true then
  5
else
  4
fi;

// 3. Value-producing ternary with optional lexical arm blocks.
const int w = true ? 5 : 4;
const int x = true ? { return 5 } : { return 4 };
const int y = true ? { const int n = 4; n + 1 } : { 4 };
```

The strict canonical keyword-delimited **statement** form is `do if condition then ... else ... fi`. The historical form without `do` is admitted only in an explicitly selected legacy migration profile and never supplies an implicit result. The base single-expression conditional grammar and `ifnot`/`unless` proposal (#183) remain independent of this staged block-valued extension. A braced statement `if` must **not consume** a trailing `fi`. A stray `fi` after a standalone braced `if` is a syntax error. An immediately following `fi` may instead close a surrounding keyword-delimited conditional, and the parser must preserve that enclosing delimiter. Braced statement arms contain normal statements; any `return` exits the enclosing callable.

The value `if` is an *expression-position* construct. Block-valued arms and arm-local final return are a separately gated v2 target, not automatic admission in the base single-expression profile. It has a required `else`, optional `elif` arms (at most 128), strict bool predicates and a common static result type. A value `if` must never be rewritten as a statement `if` during formatting. Desugaring into an equivalent right-associated ternary is permitted only after respecting `if`/`fi` nesting and branch scope. Assignment inside the condition is forbidden.

## Conditional arm blocks

A block immediately after `?`, `:`, `then`, `elif ... then` or `else` in a value conditional is a **lexical arm block**. It is not a lambda, closure, async task, record literal or independently permitted standalone value-block syntax.

The last *unterminated* expression supplies the arm value. Additionally, a final `return expression` (with or without a semicolon) supplies **that arm's value**, not the result of the enclosing function. This contextual exception matches the explicit user-facing ternary example and the Java draft #2797. Normal `return` elsewhere keeps its function-return meaning. A final expression followed by a semicolon discards its value; a missing arm value is a compiler error.

Prior statements execute in order in a new lexical scope. Arm locals cannot leak. Both arms must type-check to the same compatible **non-void** result type and ownership/effect restrictions still apply. A `void` or `Unit`-only conditional belongs in statement position (`if ... { ... } else { ... }`) instead; a value-required conditional cannot silently discard the branch result. Unsupported branch-result profiles must fail at type checking, before code emission. Exactly one predicate evaluation and only the selected arm's effects execute. Right-associative ternary nesting and contextual postfix `?` propagation must remain distinct.

This decision **supersedes** draft PR #32's generic block paragraph that forbids arm-local `return`. General-purpose standalone value blocks are a separately versioned feature and must not inherit this arm-only rule accidentally.

## Verification gate

The canonical source vectors and errors are in `contracts/conditional-expression-v2.json`. Compiler implementation is not proof: require real exact-head native/wasm/AOT guest execution, negative type/error tests, formatter round-trip preservation, branch laziness, ownership/effect proof and backend-specific receipts. CI that never ran steps is NOT_EXECUTED. Older v1 statements/ternaries must retain behavior.
