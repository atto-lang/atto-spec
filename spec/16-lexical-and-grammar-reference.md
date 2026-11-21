# 16 — Lexical Structure and Grammar Reference

**Status: DRAFT.** This chapter records the syntax that compilers accept today, and it marks where that differs from the target spelling in [chapter 01](01-source-and-syntax.md).

Sources are the Java lexer and `docs/grammar.ebnf` (Oreslang v0.6) in `oreslang-source.java`, plus the local test runs in [chapter 19](19-observed-status-2026-11-03.md). "Java" and "LLVM" below always mean the revisions named in that chapter. Other backends were not tested.

## Source text

- Source files are UTF-8. New source uses `.atto`, and legacy source uses `.ores`.
- Identifiers and keywords are case-sensitive.
- An identifier starts with a letter or `_` and continues with letters, digits or `_`. The Java lexer accepts any Unicode letter. Whether every backend must do the same is open (S-22).
- `//` starts a line comment. `/* ... */` is a block comment, and block comments nest.
- **TARGET (decided, 2026-11-14):** block comments nest at most 128 deep. Opening a 129th level is a compile error, reported as `block comment nesting exceeds 128`, before parsing. Java main and .NET main already enforce this limit with that wording. LLVM main has no limit yet; oreslang-source.llvm#1251 adds it, with fixtures at depth 128 (accepted) and 129 (rejected).

## Keywords

