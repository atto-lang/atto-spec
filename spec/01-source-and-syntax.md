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

Both `ifnot` and `unless` negate the **first** boolean condition and evaluate it exactly once. They follow the same expression-versus-statement distinction as `if`: a value form has **mandatory** `else` and `fi` with compatible arm types; a `do ifnot/unless ... then` statement has **optional** `else` and closes with `fi`; a braced imperative form has optional `else` and **no `fi`**. The resulting `elif` conditions, if any, are not implicitly negated. Neither keyword supports postfix `unless`. Refutable pattern heads and conditional `as let` bindings in the negated head remain rejected until sound narrowing is implemented. See [the semantic contract](../contracts/ifnot-unless-v1.json) and [conditional-expression grammar PR #183](https://github.com/atto-lang/atto-spec/pull/183).

```atto
do ifnot ready then
  start_worker();
else
  notify_ready();
fi

unless should_stop {
  process_next();
}

val int selected = unless ready then 5 else 6 fi;
```

The **target** early-exit syntax admits both `guard condition { terminal_failure_path }` and `guard condition else terminal_failure_path end`. The guard condition expresses what must hold to continue; a failing condition runs the failure path, which MUST explicitly return from the enclosing function on every possible path (`return value` or `return;` for void; verified lexical `^` is equivalent). `throw`, `raise`, `panic`, `break`, and `continue` cannot discharge this return requirement. The two forms must lower identically, and the formatter preserves the authored block style. A comma-separated guard list checks each clause once, left to right. The brace form has no owned `else`; the keyword form owns `else ... end`, never `fi`. `guard name is Some` is the proposed explicit `Option<T>` presence narrowing without `name = name`, but this payload variant requires ownership-proof-backed compiler implementation before admission; see [guard contract](15-guard.md).

An `if expression as const/let name` binding tests **presence**, not truthiness. `const` prevents mutation of the binding; `let` permits it within ordinary ownership rules. `final` is not a conditional-binding keyword.

`match ... over ... end`, `do match ... over ... end`, `switch` and `select` are distinct constructs. An expression-form `return match ...` must infer its enclosing return type where admitted. Typed variants such as `match<int>` and `select<int>` constrain arm results. Duplicate and unreachable arms should be compile errors; exhaustive/disjoint-vs-priority matching is still subject to [open questions](12-open-questions.md).

## Call syntax and operators

The target Boolean forms are `&&`, `||` and `Xor(bool,bool)` with strict bool typing; `^^` is integer XOR. See [Boolean contract](../docs/CANONICAL_BOOLEAN_OPERATORS_V1.md) and [source fixture registry](../contracts/logical-punctuation-v1/contract.json). Historical word/comma/pipe operators are not canonical; effect-preserving migration is required.

Arithmetic, checked comparison, assignment, function call, lambdas and generic arguments have distinct grammar slots. `|>` is the *value/function* pipeline operator. The keyword `pipe` is reserved for actor pipeline connections; neither is a synonym for bitwise `|`. `?` has context-dependent uses (optional type, parameter omission, postfix propagation, and ternary form) and must not be parsed with a global text replacement.

## Rejection requirements

Parser/type checker MUST reject: unsupported extension without migration permission; ambiguous dual-file imports; invalid compound keywords; actor declarations masquerading as classes; assignments as conditions; invalid mutable writes; invalid generic specializations; illegal source-lifetime escapes; and source features not lowerable on the selected backend before producing misleading executable IR.
