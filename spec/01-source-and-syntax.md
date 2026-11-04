# 01 — Source Files, Lexical Syntax and Declarations

**Status: DRAFT; TARGET semantics unless specifically marked.**

## Source grammar baseline

AttoLang uses UTF-8 source files with extension `.atto` (and legacy `.ores`). Identifiers and keywords are case-sensitive. Function/method names are `snake_case`. Comments may use `//`; exact comment and string escape grammar is subject to a synchronized lexer/formatter test suite. Semicolons can often be omitted; the parser must not insert them in a way that changes a program's meaning. Braces and `as ... end` are context-specific forms, not interchangeable everywhere.

**Statement termination is not yet specified (S-42).** The examples in this specification omit semicolons on every line, but the rule above cannot be tested as written. A conforming grammar MUST state exactly which line breaks end a statement, including lines that begin with `|>`, `.`, `-`, `+`, `(` or `[`. Until it does, a compiler MUST reject a line break whose meaning it cannot classify instead of guessing.

Only listed compound keywords accept an ASCII U+002D hyphen: `critical-read`, `critical-write`, `nb-select` and the reserved `transform-pipe` (reserved, with semantics still PROPOSED; no chapter defines it yet). Ordinary `a-b` is subtraction, never a hyphenated identifier. Unicode dash characters are not equivalent to `-`.

A reserved word MAY appear as a member name **immediately after `.`** in a qualified access, where it cannot begin an expression (for example `Actor.pipe(...)`). It is never accepted as a free identifier, binding or declaration name (S-43).

## Top-level declarations

```atto
define pub module math as
  pub fnc add(int left, int right) -> int ::
    return left + right
  end
end

define class Point as
  int x: 0
  int y: 0

  translate(int dx, int dy) -> Point ::
    return Point(self.x + dx, self.y + dy)
  end
end

define actor Worker as
  receive(Message message) -> void ::
    rt cooperate
  end
end
```

The samples use target canonical spelling. Legacy/active compilers may currently require colon return annotations, braces, alternative declaration order, or other older forms. A formatter must preserve meaning and must not "upgrade" unlowered syntax into executable claims.

- Free-standing functions use `fnc`; an instance method ordinarily omits `fnc` and has implicit `self`. Legacy instance `fnc` may be accepted and formatted to the bare method.
- Public declarations use `pub` in positions admitted by the grammar; canonical module spelling is `define pub module`. Module members are private unless exported.
- Classes are nominal. Class nesting inside classes is not permitted; constructors use an explicit `constructor(...)` declaration rather than a Java-style class-name constructor. Whether a class with no declared constructor gets an implicit field-order constructor (as `Point(...)` above and `Increment(1)` in chapter 05 assume) is PROPOSED (S-47); until settled, a compiler MUST reject a construction call that matches no declared constructor rather than synthesize one silently.
- Actor declarations use `define actor Name as ... end`. Actors are specialized classes, not synonyms for threads, services or regular classes.
- `define supervisor Name as ... end` declares a distinct runtime-owned nominal supervisor (TARGET), not a class or actor. Supervisor **instances** may supervise instances of other supervisors; declarations are not lexically nested. See [supervisor hierarchy](13-supervisor-hierarchies.md).
- `define macro` is an intended compile-time feature; expansion timing, hygiene, capabilities and backend admission remain PROPOSED rather than assumed.

## Bindings and fields

`val` declares an immutable binding, `let` a mutable binding, and `const` requires a compile-time constant. A `final` class field is single-assignment; a compile-time constant final initializer can be canonicalized from `final const` to `final` when proven constant. Instance field declarations default to immutable value slots unless explicit mutation is declared; the exact implicit-`val` grammar is a migration target.

```atto
val answer = 42
let counter = 0
const max_retries = 3

define class Session as
  int id: 7             // implicit immutable field (target)
  let int attempts: 0   // explicitly mutable field
  final int epoch: 1    // assigned exactly once
end
```

