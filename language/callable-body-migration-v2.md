# Callable body mode migration: optional `::` to explicit selector (draft v2)

Status: **draft compiler implementation, opt-in only**. The version selector is implemented on the stacked Rust browser compiler branch; this does **not** establish a released language edition or parity in other backends. This document supersedes the **body-mode choice only** in PR #21; it does not revoke receiver, modifier, actor isolation, or type-checker requirements.

## What changed

In the existing v1 accepted contract, `-> T ... end` and `-> T :: ... end` both accept comma-separated sequences whose final expression is returned. The proposed v2 contract gives `::` a distinct purpose:

| Form | Proposed v2 meaning |
| --- | --- |
| `fnc f() -> int { return 5; }` | Brace statement body; explicit return |
| `fnc f() -> int const x: int = 3; ^ x + 2; end` | `end` statement body; explicit return |
| `fnc f() -> int :: const x: int = 3, x + 2 end` | Comma body; implicit terminal-expression return |

Never insert or delete `::` as a whitespace-only formatting edit. Commas nested in calls, tuple literals, generics, `match`, `begin`, and `(> ... )` are not outer body separators.

## Explicit language-version selection

The browser/native Rust compiler supports two explicitly bounded modes:

| Entry point | Effective grammar | Behavior |
| --- | --- | --- |
| Rust `compile(source)`, native `attoc file.atto`, browser ABI `compile(length)` | v1 (legacy) | Unmarked comma/tail bodies retain their old implicit-return meaning; explicit `::` also works |
| Rust `compile_with_version(source, LanguageVersion::Explicit)` | v2 | Unmarked `-> T ... end` uses statements with explicit returns; `::` selects comma/implicit-tail body |
| `attoc --language-version 2 file.atto` | v2 | Explicit opt-in on a single native compile |
| Browser ABI `compile_v2(length)` | v2 | New optional export; original ABI `compile` and `abi_version() == 2` remain backward compatible |
| `atto-format-caret --language-version=2 --check/--write` | v2 | Compiles source before/after formatting with the exact same version; refuses writes on mismatch |
| `atto-format-callable --language-version=2 --check/--write` | v2 | Receiver-header formatting has the same explicit version requirement, both compiler checks and fail-closed writes |

Both v1 and v2 accept semicolon-delimited statement blocks and explicitly marked `::` comma bodies.
Without `::`, v1 infers legacy comma/tail bodies from top-level separators;
commas nested within function calls and `(> ...)` do not select an outer comma body.

Both the production parser and target-only `mtd` preflight must receive the
same selected version. A comma inside `return x, y, z;`, `^ x, y, z;`,
a prefix `seq` expression, a nested conditional, or a parenthesized call
is **not** an outer callable-body separator and must not trigger edition
migration. Existing v1 class and actor bodies remain on the v1 parsing
path when compiling with default `compile`.

Compiler diagnostic `E_BODY_VERSION` identifies an unmarked top-level comma
in v2 and suggests both explicit migrations: `-> T :: ..., tail end` or
`-> T ...; return tail; end`. No automatic rewrite is authorized.

**Package manifest selection remains pending.** This stage intentionally does
not invent a `language_version` TOML key or a universal edition default before
the real Atto package-resolution contract is specified. The opt-in compiler
and formatter selectors are working draft APIs, not a claim that all Atto tools
or backends understand v2.

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

The Rust/browser v1/v2 selector, safe v1 default, compiler migration diagnostic,
and version-aware opt-in formatter are implemented on draft branches and must
pass exact-tree native/Wasm and formatter CI before integration.

Before making v2 syntax the default:
1. Specify a canonical package-manifest key and edition resolution, including project dependency boundaries and error behavior for contradictory settings.
2. Test the migration diagnostic in nested `match`/`if`/actor/class bodies; ensure no silent change in ownership, purity, or cleanup effects.
3. Finish positive/negative execution for all supported body families (`fnc`, `routine`, instance/static methods, nominal `mtd`) and document unsupported-only targets.
4. Coordinate version selection across compiler PRs #185/#268/#307, spec #35/#81, formatter #5, and non-Rust backends. Never merge the strict parser as a new implicit default.
5. Require actual evidence of native/wasm deterministic bytes and version-aware formatter equivalence before enabling automated source rewriting.

## Return shorthand orthogonality

The `^` token is an alias for statement-position `return`, not `::`, an infix operator, or a parenthesized-expression delimiter. In a v2 comma body, `^ const z: int = 5, z + 5` is invalid: `const` is a binding, not a return operand. For normal return of a sequence, use `^ seq let z = 5, z + 5;` in a statement body, or simply `:: const z: int = 5, z + 5 end`.

This file records target semantics, not installed backend parity or a passed source-level migration.
