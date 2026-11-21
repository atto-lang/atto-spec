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

`catch()` catches an ordinary, eligible `Error` without binding its value.
It is supported with either block style, e.g. `catch() { handle_error(); }`.
`catch (Error e)` is the explicit typed form. A single untyped catch binder
(`catch(e)`) exists in the Java source backend as a compatibility spelling;
cross-backend acceptance and type inference are not assumed by this contract.
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
The proposed `maybe` construct operates on the *value* of a conditional
pattern match (`Pattern ?= expression`) and selects an `else` value
handler when that match fails. An `Err(...)` or `None` value by itself
is not an exception, and a failed `?=` does not enter `catch`.

Conversely, an ordinary `throw Error` originating inside a `maybe`
skips its value `else` and may be handled by a surrounding `try/catch`.
`raise` bypasses `catch`, and panic cannot be intercepted locally.
The surrounding `finally` retains its existing once-only structured-exit
semantics, including normal `return` from a `maybe` handler.

**Status / integration hold (2026-11-21):** `maybe` is not yet a
cross-backend compiled feature. Proposed contracts in
[maybe/else/defer v1](maybe-else-defer-v1.md) (draft PR #22) and
atto-platform-conformance draft PR #485 disagree about:
(1) whether `else` is mandatory;
(2) whether reached **body-local** `defer` runs before or after an
`else` value handler; and
(3) contextual vs reserved `maybe` and `do maybe` admission.
Those discrepancies must be reconciled before claiming a shared runtime
contract. This `try` syntax PR neither silently enables `maybe`
nor makes either `maybe` proposal normative.

Required integration tests, *once a compiler admits `maybe`*:
- `try ... do maybe ... else ... end ... catch ... finally ... end`;
- failed `?=` handled by `else`, with outer `catch` not executed;
- ordinary `throw` inside `maybe` handled by outer `catch`,
  not its value `else`;
- `return maybe ... end` inside `try` runs outer `finally` once;
- `raise` bypasses outer `catch` without bypassing eligible `finally`;
- nested `end` tokens close the inner `maybe` before the outer `try`;
- invalid syntax/effects/borrows do not yield a guest artifact.
