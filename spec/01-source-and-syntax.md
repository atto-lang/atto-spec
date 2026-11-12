# 01 — Source Files, Lexical Syntax and Declarations

**Status: DRAFT; TARGET semantics unless specifically marked.**

## Source grammar baseline

AttoLang uses UTF-8 source files with extension `.atto` (and legacy `.ores`). Identifiers and keywords are case-sensitive. Function/method names are `snake_case`. Comments may use `//`; exact comment and string escape grammar is subject to a synchronized lexer/formatter test suite. Semicolons can often be omitted; the parser must not insert them in a way that changes a program's meaning. Braces and `as ... end` are context-specific forms, not interchangeable everywhere.

Only listed compound keywords accept an ASCII U+002D hyphen, such as `critical-read`, `critical-write`, `transform-pipe` and `nb-select`. Ordinary `a-b` is subtraction, never a hyphenated identifier. Unicode dash characters are not equivalent to `-`.

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

The samples use one of several valid function forms: `: T` and `-> T` are both return spellings, `::` is optional, and a body uses braces or closes with `end`. See [function forms](16-lexical-and-grammar-reference.md#function-forms). Compilers do not accept all of these yet. A formatter must preserve meaning and must not "upgrade" unlowered syntax into executable claims.

- Free-standing functions use `fnc`; an instance method ordinarily omits `fnc` and has implicit `self`. Legacy instance `fnc` may be accepted and formatted to the bare method.
- Public declarations use `pub` in positions admitted by the grammar; canonical module spelling is `define pub module`. Module members are private unless exported.
- Classes are nominal. Class nesting inside classes is not permitted; constructors use an explicit `constructor(...)` declaration rather than a Java-style class-name constructor.
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

A local binding and class field are distinct syntactic contexts. No implicit assignment is allowed in a condition: `if x = y then` must be rejected; use `eq` or `==` where admitted for comparison.

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

`match ... over ... end`, `do match ... over ... end`, `switch` and `select` are distinct constructs. An expression-form `return match ...` must infer its enclosing return type where admitted. Typed variants such as `match<int>` and `select<int>` constrain arm results. Duplicate and unreachable arms should be compile errors; exhaustive/disjoint-vs-priority matching is still subject to [open questions](12-open-questions.md).

## Call syntax and operators

Arithmetic, checked comparison, assignment, function call, lambdas and generic arguments have distinct grammar slots. `|>` is the *value/function* pipeline operator. The keyword `pipe` is reserved for actor pipeline connections; neither is a synonym for bitwise `|`. `?` has context-dependent uses (optional type, parameter omission, postfix propagation, and ternary form) and must not be parsed with a global text replacement.

### Canonical boolean punctuation operators (target decision, 2026-11-12)

Boolean conjunction, disjunction, and exclusive-or use the **punctuation** tokens `&&`, `||`, and `^^`. These supersede proposed lowercase word operators `and`, `or`, `xor` and historical condition-only comma/pipe shorthand. None of `and`, `or`, or `xor` becomes a reserved word solely by virtue of logical expression syntax; existing name-resolution restrictions unrelated to boolean operators are separate.

```atto
bool and = a && b;
bool or  = a || b;
bool xor = a ^^ b;
```

These are illustrative boolean declarations: each operand and the result must have type `bool`. There is no integer bitwise interpretation, truthiness, user-defined overloading, or implicit conversion. Bare `&` and `|` **must not** act as boolean AND/OR operators. A single `^` **must not** act as boolean or integer XOR; integer bitwise XOR remains an explicitly named API such as `Integer.bitXor` where supported. Other dedicated syntax (for example `|>` value pipelines, union-type `|`, and borrowing syntax) retains its own documented meaning.

With decreasing precedence the expression grammar is `equality/comparison > && > ^^ > || > ?: > assignment` (subject to the existing distinct pipeline grammar). Each logical operator associates left-to-right:

```ebnf
logical_or  = logical_xor { "||" logical_xor } ;
logical_xor = logical_and { "^^" logical_and } ;
logical_and = equality { "&&" equality } ;
```

`&&` evaluates its left operand and skips the right operand if false. `||` evaluates its left operand and skips the right operand if true. `^^` evaluates each operand **exactly once, left to right**, without short-circuiting: it is true iff the operands differ. An operand that suspends retains this ordering through continuation; thrown errors propagate without evaluating later operands. The typechecker checks both operands even if one is a known constant. The tokenizer must match adjacent two-character punctuation atomically; `^ ^` is not `^^`.

Positive and negative migration fixtures live in `contracts/logical-punctuation-v1/`. A backend MUST reject unsupported syntax before claiming executable IR and MUST record exact-head, executed compiler/typecheck, and guest test evidence before marking implementation or parity. Source-only contracts and zero-step CI are not execution evidence.

## Rejection requirements

Parser/type checker MUST reject: unsupported extension without migration permission; ambiguous dual-file imports; invalid compound keywords; actor declarations masquerading as classes; assignments as conditions; invalid mutable writes; invalid generic specializations; illegal source-lifetime escapes; and source features not lowerable on the selected backend before producing misleading executable IR.
