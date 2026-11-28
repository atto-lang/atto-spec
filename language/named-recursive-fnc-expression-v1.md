# Named recursive function expressions v1

**Status: target proposal, not verified compiler support.** Tracks [#295](https://github.com/atto-lang/atto-spec/issues/295) and [the nine shared conformance sources](https://github.com/atto-lang/atto-platform-conformance/tree/main/fixtures/named-recursive-fnc-v1).

## Source syntax

A named function expression is a primary expression, distinct from a named declaration and from a pipe-delimited anonymous lambda.

```atto
pub fnc main(): int {
    return 55 |> fnc fib(int v): int {
        ^ match v over
            on 0 -> 0,
            on 1 -> 1,
            on _ -> fib(v - 2) + fib(v - 1)
        end
    };
}
```

For the named-expression grammar, allow both : and -> for an explicit result annotation, or an explicit infer annotation if inference can be resolved statically. No implicit result annotation. The braced body follows the existing statement-return rules; the fixture's omitted semicolon after match end is an explicit statement-boundary acceptance target at the closing brace. The semicolon-terminated equivalent must also work. A named expression cannot carry declaration visibility/export modifiers. Anonymous lambda heads still require their pipe delimiters. Ordinary named declarations retain their existing scope and syntax.

A unary scalar value pipeline evaluates its upstream exactly once and then invokes the checked unary callable once. A named-expression stage has the same precedence and value semantics as an anonymous callable stage; existing tuple and other pipeline contracts are unchanged. A named expression may also be parenthesized and invoked, or stored in an ordinary immutable callable binding where the implementation supports first-class callable values.

## Lexical identity and type checking

- Allocate an immutable self-binding for the exact declaration identity before checking the body. It is visible only in that function body and its permitted nested lexical scopes, not after the expression, not as a module export. Resolve recursive calls using the same arity/type/effect checks as ordinary calls.
- A same-spelled outer function cannot capture the self-call; a later use outside the expression must resolve normally or produce a targeted unbound-callable diagnostic. Reject an ambiguous same-scope parameter/local collision rather than silently choosing an unrelated callable.
- The declared result type is available while checking recursive calls. For explicit infer, solve a consistent concrete result before lowering or reject unresolved/conflicting constraints. Do not use a runtime unknown type or infer void from omission.
- The caret return exits its nearest lexical callable. It never exits the pipeline's enclosing function directly. Each match arm returns a value of the checked match result type. First-match semantics and lazy arm evaluation remain unchanged.
- Capture only proven lexical free variables, excluding the self-name from the external capture set. An escaping callable may not extend a borrowed lifetime or actor-state access; retain ordinary ownership, capability and effect admission. Self-recursion is not an excuse for an implicit owning cycle, dynamic receiver lookup, or a hidden global binding.

## Implementation tiers

1. Capture-free, explicitly typed direct calls and scalar pipeline stages: lower to a private compiler-owned symbol with an exact typed recursive call edge. No runtime code generation or heap closure is required.
2. Nested direct calls and immediate parenthesized invocation: preserve independent lexical identities and nesting limits.
3. Stored and escaping callable values with immutable captures: prove environment layout, ownership, lifetime, and same-environment recursion.
4. Inference, effects and actor/suspending profiles: admit only after independent checks. Unsupported profiles must reject clearly, never miscompile.

Tail recursion follows the target's existing proper-tail-call contract, where promised. Non-tail recursion requires bounded stack/failure behavior; do not claim implicit memoization, unbounded stack, or hard-real-time behavior. Do not automatically memoize effectful calls.

## Executable acceptance

Run shared .atto fixtures through each real compiler and execute target guests, not just parse. Use full signed i64 results (BigInt for Wasm, typed native observer or exact decimal output for native targets). POSIX exit status alone is not a full-width oracle. The exact fib(55) fixture is extended-only with a resource limit; small inputs and linear nested recursion provide fast independent coverage. fib(92) must not overflow an unnecessary final accumulator update; fib(93) must produce the canonical checked arithmetic failure. Negative scope fixture requires a targeted name-resolution diagnostic and no output artifact; syntax rejection or unsupported is not a passing negative.

Add further tests for homonyms, nested self-binding identities, once-only upstream evaluation, argument mismatch, explicit infer, escaping-borrow rejection, formatter preservation and AOT code generation. Capture-free tier acceptance is not evidence for stored closures or effects.

Each receipt records exact compiler head/tree, fixture blob, fresh built compiler and emitted artifact digests, toolchain, actual run/step, full-width result or normalized typed failure. All compiler lanes remain NOT_EXECUTED until independently verified; report HDL/real-time restrictions separately.
