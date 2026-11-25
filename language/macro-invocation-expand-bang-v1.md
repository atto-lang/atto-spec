# Macro invocation spelling: `expand!` (AttoLang v1)

**Status:** proposed normative language-syntax change. Compiler admission remains
backend-specific until executed cross-backend conformance is available.

## Syntax

Use **`expand! macro_name(<typed macro arguments>)`** in an expression, a
statement, or a top-level/module declaration position where that result
category is admitted.

```atto
define pub macro const_int(Const<int> value) -> Syntax<Expr> {
  return quote(value);
}
pub fnc main() -> int {
  return expand! const_int(const 40 + 2);
}
```

```atto
import namespace macros from "std.macros";
const int capacity = expand! macros.const_capacity(const 64);
```

Namespace-first import spelling follows the proposed static-imports v2 contract (#227); the historical star-as spelling is a migration alias only. The second sample describes the language-level spelling, not an assertion
that every compiler's built-in stdlib import resolver supports that path yet.
A static qualified macro name can use the same existing namespace/module
qualification rules as other resolved compiler metadata; no runtime dispatch.

Declaration macro use:

```atto
expand! derive_eq(type User);
```

This requires a `Syntax<Decl>` or `SyntaxList<Decl>` result. Backends that
cannot generate declarations yet MUST reject it before codegen.

## Grammar and lexical boundary

```ebnf
macro_invocation ::= "expand" "!" qualified_macro_name "(" macro_arguments? ")"
qualified_macro_name ::= identifier (("." | "::") identifier)*
```

`expand` is **contextual** rather than globally reserved. `!` MUST be directly
adjacent to `expand` (same source line, no whitespace/comments), as in
`expand!`; the following macro name must be separated by whitespace.
There is no extra `!` on the macro name. The invocation has ordinary
expression or declaration site delimiters, including `;` where applicable.

`expand! m.literal(const 42)` is valid at an expression site when `m`
resolves to a statically bound, visible compile-time macro export.
`m.literal!(const 42)` is **legacy**, not canonical. During migration
existing compilers MAY temporarily admit legacy name-suffix syntax, but
formatters and newly authored docs MUST prefer `expand! m.literal(...)`.
A later removal of the legacy spelling requires explicit migration plan.

## Separation from other exclamation forms

- `take!`, `share!`, `borrow!`: checked ownership operators;
- `expand!`: compile-time macro expansion only;
- `@Annotation`: annotation/attribute syntax;
- `#ready`: symbol literal;
- `fnc_call(...)`: normal function call (never an implicit macro call).

These spellings may not alias one another, including under macros.

## AOT and security

The macro invocation binds to an already admitted `define macro`
declaration. Typed argument categories (`const`, `type`, `ident`,
`syntax expr`, etc.) are unchanged. The compiler must:

1. Resolve lexical/module visibility and verify public import authority.
2. Expand deterministically within bounded compiler resource limits.
3. Eliminate all macro declarations and invocations before executable IR.
4. Type-check and enforce effects, ownership, borrow lifetimes, capability
   boundaries, actor isolation and closed AOT generic specialization on output.
5. Reject unsupported declaration results, unresolved names, wrong argument
   kinds, unclosed runtime values, overflow, recursion cycles, or budgets
   before code generation; never fall back to runtime source evaluation.
6. Ensure the AOT artifact contains neither a runtime macro engine nor an
   implicitly callable source parser.

No change to the `define [pub] macro` declaration syntax is intended.

## Minimum conformance vectors

| Case | Source | Expected |
|---|---|---|
| closed constant | `expand! literal(const 40 + 2)` | literal 42 pre-IR |
| identity | `expand! identity(syntax expr 42)` | AST identity |
| nested macro | `expand! identity(syntax expr expand! literal(const 42))` | literal 42 |
| namespace import | `expand! m.literal(const 42)` | accepted only with verified public binding |
| runtime input | `expand! literal(const runtime_input)` | compile-time rejection |
| wrong type | `expand! identity(const 42)` | compile-time rejection |
| overflow | `expand! literal(const 9223372036854775807 + 1)` | compile-time rejection |
| unresolved name | `expand! missing(const 42)` | compile-time rejection |
| unsupported decl | `expand! generate(type User);` | compile-time rejection if no decl AST lowering |
| ownership distinct | `take! value` | ownership semantics, never macro lookup |

Compiler-owned `core`, `alloc`, and `std` sources may remain independent
within each `atto-source.*` repository; matching public behavior where a
feature is supported does not imply identical compiler-side library sources.

## Rollout evidence

The Java/Graal and LLVM stdlib macro draft branches adopted this spelling
with source-level tests; real compiler-backed execution and native AOT
receipts are still required before claiming parity or shipping the feature.
Existing v1 `name!(...)` source fixtures remain unchanged as legacy
compatibility inputs while the new canonical vectors are admitted.

## Host reference checks
`node tests/macro-expand-prefix-reference.mjs` checks contextual invocation prefixes and disambiguation from neighboring punctuation and other bang operators. It does not scan comments/string bodies, parse macro arguments, expand ASTs or certify any compiler.


Bang-suffixed keyword operators require at least one ASCII whitespace character immediately after the complete suffix (`!` or `!!`). No whitespace or comment is allowed between the keyword and its suffix. A comment alone does not satisfy the following whitespace requirement. Formatters emit one separating space. This does not change `!=`, `!eq`, or ordinary logical NOT. Reject a missing separator rather than interpreting Rust-style keyword invocations.
