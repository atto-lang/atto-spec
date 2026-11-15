# Callable body styles v1 (AttoLang)

Status: proposed canonical syntax contract. A syntax preview is not compiler-admission evidence.

## Declaration heads

For each top-level `fnc` and direct-call-only `routine`, all five forms are equivalent in result type and (except for body delimiter semantics) control flow:

```atto
fnc f1() : int { return 5; }
fnc f2() : int -> { return 5; }
fnc f3() -> int { return 5; }

fnc f4() -> int
  let int x = 3, x + 2
end

fnc f5() -> int ::
  let int x = 3,
  x + 2
end
```

- `: T` and `-> T` introduce the result type. The trailing `->` after `: T` is an optional *brace-body* introducer; it does not introduce a second type.
- `::` is an optional delimiter **after the result type** and **before an `end` body**. It is not an operator, method namespace separator, or part of a type.
- `{ ... }` uses C-style statements; `end` bodies permit comma-separated expression/statement sequencing.
- Within an `end` body, the **last top-level expression** is the implicit result of a non-`void` callable; an explicit `return` is also valid and has normal early-exit semantics.
- Comma separates completed *body statements*. It does not replace commas inside function arguments, generic type arguments, tuple literals, or conditional Boolean conjunctions. Those constructs retain their own parsing context.
- Empty `end` bodies, trailing commas, missing `end`, and non-`void` bodies without a guaranteed result must be diagnosed. Non-`void` implicit-result expressions must match the declared return type. No implicit result is manufactured for `void`.
- Body delimiters and nested scopes must be balanced. An `end` closes exactly the current callable; nested `if ... fi`, `do ... done`, `match ... end` and class definitions are parsed by their own production.
- No clause-style Erlang function matching is implied here; these are alternative body delimiters and sequencing rules, not automatic pattern clauses.

## Methods

Inline class methods have the same five body styles as functions. The accepted method head spellings `method name(...)`, `fnc name(...)` and bare `name(...)` retain the same method semantics.

Out-of-line methods use an explicit nominal receiver and the same five return/body styles:

```atto
mtd (self: Calculator) read_seed() -> int
  self.seed
end

mtd (self: Calculator) read_seed_2() -> int ::
  let int value = self.seed, value
end
```

`mtd (mut self: Calculator)` provides a mutable receiver where permitted. Linking out-of-line `mtd` declarations, duplicate-name resolution, receiver qualification and accessibility, sealed actor-state access, and dispatch must be checked before enabling executable examples. `mtd` does not bypass actor isolation: external actor references communicate through the mailbox.

## Routine semantics

`routine` is direct-call-only and not a first-class callable value. Its recursion/tail-call restrictions must be separately enforced by checkers; this syntax change does not claim or confer those optimizations or guarantees.

## Backend admission and conformance

- Parse/format positive fixtures for all five `fnc`, `routine`, inline method, and receiver-`mtd` forms; include nested blocks and comma-bearing call arguments.
- Execute equivalent arithmetic fixtures and compare exit code/output on Rust native, Rust-produced Wasm, Java/GraalVM, LLVM, and other available backends at exact SHAs.
- Negative fixtures: missing `end`; stray `::` before brace body; extra or trailing separator; incorrect return type; missing result; out-of-line receiver mismatch, duplicate/ambiguous method, and illegal direct actor-state access.
- A browser sample must remain **syntax preview only** until the pinned compiler artifact and its exact built/tested SHA demonstrably execute the complete sample. `atto-source.wasm` repository documentation alone is not executable-compiler evidence.