The Java lexer reserves these words in the proposed feature branch (oreslang-source.java#3086); the independent native parser supports the two new spellings in oreslang-source.llvm#1791. Exact-head guest CI has not verified these PRs yet.

| Group | Words |
| --- | --- |
| Declarations | `define` `def` `module` `namespace` `contract` `conforms` `class` `struct` `interface` `trait` `type` `types` `typeof` `abstract` `extends` `implements` `impl` `import` `from` `as` |
| Callables | `fnc` `routine` `async` `suspends` `generator` `yield` `nlex` `return` `self` `super` `static` |
| Visibility | `pub` `private` |
| Bindings | `const` `val` `let` `mut` |
| Control flow | `if` `ifnot` `unless` `then` `else` `elif` `elseif` `fi` `do` `done` `end` `while` `for` `of` `loop` `block` `break` `continue` `switch` `match` `matches` `over` `default` |
| Errors | `try` `catch` `finally` `throw` `raise` `panic` `recover` `trap` `defer` |
| Actors | `actor` `isoactor` `shared` `untrusted` `spawn` `stop` `rt` |
| Async and channels | `await` `nb` `cb` `select` `readch` `writech` |
| Operators | `eq` `neq` `is` `new` |
| Literals and markers | `true` `false` `null` `void` `obj` `arr` |
| Compute | `cpu` `gpu` `quantum` |

Some of these are narrower than the table suggests:

- `stop`, `do` and `done` may also name a callable, so `worker.stop()` is valid. `val stop = 1` is not.
- `critical-read`, `critical-write` and `transform-pipe` are recognized by the parser only in declaration context, so `a-b` stays subtraction. Only `nb-select` is handled by the lexer.
- These words are not reserved by the Java lexer: `enum`, `supervisor`, `state`, `pipe`, `final`, `on`, `when`, `case`, `first`, `infer`, `record` and `tuple`. Some have contextual meaning in the grammar, and others are target features that compilers reject with a diagnostic.

## Linguistic keyword roles and editor highlighting

Keywords may also be described linguistically as nouns (e.g. `actor`), relational verbs (e.g. `implements`), adjectives (e.g. `pub`), or execution qualifiers (e.g. `suspends`). These analogies are for readers and editor tooling, not additional syntax rules. The proposed taxonomy, semantic scopes, reserved-versus-contextual distinctions, and conformance gates appear in [chapter 23](23-keyword-taxonomy-and-highlighting.md).

**This chapter's documented lexer inventory remains authoritative for its cited revisions.** The taxonomy does not make TARGET spellings reserved or prove that any backend accepts them.

## Literals

| Kind | Form | Notes |
| --- | --- | --- |
| Integer | `42`, `1_000` | Decimal only: `0x2A` is rejected on both Java and LLVM. A value above 2^63−1 is also rejected at compile time on both |
| Float | `1.5`, `1e9`, `2.5E-3` | A digit is required on both sides of `.` |
| Imaginary | `4i` | Used to write complex values, as in `3 + 4i` |
| String | `"text"`, `'text'` | Escapes are `\n` `\r` `\t` `\"` `\'` `\\` and a Unicode form. An unknown escape in an ordinary string keeps the character |
| Template | `` `text` `` | Lexed by Java. Interpolation is not specified here (S-23) |
| Symbol | `#ready`, `#"with spaces"` | Quoted Symbols use strict escapes. An unquoted `#with spaces` and `:ready` are not Symbols |
| Boolean | `true`, `false` | |
| Null | none | A standalone `null` value is a compile-time error. Use `Option<T>` |

## Operators

From lowest to highest precedence, following the v0.6 grammar:

| Level | Operators | Associativity |
| --- | --- | --- |
| Assignment | `=` | Right |
| Pipeline | `\|>` | Left |
| Conditional | `? :` | Right |
| Logical OR | `\|\|` (and `\|` inside conditions) | Left |
| Logical XOR | `^^` | Left |
| Logical AND | `&&` (and `,` inside conditions) | Left |
| Equality and identity | `eq` `neq` `!eq` `==` `!=` `is` | Left |
| Comparison and type tests | `<` `<=` `>` `>=` `is type` `matches` `as` `as?` | Left |
| Additive | `+` `-` | Left |
| Multiplicative | `*` `/` `%` | Left |
| Unary | `!` `-` `+` `await` `&` `&mut` `readch` `writech` | Prefix |
| Postfix | call, `.member`, `[index]` | Left |

- `eq` and `neq` are the canonical comparisons. `==` and `!=` are accepted aliases.
- `is` tests identity. Type tests use `is type`, as in `if animal is type Dog dog then`.
- Inside an `if` or `while` condition, `,` means AND and `|` means OR, and comma binds tighter.
- **TARGET (decided, 2026-11-14):** `&&` is short-circuit boolean AND, `^^` is boolean XOR, and `||` is short-circuit boolean OR. `^^` is eager: it evaluates both operands exactly once, left to right. Precedence is `&&` above `^^` above `||`. Every operand must have static type `bool`, and there is no truthiness conversion. The built-in `And`, `Or` and `Xor` functions stay valid.
- Backend status on 2026-11-14: Java main and LLVM main accept `&&` and `||`. .NET main accepts only the `and`/`or`/`xor` words. All three mains still reject `^^` as reserved. The fixes are oreslang-source.java#3009, oreslang-source.llvm#1728 / #1739 and oreslang-source.net#521, which adds `&&`, `^^` and `||` to the structured frontend.
- Single `^` and the bitwise and shift operators are not in the grammar. Integer bit operations use named functions such as `Integer.bitXor(a, b)`.
- Open: whether the condition-only `,` and `|` spellings stay. oreslang-source.java#3009 proposes removing them in favor of `&&` and `||`.
- Assignment is an expression, but `if x = y then` is rejected.
- `name = value` in a call is never a named argument. Named value arguments use `name: value` ([chapter 03](03-functions-and-effects.md)).
- `++` and `--` exist only in a `for` update clause.

Ternary conditions must have static type `bool`. AttoLang has no truthiness conversion.

## Function forms

**TARGET (decided):** `: T` and `-> T` are both valid return spellings, and `::` may be included or omitted. No one form is the only correct one.

As a grammar rule (**TARGET (decided)**), this reads:

```ebnf
callable_body = return_spec [ "::" ] ( block | { statement } "end" ) ;
return_spec   = ":" type_ref | "->" type_ref ;
```

So these all declare the same function:

```atto
fnc add(int a, int b): int { return a + b; }
fnc add(int a, int b) -> int { return a + b; }
fnc add(int a, int b): int :: { return a + b; }
fnc add(int a, int b) -> int :: { return a + b; }

fnc add(int a, int b): int ::
  return a + b;
end

fnc add(int a, int b) -> int ::
  return a + b;
end

fnc add(int a, int b): int
  return a + b;
end

fnc add(int a, int b) -> int
  return a + b;
end
```

The same rule applies to methods. A file may mix forms, since one declaration's form does not affect another's.

Only the first two forms run on free functions today. See [chapter 19](19-observed-status-2026-11-03.md).

**PROPOSED** parsing rules, because leaving out `::` can make the end of the return type unclear:

1. The return type is read as far as it can go. Without `::`, the `|` in `-> int |x| ...` continues a union type, and the `[` in `-> Vector [const a] = f();` continues a sequence shape. In these cases the author writes `::` to end the type.
2. A `{` right after the return type or `::` always opens a brace body, which then needs no `end`. A body in the `end` form therefore cannot start with a `{` destructure. Write `const {a} = f();` instead.
3. Newlines do not separate the return type from the body, because AttoLang has no automatic semicolon insertion.

**PROPOSED** formatter rule: the formatter keeps the form the author wrote and does not rewrite one into another.

### Negated conditionals (TARGET)
`ifnot` and `unless` are interchangeable **negated boolean heads** in the
value form `ifnot/unless condition then value else value fi`, the imperative
`do ifnot/unless condition then statements [else statements] fi` form, and the
brace form `ifnot/unless condition { statements } [else { statements }]`.
Value arms require compatible static types; `else` is mandatory in a value
expression, optional in statements. Braces do not consume `fi`. The original
predicate is evaluated once, and only its **first** branch is inverted.
`elif` predicates are not inverted. See [chapter 27 in grammar PR #183](https://github.com/atto-lang/atto-spec/pull/183)
and [machine-readable contract](../contracts/ifnot-unless-v1.json).
A strict backend must reject `if true then break; fi` as a value expression,
and accept `do if true then break; fi` only inside a valid enclosing loop.
This is a target specification, not a claim of compiler execution.

## Statements and semicolons

Semicolons are the formatter's canonical output. They may be omitted only where the parser has a clear structural boundary, such as just before `}`, `fi` or `end`. There is no JavaScript-style automatic insertion. Imports and `namespace` declarations always need one.

## Accepted spellings today

Each row was compiled and, where possible, run. See [chapter 19](19-observed-status-2026-11-03.md) for the exact test programs.

| Construct | Spelling | Java | LLVM |
| --- | --- | --- | --- |
| Function, colon return | `fnc add(int a, int b): int { ... }` | Runs | Runs |
| Function, arrow return | `fnc add(int a, int b) -> int { ... }` | Runs | Runs |
| Function, `::` or `end` forms | See [function forms](#function-forms) | Rejected | Rejected. The parser does accept `::` on class methods |
| Entry point | `pub fnc main(): int` or `pub routine main(): int` | Runs | Runs |
| Typed local | `val x: int = 41;` | Runs | Runs |
| Untyped local | `val x = 41;` | Runs | Rejected |
| Mutable local | `let x: int = 41;` | Runs | Rejected |
| Class | `define class P as ... end` | Runs | Rejected in the test program, for an untyped local |
| Class with braces | `define class P { ... }` | Rejected | Rejected |
| Module | `define module m as ... end` | Runs | Rejected in the test program |
| Public module, chapter 01 target | `define pub module m as ... end` | Rejected | Rejected |
| Conditional | `if c then ... else ... fi` | Runs | Rejected |
| Loops | `while c do ... done`, `loop do ... done`, `for (...) do ... done` | Run | Rejected in the test programs |
| Match | `match o` with arms `Some(v) -> { ... }`, closed by `end` | Runs | Rejected |
| Do match | `do match o over` with `on` arms, closed by `end` | Runs | Literal patterns only |
| Switch | `switch x`, then `case 1 -> { ... }` and `default -> { ... }`, closed by `end` | Runs | Rejected in the test program |
| Enum, chapter 02 target | `define enum Color as ... end` | Rejected | Rejected |
| Actor state, chapter 05 target | `state { ... }` with `handle_state` | Rejected | Rejected |
| Supervisor, chapter 13 target | `define supervisor S as ... end` | Rejected | Rejected |
| Actor pipe, chapter 03 target | `spawn A() pipe spawn B()` | Rejected | Rejected |

A rejection here is correct behavior under the fail-closed rule when the feature has no lowering. It means the target syntax is not available yet, not that the compiler is wrong.

## A program that runs today

This program ran on both Java and LLVM and exited with status 42.

```atto
fnc add(int a, int b): int {
  return a + b;
}

pub fnc main(): int {
  val x: int = 40;
  return add(x, 2);
}
```

## Grammar source

`docs/grammar.ebnf` in `oreslang-source.java` is the fullest grammar available, at about 740 lines. It describes the Java parser, not all backends, and it uses the v0.6 Oreslang spellings. It does not yet include the `::` and `end` function forms. It should be updated and copied into this repository once the proposed parsing rules are confirmed.
