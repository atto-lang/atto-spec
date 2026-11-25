# 16 — Lexical Structure and Grammar Reference

**Status: DRAFT.** This chapter records the syntax that compilers accept today, and it marks where that differs from the target spelling in [chapter 01](01-source-and-syntax.md).

Sources are the Java lexer and `docs/grammar.ebnf` (Oreslang v0.6) in `oreslang-source.java`, plus the local test runs in [chapter 19](19-observed-status-2026-11-03.md). "Java" and "LLVM" below always mean the revisions named in that chapter. Other backends were not tested.

## Source text

- Source files are UTF-8. New source uses `.atto`, and legacy source uses `.ores`.
- Identifiers and keywords are case-sensitive.
- An identifier starts with a letter or `_` and continues with letters, digits or `_`. The Java lexer accepts any Unicode letter. Whether every backend must do the same is open (S-22).
- `//` starts a line comment. `/* ... */` is a block comment, and block comments nest.
- **TARGET (decided, 2026-11-14):** block comments nest at most 128 deep. Opening a 129th level is a compile error, reported as `block comment nesting exceeds 128`, before parsing. Java, .NET and LLVM main all enforce this limit with that wording (LLVM via oreslang-source.llvm#1251, merged 2026-11-15, with fixtures at depth 128 accepted and 129 rejected).

## Canonical exceptional bang keywords (target)

`trap!`, `throw!`, `raise!`, `panic!` are contiguous exceptional tokens; bare forms remain migration aliases. Keep `!=`, `!eq`, ownership bangs, comments and quoted text distinct. See [exception-control bang spellings v1](../language/exception-control-bang-spellings-v1.md). This is not evidence of historical lexer support.

## Keywords

The historical table lists 93 documented Java reserved words. The two additional target words `ifnot` and `unless` are staged for syntax tooling and candidate compiler branches, not a claim about the historical Java or LLVM revisions. See chapter 23 for separate dated source snapshots.

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

## Contextual ownership prefix operators

| Operation | Canonical spelling | Legacy compatibility spelling |
| --- | --- | --- |
| Transfer unique owner | `take! value` | `rt take value` |
| Shallow/value copy | `copy! value` | `rt copy value` |
| Shared read loan | `borrow! value` | `rt borrow value` |
| Exclusive mutable loan | `borrow! mut value` | `rt borrow mut value`, `rt mut borrow value` |
| Share/freeze admission | `share! value` | `rt share value` |

These are parser-contextual **operator forms**, not new reserved words. The parser recognizes adjacent word and `!` only in a valid prefix-expression or parameter-ownership context. No whitespace or comment between verb and `!`; never consume `!=` or `!eq` as a suffix. The operand can immediately follow the bang; formatters emit the bang forms with one separating space. `copy!!` is one deep-copy operator, not shallow copy followed by logical NOT. Legacy aliases have identical typed ownership checks, diagnostics and lowering. Do not add `ref!`, `deref!` or `unref!`; `rt ref`, `rt deref` and `rt unref` remain separate checked-handle operations pending a separate decision.

## Linguistic keyword roles and editor highlighting

Keywords may also be described linguistically as nouns (e.g. `actor`), relational verbs (e.g. `implements`), adjectives (e.g. `pub`), or execution qualifiers (e.g. `suspends`). These analogies are for readers and editor tooling, not additional syntax rules. The proposed taxonomy, semantic scopes, reserved-versus-contextual distinctions, and conformance gates appear in [chapter 23](23-keyword-taxonomy-and-highlighting.md).

**The historical 93-word inventory remains authoritative for its cited revisions; the two explicitly staged target additions are not historical observations.** The taxonomy does not make TARGET spellings reserved or prove that any backend accepts them.

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

Historical v0.6 operator table (not current target precedence; see the operator contract below):

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
- **SUPERSEDED TARGET (2026-11-14):** the former Boolean `^^` proposal is historical. The 2026-11-20 owner decision reserves `^^` for integer XOR; Boolean XOR uses `Xor(bool,bool)`. Boolean `&&` and `||` retain strict bool operands and left-to-right short circuit. See [operator contract](../language/bitwise-and-stream-operators-v1.md).
- Backend status on 2026-11-14: Java main and LLVM main accept `&&` and `||`. .NET main accepts only the `and`/`or`/`xor` words. All three mains still reject `^^` as reserved. The fixes are oreslang-source.java#3009, oreslang-source.llvm#1728 / #1739 and oreslang-source.net#521, which adds `&&`, `^^` and `||` to the structured frontend.
- The current target uses statement-leading `^` for return, not infix XOR or exponentiation. Integer `^^`, `&`, `|`, `~`, and checked `<<<`, `>>>`, `ashr` follow the separate operator contract; `<<` and `>>` are typed I/O.
- Open: whether the condition-only `,` and `|` spellings stay. oreslang-source.java#3009 proposes removing them in favor of `&&` and `||`.
- Assignment is an expression, but `if x = y then` is rejected.
- `name = value` in a call is never a named argument. Named value arguments use `name: value` ([chapter 03](03-functions-and-effects.md)).
- `++` and `--` exist only in a `for` update clause.

### Current target bitwise precedence and token boundaries

From lowest to highest within the operator expression region: Boolean `||`, Boolean `&&`, integer `|`, Integer bitwise XOR `^^`, integer `&`, equality, comparison, shifts `<<< >>> ashr`, additive, multiplicative, unary (including integer `~`), postfix. See the [normative operator grammar](../language/bitwise-and-stream-operators-v1.md). Boolean XOR is the explicit `Xor` call. `^` is statement-leading return only. Compound forms `&= |= ^^= <<<= >>>= ashr=` require writable integer places. Counts must be in `0..63`, never masked. Three adjacent brackets are shifts in expression context; two are typed I/O. Preserve nested generic closers, `|>` pipelines, and `|x| -> expr` lambdas. Legacy condition-only `|` is profile-specific; parenthesize integer OR where that legacy grammar remains active.

Ternary conditions must have static type `bool`. AttoLang has no truthiness conversion.

## Canonical match-arm introducer (target)

Every arm after `over` starts with contextual `on`; `on Ok(ack)`, `on Err(err)` and `on _` are examples. `on default`, `default`, `else` and bare patterns are invalid match arms; `case` and `default` are switch forms. Use `->`, not `=>`. In `do match`, void arm returns complete the arm; a nonvoid return is rejected. In value match, arm values join the common static result type. The formatter must preserve `on` and `on _`, and must not silently repair invalid bare arms or convert match to switch. Historical accepted spellings in this chapter are evidence only, not normative canonical grammar. Formatter and guest admission require independent proof.

## Return-first named callables and explicit `begin`/`end` (target)

The mandatory return-type rule accepts both conventional `fnc name(args) -> T` / `fnc name(args): T` and return-first `fnc T <- name(args)`, `T <- name(args)`, `fnc T • name(args)`, or `T • name(args)` with exact U+2022 BULLET. `T` may be `void`, `infer`, or a concrete return type. Both contiguous `<-` and exact U+2022 BULLET are declaration delimiters, not assignment or binary operators; lookalikes are rejected. Return-first spelling is also valid for class/actor methods in declaration context; existing visibility, ownership and actor isolation rules do not change.

All three body families are supported for return-first declarations: `{ ... }`, `begin ... end`, and `statement; ... end` with no `begin`. Effect-free headers may start on a new line or the historical same-line statement form; `::` requires a physical newline. A trailing effect clause requires `begin`, `::`, or braces. No implicit tail return for these bodies. The latter two require explicit return for a nonvoid result and admit empty bodies for void. Existing name-first `: T -> { ... }` remains valid. The legacy `-> T` comma/end tail-expression form remains distinct from semicolon/end. These variants define the *same* callable signature, and duplicate declarations remain errors.

See [normative return-first contract](https://github.com/atto-lang/atto-spec/blob/main/language/return-first-and-begin-callables-v1.md). Backend support and tests require independent evidence.

The [logical punctuation fixture registry](../contracts/logical-punctuation-v1/contract.json) follows the current target, not the historical v0.6 table. `Xor` is an eager call, not an infix precedence tier; `&&` binds more tightly than `||`.

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

### Negated conditionals (TARGET)

See [negated conditionals](ifnot-unless.md) and the [machine-readable contract](../contracts/ifnot-unless-v1.json). The value form requires `else` and `fi`; the `do` imperative form permits optional `else` and closes with `fi`; the brace form permits optional `else` and closes with matching braces only. The boolean head is evaluated once and inverted; `elif` predicates are positive. Invalid non-boolean predicates and unsafe negated binding heads are rejected. This is not evidence of compiler execution.

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
