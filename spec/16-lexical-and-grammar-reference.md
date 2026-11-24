# 16 — Lexical Structure and Grammar Reference

**Status: DRAFT.** This chapter records the syntax that compilers accept today, and it marks where that differs from the target spelling in [chapter 01](01-source-and-syntax.md).

Sources are the Java lexer and `docs/grammar.ebnf` (Oreslang v0.6) in `oreslang-source.java`, plus the local test runs in [chapter 19](19-observed-status-2026-11-03.md). "Java" and "LLVM" below always mean the revisions named in that chapter. Other backends were not tested.

## Source text

- Source files are UTF-8. New source uses `.atto`, and legacy source uses `.ores`.
- Identifiers and keywords are case-sensitive.
- An identifier starts with a letter or `_` and continues with letters, digits or `_`. The Java lexer accepts any Unicode letter. Whether every backend must do the same is open (S-22).
- `//` starts a line comment. `/* ... */` is a block comment, and block comments nest.
- **TARGET (decided, 2026-11-14):** block comments nest at most 128 deep. Opening a 129th level is a compile error, reported as `block comment nesting exceeds 128`, before parsing. Java, .NET and LLVM main all enforce this limit with that wording (LLVM via oreslang-source.llvm#1251, merged 2026-11-15, with fixtures at depth 128 accepted and 129 rejected).

## Keywords

The Java lexer reserves these words. The LLVM parser has its own keyword handling, and the two lists have not been compared.

| Group | Words |
| --- | --- |
| Declarations | `define` `def` `module` `namespace` `contract` `conforms` `class` `struct` `interface` `trait` `type` `types` `typeof` `abstract` `extends` `implements` `impl` `import` `from` `as` |
| Callables | `fnc` `routine` `async` `suspends` `generator` `yield` `nlex` `return` `self` `super` `static` |
| Visibility | `pub` `private` |
| Bindings | `const` `val` `let` `mut` |
| Control flow | `if` `then` `else` `elif` `elseif` `fi` `do` `done` `end` `while` `for` `of` `loop` `block` `break` `continue` `switch` `match` `matches` `over` `default` |
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
| Logical OR | `\\|\\|` (legacy `\\|` inside conditions) | Left |
| Logical AND | `&&` (legacy `,` inside conditions) | Left |
| Integer bitwise OR | `\\|` | Left |
| Integer bitwise XOR | `^^` | Left |
| Integer bitwise AND | `&` | Left |
| Equality and identity | `eq` `neq` `!eq` `==` `!=` `is` | Left |
| Comparison and type tests | `<` `<=` `>` `>=` `is type` `matches` `as` `as?` | Left |
| Shifts | `<<<` `>>>` `ashr` | Left |
| Additive | `+` `-` | Left |
| Multiplicative | `*` `/` `%` | Left |
| Unary | `!` `-` `+` `~` `await` (legacy borrow/I/O forms by profile) | Prefix |
| Postfix | call, `.member`, `[index]` | Left |

- `eq` and `neq` are the canonical comparisons. `==` and `!=` are accepted aliases.
- `is` tests identity. Type tests use `is type`, as in `if animal is type Dog dog then`.
- Inside an `if` or `while` condition, `,` means AND and `|` means OR, and comma binds tighter.
- **Canonical owner decision (2026-11-20):** `&&` and `||` short-circuit on `bool`; `^^` is eager integer bitwise XOR on two `int` operands, never Boolean XOR. Boolean XOR uses `Xor(bool,bool)`. Single `^` is statement-leading return, not infix XOR. The result, evaluation order and precedence agree with atto-spec #151 and the versioned operator contract.
- Backend status on 2026-11-14: Java main and LLVM main accept `&&` and `||`. .NET main accepts only the `and`/`or`/`xor` words. All three mains still reject `^^` as reserved. The fixes are oreslang-source.java#3009, oreslang-source.llvm#1728 / #1739 and oreslang-source.net#521, which adds `&&`, `^^` and `||` to the structured frontend.
- `^ expr;` is a return statement. Infix single `^` is invalid; integer XOR is `^^`, and shifts are `<<<`, `>>>`, `ashr`, with checked distances `0..63`. `<<`/`>>` are typed I/O, not shifts. `Integer.bitXor(a,b)` is a named alternative.
- Open: whether the condition-only `,` and `|` spellings stay. oreslang-source.java#3009 proposes removing them in favor of `&&` and `||`.
- Assignment is an expression, but `if x = y then` is rejected.
- `name = value` in a call is never a named argument. Named value arguments use `name: value` ([chapter 03](03-functions-and-effects.md)).
- `++` and `--` exist only in a `for` update clause.

Ternary conditions must have static type `bool`. AttoLang has no truthiness conversion.

## Canonical match-arm introducer (2026-11-20 decision)

**TARGET:** After `over`, every `match` arm MUST start with the **contextual** word `on`. This applies equally to `match value over`, `do match value over`, typed match variants, ADT payload bindings, guards, and wildcard fallback. `on` is contextual (not a blanket globally reserved identifier). The normal arm arrow is `->`, not `=>`.

```atto
do match outcome over
  on Ok(ack) -> { mark_admitted(ack); }
  on Err(err) -> { handle_send_error(err); }
end
```

Use value `match` when the arm supplies a value. Use `do match` for effects. A `return` or `^` inside `do match` completes the arm with void. See [control flow](01-source-and-syntax.md) for return targets and exhaustiveness.

A compiler MUST reject bare `Ok(ack) ->` or `Err(err) ->` **in an `over` match**, and `else`, `default` or `on default` are not catch-all aliases in this canonical form; use `on _`. Preserve a separately documented legacy `match value` without `over` only if that mode is explicitly selected. A formatter MUST preserve `on` and variant names, must not rewrite a `match` into a `switch` or turn `on _` into `default`, and must not silently make bare invalid arms valid when formatting a canonical source.

The historical **Accepted spellings today** table below describes earlier source revisions and must not be treated as the currently normative syntax. LLVM's *browser-subset* parser already requires `on` for `match ... over`, but its native compiler still lacks general guest `Result<Ack, SendError>` lowering. Independent backends must report their own parse/typecheck/guest execution evidence.

## Return-first named callables and explicit `begin`/`end` (target)

The mandatory return-type rule accepts conventional `fnc name(args) -> T` / `fnc name(args): T` and both equivalent return-first separators `fnc T <- name(args)`, `T <- name(args)`, `fnc T • name(args)` and `T • name(args)` (exact Unicode U+2022 BULLET). `T` may be `void`, `infer`, or a concrete return type. Contiguous `<-` and U+2022 `•` are declaration separators, not assignment; split `< -`, U+00B7 middle dot and U+2219 bullet operator are invalid. Return-first spelling is also valid for class/actor methods in declaration context; existing visibility, ownership and actor isolation rules do not change.

All three body families are supported for return-first declarations: `{ ... }`, `begin ... end`, and `statement; ... end` with no `begin`. The latter two require explicit return for a nonvoid result and admit empty bodies for void. Existing name-first `: T -> { ... }` remains valid. The legacy `-> T` comma/end tail-expression form remains distinct from semicolon/end. These variants define the *same* callable signature, and duplicate declarations remain errors.

See [normative return-first contract](https://github.com/atto-lang/atto-spec/blob/main/language/return-first-and-begin-callables-v1.md). Backend support and tests require independent evidence.

## Function forms

**TARGET (decided):** `: T` and `-> T` are both valid return spellings, and `::` may be included or omitted. No one form is the only correct one.

As a grammar rule (**TARGET (decided)**), this reads:

```ebnf
callable_body = return_spec [ "::" ] ( block | { statement } "end" ) ;
return_spec   = (":" | "->") (type_ref | "infer") ;
```

A named callable **must** include this return specification, even for `void`. `infer` is explicitly allowed but not preferred; omitting the annotation is an error and never means `void` by default. This applies to functions, routines, instance/static methods, actor handlers and out-of-line methods. Constructors and contextual lambda inference follow their separate grammar contracts.

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
