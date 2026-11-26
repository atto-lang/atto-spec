# 27 — Imperative conditionals and value-producing branches

**Status: TARGET; executable backend verification pending.** This revision records the user-approved conditional syntax and supersedes conflicting earlier conditional-mode proposals.

## Canonical forms

```atto
if ready do
    process();
else
    recover();
fi

val int v = if ready then 200 else 500 fi;
val int w = ready ? 200 : 500;
```

`if/ifnot/unless condition do ... [elif condition do ...] [else ...] fi` is imperative: no implicit value, ordinary function return and loop transfers. Existing braced statement if remains self-delimiting and does not consume a following fi. Historical prefix `do if ... then` and statement-position `if ... then` are migration spellings, not canonical output. Do not reinterpret expression-position then as imperative. Preserve legacy parser behavior where necessary for migration.

## Value if

A value if requires else, fi, strict bool predicates and compatible non-void static result types. Optional elif arms use then. The final expression of each selected arm produces its value. A comma-separated expression sequence evaluates left to right, discarding intermediate values. A semicolon-separated statement/expression sequence evaluates left to right in lexical scope; the last expression yields its value even with a trailing semicolon.

```atto
val int x = if ready then 200, 300 else 500, 400 fi;
val int y = if ready then
    200;
    300;
else
    500;
    400;
fi;
```

Both yield 300 when ready and 400 otherwise. The final expression must be reachable and value-producing. Declaration-only, empty, void, incompatible and missing-value arms are rejected. Comma in the condition retains its existing condition-only meaning; nested call/collection separators are not arm separators. No global comma operator is introduced.

## Ternary

Single-expression ternary is equivalent to single-expression value if, with right associativity. A multi-statement ternary arm requires braces and explicit arm-local return or caret; an implicit tail alone is not canonical. Explicit result terminators are optional before the closing brace.

```atto
val int a = ready ? { 200; return 300; } : { 500; return 400; };
val int b = ready ? { 200; ^ 300; } : { 500; ^ 400; };
```

These returns exit the expression arm, not the enclosing function. Every reachable normal completion path supplies a value; return outside an expression arm retains ordinary meaning. The existing historical implicit ternary tail, where implemented, may be admitted in an explicitly selected migration profile, never silently substituted for explicit canonical return. No general standalone value-block, lambda or closure admission follows from this grammar.

## Shared semantics and lowering

Evaluate the predicate once and only the selected branch. Check both branch types, scopes and ownership statically. Transfer the selected result before reverse-order cleanup of remaining branch locals; do not duplicate an owned result or allow loans to escape. Lower to branch CFG and typed join/PHI or destination-passing storage, with no mandatory heap allocation, runtime code generation or tracing GC. AOT and actor/suspension cleanup need separate proof.

Formatter canonicalizes legacy imperative delimiters to if ... do ... fi, preserves value then, and retains explicit ternary arm return/caret. Do not change value/statement category or reorder expressions.

## Verification

The canonical source vectors and negative cases are in contracts/conditional-expression-v2.json. Require exact-head compiled guest execution, AOT where supported, negative checks, branch laziness and ownership cleanup, formatter round trips and backend receipts. A queued or zero-step CI run is NOT_EXECUTED. No backend is certified by this document.
