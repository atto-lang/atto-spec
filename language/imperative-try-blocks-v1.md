# Imperative try/catch/finally body styles — v1

Status: syntax contract, shared AST; per-backend execution is separately gated.

## Two equivalent source spellings

AttoLang accepts both a braced imperative try statement and a keyword/end
imperative try statement. The style is chosen by the token **immediately after**
`try`; a braced try has no trailing `end`, while an unbraced try requires exactly
one `end`.

```atto
// Preferred when the surrounding source already uses end-delimited blocks.
try
  do_work();
catch (Error e)
  log_error();
finally
  close_resource();
end

// Existing C/Java-style spelling remains source-compatible.
try {
  do_work();
} catch (Error e) {
  log_error();
} finally {
  close_resource();
}
```

Both syntaxes produce precisely the same `TryStmt(body, catch, finally)` AST.
This is a grammar-only alternative. It **does not** redefine failure handling,
cleanup order, catches, ownership, or runtime effects. The existing
[defer/recover/unwind contract](defer-recover-unwind-v1.md) is authoritative.

The valid keyword forms are:

```atto
try
  operation();
catch()
  handle_error();
end

try
  operation();
finally
  cleanup();
end

try
  operation();
catch (Error e)
  handle_error();
finally
  cleanup();
end
```

`catch()` catches an ordinary eligible thrown payload without binding its value, under the admitted failure profile. The base Error profile catches Error; the later trait-conforming non-Error extension requires its independently specified typed admission and cannot be silently coerced to Error.
It is supported with either block style, e.g. `catch() { handle_error(); }`.
`catch (Error e)` is the explicit typed form. The owner-selected canonical
example also admits `catch (e)` as an inferred ordinary guest error binder.
The binder is scoped to the handler; the base Error profile infers Error,
and any wider trait-payload profile must preserve the actual admitted
nominal payload type. Neither form admits raise, panic, cancellation or host
failures. Cross-backend execution of inferred binders must be proven separately.
See [the canonical bang example](exception-control-bang-spellings-v1.md#canonical-guest-example).
Subclass-specific matching is a separate typed-handler implementation: a
backend must not silently treat an unimplemented subtype as a catch-all.

## Block boundary and nesting rules

- At least one of `catch` or `finally` is required.
- `catch` occurs at most once, always before `finally`; `finally` occurs
  at most once. `try/finally` without a catch is legal.
- An unbraced try's top-level body ends at `catch`, `finally`, or `end`.
  Its catch body ends at `finally` or `end`; its finally body ends at `end`.
- Each nested `try` consumes **its own** `end`. Nested `if/fi`,
  `loop/done`, `match/end`, and ordinary braced blocks retain their
  existing delimiters. `end` never closes an inner braced try.
- No mixed forms are accepted within a single try statement: choosing `try {`
  requires braces for its handlers; choosing keyword `try` requires the
  keyword-delimited bodies and `end`.
- End-of-file, a closing `}`, or an unbalanced nested delimiter may not
  implicitly close a keyword try. A missing `end` is a syntax error.
- Statements can use standard explicit semicolons or the backend's existing
  safely delimited newline/keyword statement terminators. An `end` token
  inside a string or comment is never a delimiter.

## Invariant semantics

An eligible ordinary `throw` visits the nearest matching catch. `raise`
bypasses catch; panic/host-fatal effects do not become ordinary exceptions.
`finally` is evaluated exactly once on all applicable exits, including
return, normal fallthrough, an ordinary throw, and a raised failure, under
the existing backend-specific cancellation/unwind guarantees. A return value
is computed before finally. Source scopes, borrow checking, deferred cleanup,
and caller-chain catch/recover priority are unchanged by syntax style.

The formatter must **retain the author's choice of braces or end**. For
keyword form, indent each body one level deeper than `try`, `catch (...)`,
and `finally`, and align `end` with the opening `try`. Formatting twice
must yield the same bytes and must preserve parsed semantics.

## Conformance gates

Positive: empty sections; catch-only; finally-only; catch/finally; `catch()`;
nested keyword/keyword and keyword/braced; nested if/fi and match/end;
braced backward compatibility; literal/comment containing `catch`,
`finally`, or `end`; normal return and value snapshot; throw/catch/finally;
raise/finally without catch; ownership/borrow scope safety; async suspension.

Negative: missing `end`; `try/end` with no handler; duplicate/reordered
handlers; mixing brace and keyword bodies; missing parentheses; malformed
catch binding; stray `end`; incorrect nested delimiter.

Each `atto-source.*` backend must report separately whether it parses,
type-checks, executes, and passes the required negative tests; the syntax
contract does not imply blanket multi-backend parity.

## Relationship to `maybe/?=/else/end`

`maybe` is **not** a synonym or alternate spelling for `try`.
The merged target `maybe` construct operates on the *value* of a conditional
pattern match (`Pattern ?= expression`) and selects an `else` value
handler when that match fails. An `Err(...)` or `None` value by itself
is not an exception, and a failed `?=` does not enter `catch`.

Conversely, an ordinary `throw!` of an eligible Error originating inside a `maybe`
skips its value `else` and may be handled by a surrounding `try/catch`.
`raise` bypasses `catch`, and panic cannot be intercepted locally.
The surrounding `finally` retains its existing once-only structured-exit
semantics, including normal `return` from a `maybe` handler.

**Cross-feature integration candidate (2026-11-21):** the
[maybe/else/defer proposal](https://github.com/atto-lang/atto-spec/pull/22)
and [conformance draft #485](https://github.com/atto-lang/atto-platform-conformance/pull/485)
now agree on the v1 target: `do maybe` / `return maybe` are contextual,
`else` is mandatory and exhaustive, and reached body-local defers
unwind **before** the chosen value-failure handler. Handler-local defers
then unwind, followed by enclosing function cleanup and eligible outer
`finally`. The parser must keep the two nested keyword `end` scopes
independent, and `?=` must not dispatch to the exception `catch`.

This is a **design reconciliation**, not compiler/runtime admission.
Java's restricted maybe implementation is still open at
[atto-source.java #1541](https://github.com/atto-lang/atto-source.java/pull/1541);
Rust/Wasm's unsupported maybe forms still fail closed. Neither compiler
may claim cross-feature execution until exact-source integration runs
prove it.

Required integration tests, *once a compiler admits `maybe`*:
- `try ... do maybe ... else ... end ... catch ... finally ... end`;
- failed `?=` handled by `else`, with outer `catch` not executed;
- ordinary `throw` inside `maybe` handled by outer `catch`,
  not its value `else`;
- `return maybe ... end` inside `try` runs outer `finally` once;
- `raise` bypasses outer `catch` without bypassing eligible `finally`;
- nested `end` tokens close the inner `maybe` before the outer `try`;
- invalid syntax/effects/borrows do not yield a guest artifact.
