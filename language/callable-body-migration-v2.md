# Callable body mode migration: optional `::` to explicit selector (draft v2)

Status: **proposal / blocking compatibility decision**, not an active released language version. This document supersedes the **body-mode choice only** in PR #21; it does not revoke its receiver, modifier, actor isolation, or type-checker requirements.

## What changed

In the existing v1 accepted contract, `-> T ... end` and `-> T :: ... end` both accept comma-separated sequences whose final expression is returned. The proposed v2 contract gives `::` a distinct purpose:

| Form | Proposed v2 meaning |
| --- | --- |
| `fnc f() -> int { return 5; }` | Brace statement body; explicit return |
| `fnc f() -> int const x: int = 3; ^ x + 2; end` | `end` statement body; explicit return |
| `fnc f() -> int :: const x: int = 3, x + 2 end` | Comma body; implicit terminal-expression return |

Never insert or delete `::` as a whitespace-only formatting edit. Commas nested in calls, tuple literals, generics, `match`, `begin`, and `(> ... )` are not outer body separators.

## Explicit source migration

Old unmarked comma body:

```atto
fnc f() -> int
    let x = 3,
    x + 2
end
```

Preserving its original tail-return semantics:

```atto
fnc f() -> int ::
    let x = 3,
    x + 2
end
```

Or as an ordinary statement body:

```atto
fnc f() -> int
    let x = 3;
    ^ x + 2;
end
```

The two replacements are not automatically interchangeable if any intermediate item is effectful, includes early exits, defers, ownership moves, suspension or lexical captures. Migrate only after checked parser/type/effect/ownership equivalence.

## Merge and rollout gate

No existing, verified `edition`, `languageVersion`, or manifest option has been established for this change. Do **not** invent a CLI flag or assume every compiler recognizes one.

Before making v2 syntax the default:
1. Agree on a canonical version/feature selector in the package manifest, compiler and formatter, with a stable syntax and migration algorithm.
2. Prove that v1 unmarked comma bodies preserve their accepted meaning under v1 and v2 unmarked comma bodies reject the old syntax instead of silently changing semantics. Both modes must retain the same type/effect and cleanup guarantees.
3. Implement a diagnostic that identifies this exact migration, with a source span and both safe candidate rewrites. A rewrite must be opt-in and preserve comments, strings and nested delimiters.
4. Run positive/negative conformance through the real compiler and guest Wasm execution for every supported body family (`fnc`, `routine`, class instance/static methods, nominal `mtd`); report `unsupported` versus `not_executed` honestly.
5. Coordinate version selection and formatting between compiler PR #185, spec PR #35, existing spec PR #21, and atto-format. Do not merge the strict parser as an unversioned breaking change.

## Return shorthand orthogonality

The `^` token is an alias for statement-position `return`, not `::`, an infix operator, or a parenthesized-expression delimiter. In a v2 comma body, `^ const z: int = 5, z + 5` is invalid: `const` is a binding, not a return operand. For normal return of a sequence, use `^ seq let z = 5, z + 5;` in a statement body, or simply `:: const z: int = 5, z + 5 end`.

This file records target semantics, not installed backend parity or a passed source-level migration.
