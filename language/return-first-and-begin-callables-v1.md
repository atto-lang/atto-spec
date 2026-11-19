# Return-first callable headers and explicit end-delimited bodies v1

**Status: accepted syntax target (2026-11-18); compiler/backend parity pending verification.** This extends [mandatory named-callable results](explicit-callable-return-types-v1.md) and [callable body styles](callable-body-styles-v1.md).

## All shown forms are alternatives, not duplicate overloads

The following declaration headers produce the **same signature** (name, arity, parameter types, declared or statically inferred result, effects, receiver and visibility):

~~~atto
fnc calculate(int x) -> int { return x * 2; }
fnc calculate(int x): int { return x * 2; }
fnc calculate(int x): int -> { return x * 2; }
fnc int <- calculate(int x) { return x * 2; }
int <- calculate(int x) { return x * 2; }
int <- calculate(int x) return x * 2; end
int <- calculate(int x) begin return x * 2; end
~~~

These are **alternative source programs**: writing two declarations of calculate(int) in one scope triggers the existing duplicate signature error. No overload identity or return-type-based overloading is introduced.

The same spelling families apply to void and explicit infer:

~~~atto
void <- reset() begin end
infer <- calculate_other() begin return 42; end
fnc reset(): void -> { }
fnc calculate_other() -> infer { return 42; }
~~~

## Grammar and lexical rules

~~~ebnf
named_header     = ["fnc" | "routine"], identifier, "(", parameters, ")", post_return
                 | ["fnc" | "routine"], return_type, "<-", identifier, "(", parameters, ")" ;
post_return      = (":" | "->"), return_type ;
return_type      = type_ref | "infer" ;
callable_body    = "{" , { statement }, "}"
                 | "begin", { statement }, "end"
                 | { statement }, "end"
                 | existing_legacy_comma_end_body ;
~~~

The bare return-first version without fnc/routine is a **named callable declaration only in declaration scope** (file/module/class/actor, where allowed), not an expression or variable binding. The exact contiguous token `<-` is a **left-pointing return-type separator**, not assignment, a stream-read operator, or two independent operators. Whitespace within it (`< -`) is invalid; it is not confused with `<=`, `<T>` or `->`. The return type appears exactly once: combining `int <- name() -> int` is invalid.

For return-first headers, `begin`/`end` and an explicit semicolon-terminated statement sequence followed by `end` are both admitted. They have **ordinary statement semantics**: no implicit return from their final expression. An empty body is valid for declared void or infer (resolved to void), including a comment-only body. For a nonvoid result, every reachable path must return a value (or terminate via an admitted exceptional flow), otherwise compile error. For the existing arrow type + Erlang-like comma/end family, preserve its separate tail-expression implicit-return contract; do not reinterpret it as semicolon/end or silently flatten it.

For existing name-first `: Type -> { ... }`, the second arrow is a **body delimiter** and is legal only when followed by a brace block, preserving the prior contract. `: Type { ... }` and `-> Type { ... }` remain legal. Allow explicit `begin`/`end` after name-first headers where grammar permits, but never quietly invent a return annotation.

Constructors remain an exception with their own syntax; lambdas retain contextual result inference. Actor `receive` must still explicitly declare void, and actor state is never made accessible by a body spelling.

## Formatting and safety

Prefer the existing conventional form `fnc name(parameters) -> ConcreteType { ... }` in authored examples and tooling, **without rejecting any accepted alternate spelling**. Formatters may not reorder callables, change return/ownership/effect types, or rewrite brace vs begin/end vs legacy Erlang comma/end bodies unless explicitly requested and proven semantically equivalent. Preserve return-first syntax by default, including the optional fnc prefix and exact `<-` separator. `infer` remains explicit, not preferred, and must resolve to a concrete type before codegen.

Negative tests require missing return-type diagnostics, double result annotation, misplaced or split `<-`, unmatched/duplicate `begin`/`end`, duplicate callable declarations despite alternate spelling, and nonvoid no-return failures. Conformance requires executed compiled guests and compiler no-artifact evidence pinned to exact SHAs. This is a source syntax specification, not a claim that every backend implements it already.
