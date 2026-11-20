# Exceptional-control keyword spellings v1

**Status:** proposed normative spelling for AttoLang source; user-selected target, **not** a claim of executable parity. This contract changes source spelling only. It does **not** change the meaning or type/effect checking of the four operations.

## Canonical lexical forms

| Canonical source | Role | Unchanged semantic authority |
| --- | --- | --- |
| `trap! expr` | caller-side Result-producing effect boundary | [trap-to-Result v1](trap-result-v1.md) |
| `throw! expr;` | ordinary typed Error throw | ordinary catch or existing escalation contract |
| `raise! expr;` | bypass ordinary catch; recover/escalate | actor/error effect rules |
| `panic! expr;` | terminal actor failure | supervisor-only CONTROL notice; actor cannot intercept its own panic |

The `!` must be **immediately contiguous** with the exact keyword (`trap!`, `throw!`, `raise!`, `panic!`). The combined spelling is a single exceptional-control token, not an identifier followed by logical NOT and not a postfix mutation. Case-sensitive spelling and its meaning are unaffected by line endings, comments, Unicode escapes or formatting. A comment or string literal mentioning these bytes is **not** executable exceptional control.

For example, `trap! parse_id("42")` and `trap!parse_id("42")` have the same tokenization; `trap !x` is **not** the canonical bang spelling. A migration-compatible bare `trap` applied to a separately parsed `!x` expression might still have its ordinary expression semantics if that expression is well typed; a formatter must never conflate the two.

### Delimiters and no accidental keyword capture

- `throwing!`, `trapped!`, and other identifiers are **not** exceptional keyword tokens.
- `!=` and `!eq` remain their own comparison spellings; do not consume their exclamation mark as an exceptional suffix.
- `borrow!`, `take!`, `copy!`, `share!` and other ownership/binding operators retain distinct typing, scope and lifetime rules.
- `throws`, `raises`, `panics` and related callable effect annotations are declaration effects, **not** `throw!` statements.
- `?` preserves its own early-return and cleanup rules; `trap!` never swallows or converts `Err`/`None` to another family.

A frontend should tokenize the four exceptional bang forms without changing identifier, comment, string, equality or ownership tokenization. It must not reinterpret a rejected exceptional effect as a host exception, JS `try/catch`, OS process exit, or supervisor notification.

## Semantics and safety invariants

1. `trap! expression` evaluates the operand once. On normal scalar/Option completion it produces the single outer Result specified in [trap-to-Result v1](trap-result-v1.md). On an **already Result-typed** operand it preserves the existing Ok/Err representation and any nested Option/Result layers rather than wrapping twice. Only an ordinary **source** `throw! Error` may be caught as `Err(original Error)` with original subtype, payload and identity.
2. `raise!`, `panic!`, cancellation, host failures, memory exhaustion and fatal VM traps bypass the ordinary throw handler inside `trap!`. Non-Error payloads fail static checks and cannot be silently coerced to an Error.
3. `throw!` obeys ordinary catch/effect bounds, `raise!` bypasses catch to the nearest applicable recover/escalation boundary, and actor `panic!` terminates the actor and emits an authenticated **supervisor-priority CONTROL** notice. Application DATA messages and neighboring tenants cannot forge or intercept that notice.
4. `?` propagation and `defer`/`finally` cleanup remain exactly as specified in [trap-to-Result v1](trap-result-v1.md). The keyword suffix cannot alter evaluation order, host capability admission, actor isolation or tenant generations.
5. A backend that does not implement a typed exceptional operation must **fail closed before codegen** with a supported diagnostic and no generated guest artifact. Accepting the spelling lexically or running a host-only model is not guest semantic conformance.

## Migration and compatibility

Existing source using bare `trap`, `throw`, `raise` or `panic` remains migration-compatible during the versioned rollout, but **new canonical Atto source uses the bang spellings**. Their old semantics do not change. A future deprecation/removal of the bare forms requires a distinct versioned decision, migration tool, formatter test and compiler conformance gate. Historical, SHA-pinned source fixtures must be preserved as-is; newer bang-form fixtures require their **own** independent source hashes.

A formatter may canonicalize a recognized exceptional keyword only after parsing confirms its syntactic role. Blind text replacement in comments, strings, identifiers, equality operations, or user-defined names is forbidden. Require parse equivalence, idempotence and both positive and negative round-trip tests in `atto-format` and the relevant legacy formatter when applicable.

## Cross-backend evidence requirements

Use all eleven `atto-lang/atto-source.*` repositories: `.rs`, `.java`, `.llvm`, `.net`, `.forge`, `.js`, `.cranelift`, `.wasm`, `.atto`, `.hdl` and `.realtime`. The Wasm host is not an independent full source frontend; the self-hosted/HDL/real-time scaffolds must declare supported subsets honestly. A source lexer-only test proves no runtime semantics.

For each claimed backend and fixture, require the **same original .atto bytes and Git blob SHA**, exact compiler commit and Git tree, emitted guest digest, toolchain, actually executed positive guest observation or precise compile-negative diagnostic and no artifact, authorized runner job with nonzero executed steps, and independent review. Record `PASS`, `FAIL`, `UNSUPPORTED` or `NOT_EXECUTED` separately. An ordinary panic must never be accidentally caught as a Result or delivered as a forged DATA event.

The active transition is tracked by eleven backend draft PRs (e.g. [Rust #449](https://github.com/atto-lang/atto-source.rs/pull/449), [JS #73](https://github.com/atto-lang/atto-source.js/pull/73), [LLVM #293](https://github.com/atto-lang/atto-source.llvm/pull/293)), and the Error/Result implementation work by [parity issue #20](https://github.com/atto-lang/atto-compilers-parity-testing/issues/20). No backend is certified by this document.
