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
fnc int • calculate(int x) { return x * 2; }
int • calculate(int x) { return x * 2; }
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
name_first       = ("fnc" | "routine"), identifier, "(", parameters, ")", post_return ;
return_first     = ["fnc" | "routine"], return_type, ("<-" | "•"), identifier, "(", parameters, ")" ;
post_return      = (":" | "->"), return_type ;
return_type      = type_ref | "infer" ;
brace_body       = "{", { statement }, "}" ;
explicit_body    = "begin", { statement }, "end" ;
bare_end_body    = [ "::" ], physical_newline, { statement }, "end" ;
effect_clause    = ("throws" | "raises" | "panics"), error_type, { ",", error_type } ;
return_first_def = return_first, { effect_clause }, (brace_body | explicit_body | bare_end_body) ;
(* The existing legacy comma-tail body remains name-first -> Type only. *)
~~~

Within a class or actor, the normal name-first method shorthand may also omit fnc. At file/module top level, only a **return-first** declaration may omit fnc/routine. The bare return-first version without fnc/routine is a **named callable declaration only in declaration scope** (file/module/class/actor, where allowed), not an expression or variable binding. Both the exact contiguous token `<-` and exact Unicode U+2022 BULLET `•` are return-type separators with identical callable signatures and semantics. Neither is assignment, stream-read, or a binary operator. Whitespace within `<-` (`< -`) is invalid; whitespace around the single bullet is permitted. Middle dot `·` (U+00B7), bullet operator `∙` (U+2219), and other lookalikes are invalid. Do not confuse `<-` with `<=`, `<T>` or `->`. The return type appears exactly once: combining `int <- name() -> int` is invalid.

For return-first headers, `begin`/`end` and a newline-initiated semicolon-terminated statement sequence followed by `end` are both admitted. The optional exact `::` ends the header and begins the ordinary-statement body: it is legal directly after the closing `)` or after a complete `throws`, `raises` or `panics` effect clause. Without `begin` or `::`, an effect-free return-first declaration may start its body on the next physical line; when inline effects follow the return type, require `begin`, `::`, or a brace block to disambiguate the complete effect list from the first statement. `begin` remains legal even without effects, but is not required. `::` may appear at the end of the effect-clause line and the statement body then starts on a later line. `::` is never a return value, a throw/raise marker, or a request for implicit tail-expression return. They have **ordinary statement semantics**: no implicit return from their final expression. An empty body is valid for declared void or infer (resolved to void), including a comment-only body. For a nonvoid result, every reachable path must return a value (or terminate via an admitted exceptional flow), otherwise compile error. For the existing arrow type + Erlang-like comma/end family, preserve its separate tail-expression implicit-return contract; do not reinterpret it as semicolon/end or silently flatten it.

The body-boundary rule is independent of which return-first delimiter was used (`<-` or U+2022 `•`) and whether `fnc` was written. A name-first callable whose `-> T` comes *after* effect clauses retains the existing newline/statement/`end` alternative; the final result type closes that header. Do not require redundant `begin` or `::` for that already-unambiguous case.

For existing name-first `: Type -> { ... }`, the second arrow is a **body delimiter** and is legal only when followed by a brace block, preserving the prior contract. `: Type { ... }` and `-> Type { ... }` remain legal. Allow explicit `begin`/`end` after name-first headers where grammar permits, but never quietly invent a return annotation.

Constructors remain an exception with their own syntax; lambdas retain contextual result inference. Actor `receive` must still explicitly declare void, and actor state is never made accessible by a body spelling.

## Accepted return-first body boundary examples

These are alternative declarations, not overloads to place together in one scope. The Error subclass and `raise!` syntax below are full-language targets; compiler recognition alone does not authorize raising in a browser without runtime semantics.

~~~atto
fnc int <- double_answer(int value)
  return value * 2;
end

fnc int <- double_answer(int value) ::
  return value * 2;
end

fnc int <- double_answer(int value)
raises Foo
begin
  if value > 3 then
    raise! new Foo();
  fi
  return value * 2;
end

fnc int <- double_answer(int value)
raises Foo ::
  if value > 3 then
    raise! new Foo();
  fi
  return value * 2;
end
~~~

Effect clauses are checked *upper bounds*, not handlers; `raise!` retains its exceptional-control semantics and must be proved safe by the relevant backend. Nested `if/fi`, `match/end`, and `try/catch/finally/end` consume their own terminators. Bare bodies are not inferred as Erlang comma-tail expressions: the final `return` remains explicit in a nonvoid function. A no-effect header ending in `::` is legal; a `raises Foo ::` header is equally legal; a dangling `raises Foo` followed immediately by ordinary statements without `begin`, `::` or braces is rejected, preventing an ambiguous parse.

## Formatting and safety

Prefer the existing conventional form `fnc name(parameters) -> ConcreteType { ... }` in authored examples and tooling, **without rejecting any accepted alternate spelling**. Formatters may not reorder callables, change return/ownership/effect types, or rewrite brace vs begin/end vs legacy Erlang comma/end bodies unless explicitly requested and proven semantically equivalent. Preserve return-first syntax by default, including the optional fnc prefix and the exact source separator (`<-` or `•`). Rewriting one to the other requires an explicit formatting policy and parse-equivalence proof. `infer` remains explicit, not preferred, and must resolve to a concrete type before codegen.

Negative tests require missing return-type diagnostics, double result annotation, misplaced or split `<-`, lookalike/non-U+2022 bullet separators, unmatched/duplicate `begin`/`end`, a missing end after `::`, a `::` in the middle of an effect type list, duplicate effect kinds, a missing body separator after return-first effects, duplicate callable declarations despite alternate spelling, and nonvoid no-return failures. Conformance requires executed compiled guests and compiler no-artifact evidence pinned to exact SHAs. This is a source syntax specification, not a claim that every backend implements it already.
