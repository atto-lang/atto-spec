# 16 — Lexical Structure and Grammar Reference

**Status: DRAFT.** This chapter records the syntax that compilers accept today, and it marks where that differs from the target spelling in [chapter 01](01-source-and-syntax.md).

Sources are the Java lexer and `docs/grammar.ebnf` (Oreslang v0.6) in `oreslang-source.java`, plus the local test runs in [chapter 19](19-observed-status-2026-11-03.md). "Java" and "LLVM" below always mean the revisions named in that chapter. Other backends were not tested.

## Source text

- Source files are UTF-8. New source uses `.atto`, and legacy source uses `.ores`.
- Identifiers and keywords are case-sensitive.
- An identifier starts with a letter or `_` and continues with letters, digits or `_`. The Java lexer accepts any Unicode letter. Whether every backend must do the same is open (S-22).
- `//` starts a line comment. `/* ... */` is a block comment, and block comments nest.

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
| Logical OR | `\|` | Left |
| Equality and identity | `eq` `neq` `!eq` `==` `!=` `is` | Left |
| Comparison and type tests | `<` `<=` `>` `>=` `is type` `matches` `as` `as?` | Left |
| Additive | `+` `-` | Left |
| Multiplicative | `*` `/` `%` | Left |
| Unary | `!` `-` `+` `await` `&` `&mut` `readch` `writech` | Prefix |
| Postfix | call, `.member`, `[index]` | Left |

- `eq` and `neq` are the canonical comparisons. `==` and `!=` are accepted aliases.
- `is` tests identity. Type tests use `is type`, as in `if animal is type Dog dog then`.
- Inside an `if` or `while` condition, `,` means AND and `|` means OR, and comma binds tighter.
- The grammar has no `&&`, `||` or bitwise and shift operators.
- Assignment is an expression, but `if x = y then` is rejected.
- `name = value` in a call is never a named argument. Named value arguments use `name: value` ([chapter 03](03-functions-and-effects.md)).
- `++` and `--` exist only in a `for` update clause.

Ternary conditions must have static type `bool`. AttoLang has no truthiness conversion.

## Function forms

**TARGET (decided, 2026-11-14):** AttoLang distinguishes an ordinary *statement body*
from an Erlang-inspired *comma expression body*. Return-type spelling alone
does not determine the behavior; the contiguous **`-> Type ::`** header is
the meaningful expression-body marker.

| Form | Body semantics |
| --- | --- |
| `fnc f(int x): int { return x; }` | Braced statement body; explicit `return` |
| `fnc f(int x) -> int { return x; }` | Same braced statement-body semantics |
| `fnc f(int x) -> int :: x end` | Comma expression body; the last expression is returned implicitly |
| `fnc f(int x) -> int :: int y = 5, y + x end` | Lexical bindings followed by a final value expression |
| `fnc f(int x) -> int\n return x;\nend` | Legacy unmarked end-delimited statement body; preserve compatibility |

Equivalent cases apply to `fnc`, `routine`, bare class methods,
explicit class `mtd` receiver methods, actor instance methods, and static
class functions wherever those declarations are otherwise legal. An explicit
`mtd` does not add an extra overload argument for `self`.

```atto
pub fnc foo(int foo): int {
    return 5;
}

pub fnc foo_expression(int foo) -> int ::
    int x = 5, x + foo
end

pub routine triple(int n) -> int ::
    int factor = 3,
    n * factor
end

define class Calculator as
    pub mtd with_receiver(mut self, int n) -> int ::
        int offset = 2,
        offset + n
    end

    pub static fnc one() -> int ::
        1
    end
end
```

### Comma-body evaluation and return rules

1. Each top-level `,` **sequences** two body items; it does not create a
   tuple, a list or a pair. Evaluate items strictly left to right and exactly
   once. `int x = 5` is an immutable local binding under the usual lexical
   scope, not actor state.
2. If the declared return type is non-`void`, the final body item may be
   an expression, which becomes the function's result without writing
   `return`. The normal type, effect, ownership and definite-return checks
   still apply. A trailing declaration cannot satisfy a non-`void` return.
3. An empty body is permitted only where existing return rules admit it,
   normally `void`. An empty item (`,,`) and a trailing comma before
   `end` are invalid.
4. The new comma operator is **not** a general-purpose operator in ordinary
   expression or brace-body syntax. Nested `f(a, b)`, tuple/record literals,
   generic `Map<K, V>` arguments, destructuring, lambda parameters, and
   `match` arms retain their existing comma grammar. Only commas at the
   sequence body's top level delimit body items.
5. A `void` body can use comma sequencing for effects without inventing a
   returned value; an explicitly written `return;` remains supported. For
   compatibility with existing source, explicit return/semicolon statements
   inside `-> Type :: ... end` continue to be admitted, but the canonical
   expression-bodied style omits `return` on its final value.
6. Parsing and formatting must preserve this body kind and evaluation order;
   never normalize a comma expression body to a braced statement body without
   translating the final expression to an explicit return. The two forms are
   intentionally **not textually interchangeable**.

These rules do not change the meaning of a comma in an `if` or `while`
condition (the existing condition-conjunction grammar), or commas in a
caller's parameter and argument lists.

## Lambda forms and explicit same-line results

Lambda syntax follows the function-body distinction, with an additional typed
same-line `=>` delimiter. The executable lambda arrow remains `->`; the
`=>` after its result type marks the start of a *typed inline expression*
rather than a second return type. It does not change function-type syntax
`(int, int) => int`.

```ebnf
lambda_head        = ("|" [ lambda_parameters ] "|" | "fnc(" [ parameters ] ")") "->";
lambda_body        = expression
                   | local_binding "," inline_sequence
                   | type_ref "=>" (expression | local_binding "," inline_sequence)
                   | [ type_ref ] "{" { statement } "}"
                   | type_ref "::" comma_sequence "end";
inline_sequence    = { local_binding "," } expression;
comma_sequence     = { sequence_item "," } sequence_item;
sequence_item      = local_binding | expression | compatible_statement;
```

Inferred one-line lambdas preserve the existing `|x| -> expression` form.
A typed one-line lambda uses `|x| -> Type => expression`; the earlier
incomplete `|x| -> Type expression` remains invalid. For example:

```atto
val plus = |x: int| -> int => x + 1;
val eight = || -> val int x = 5, x + 3;
val typed_eight = || -> int => val int x = 5, x + 3;
val explicit = || -> int ::
    int x = 5,
    x + 3
end;
```

Only a leading local declaration makes an unmarked inline comma sequence
unambiguous. An otherwise bare `|x| -> a, b` is not a general-purpose
comma expression because the comma can belong to an enclosing argument list.
General expression sequences use `:: ... end` with an explicit result
type. Argument delimiters, generic commas, tuple fields, pattern commas and
`if` conjunction commas are unrelated syntax.

For a lambda used as a `|>` stage, the unparenthesized inline lambda ends
before the next pipeline stage. To place a nested `|>` *inside* that
lambda expression, group the inner expression. Multiple lambda parameters
receive fields of **one statically known tuple** of matching arity; the
pipeline does not invent additional arguments or spread arrays.

An explicit `void` lambda may perform an effect as its last expression,
provided it returns `void`. A non-`void` lambda's terminal expression
must match the declared result type. Existing braced lambdas require an
explicit `return` for non-`void` results. Nested lexical scopes,
borrows, throws and suspensions preserve the same static gates as the
corresponding statement bodies.

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