A local binding and class field are distinct syntactic contexts. No implicit assignment is allowed in a condition: `if x = y then` must be rejected; use `eq` or `==` where admitted for comparison (whether both spellings survive, and whether they differ, is S-56).

**Parameters put the type before the name** (`int left`, `Failure f`); `f: Failure` is not a parameter spelling. A `:` after a name inside a call's argument list is a value label ([chapter 03](03-functions-and-effects.md)). Typed locals are written both ways in this specification (`let Task<int> work = ...` in chapter 06, `val box: Box<...>` in chapter 02); which order is canonical for locals is S-46.

**Redeclaration:** declaring a second `val`, `let` or `const` with the same name in the **same** scope is a compile error. Shadowing in an inner scope is PROPOSED (S-48); until settled, compilers MUST reject it rather than pick a rule.

## Control flow

```atto
if ready then
  consume()
else
  retry()
fi

if load_optional() as const item then
  use(item)
fi

while should_continue() do
  rt cooperate
done
```

The **target** early-exit spelling is `guard condition { terminal_failure_path }` with **no `else` or `fi`**. A comma-separated guard list checks each clause once, left to right. `guard name is Some` is the proposed explicit `Option<T>` presence narrowing without `name = name`, but this payload variant requires ownership-proof-backed compiler implementation before admission; see [guard contract](15-guard.md).

An `if expression as const/let name` binding tests **presence**, not truthiness. `const` prevents mutation of the binding; `let` permits it within ordinary ownership rules. `final` is not a conditional-binding keyword.

In this position `const` means an immutable **runtime** binding (the same rights as `val`); it does **not** require a compile-time constant, unlike a statement-level `const` declaration. Whether to respell it `as val` is S-44.

`as` has several roles, chosen by the token that follows it:

| Context | Form | Meaning |
| --- | --- | --- |
| After a declaration header | `define ... as` | Opens a declaration body |
| In a condition, followed by `const` or `let` | `if e as const name then` | Presence binding |
| In a `select`/`readch` arm, followed by an identifier and `->` | `readch ch as value -> ...` | Arm binding |
| Followed by a type (optionally `as?`) | `e as T`, `e as? T` | Checked cast ([chapter 02](02-types-and-patterns.md)) |

Any other token after `as` is a syntax error.

`match ... over ... end`, `do match ... over ... end`, `switch` and `select` are distinct constructs. An expression-form `return match ...` must infer its enclosing return type where admitted. Typed variants such as `match<int>` and `select<int>` constrain arm results. Duplicate and unreachable arms should be compile errors; exhaustive/disjoint-vs-priority matching is still subject to [open questions](12-open-questions.md).

## Call syntax and operators

Arithmetic, checked comparison, assignment, function call, lambdas and generic arguments have distinct grammar slots. `|>` is the *value/function* pipeline operator. The keyword `pipe` is reserved for actor pipeline connections; neither is a synonym for bitwise `|`. `?` has context-dependent uses (optional type, parameter omission, postfix propagation, and ternary form) and must not be parsed with a global text replacement. The grammar MUST settle each use with bounded lookahead:

- In a type position, `T?` is `Option<T>`.
- In a parameter declaration, a `?` directly after the parameter name marks an omittable slot (`T name?`).
- In an expression, a `?` directly followed by a token that can start an expression begins a ternary only if a matching `:` follows at the same nesting depth; otherwise it is postfix propagation.
- Inside a call argument list, where `:` also introduces a value label, a ternary MUST be parenthesized: `f(flag: (c ? a : b))`.

Any `?` the grammar cannot classify this way is a syntax error, not a guess. Whether the ternary form survives at all is S-45.

## Rejection requirements

Parser/type checker MUST reject: unsupported extension without migration permission; ambiguous dual-file imports; invalid compound keywords; actor declarations masquerading as classes; assignments as conditions; invalid mutable writes; invalid generic specializations; illegal source-lifetime escapes; unclassifiable `?`, `as` or line-break uses; `name: Type` parameters; same-scope redeclarations; reserved words used as free identifiers; and source features not lowerable on the selected backend before producing misleading executable IR.
