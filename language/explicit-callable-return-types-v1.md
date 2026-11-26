# Explicit named-callable return types v1

**Status: accepted AttoLang target design (2026-11-18).** A concrete declared result type is preferred. The opt-in spelling *infer* is allowed but not preferred. This supersedes older optional return-spec grammar for named callables.

## Mandatory result annotation

Every named callable must declare a result type, **including void**. Accept both colon and arrow header styles with identical semantics.

~~~atto
fnc add(int a, int b) -> int { return a + b; }
fnc say_hello() -> void { }
fnc guessed() -> infer { return 42; }

define class Counter as
  get() -> int { return 1; }
  reset(): void { }
  static fnc create() -> infer { return new Counter(); }
end
~~~

The unannotated form such as *fnc f() { }* must be rejected. Never implicitly treat a missing return annotation as void, or as infer.

Grammar for a name-first callable without inline contracts: **named_callable := named_head required_return_spec body**, where **required_return_spec := ( ':' | '->' ) (type_ref | 'infer')**. With inline failure, effects or budget clauses, the single required return spec can precede or follow the entire contract sequence; see [flexible contract headers and body boundaries](java-style-failure-signature-bodies-v1.md#flexible-contract-headers-effects-budget-and-result-placement-2026-11-26).

Applies to top-level fnc/routine, inline class and actor methods (including instance method shorthand and static fnc), out-of-line mtd receiver methods, and named effect-bearing callables. Actor receive handlers must declare void. Constructors are not return-valued callable declarations and have no result annotation. Contextually inferred lambdas are governed separately by language/lambda-return-types-v1.md; this requirement does not silently make lambda result annotations mandatory.

## Semantics and inference

An explicitly declared void result means every return path is valueless. A concrete result type is checked against all return paths including Erlang-style tail returns; a C-style expression statement does not return implicitly.

An explicit infer requests static resolution of a **concrete** result type before ABI generation, overload selection, export, cross-module typing and AOT. It is not a runtime type or an alias of void. All reachable return paths must agree or have a specified deterministic join. Mixed valueless and value-bearing return paths are errors; unknown callees, unresolved polymorphism and ambiguous ownership must fail closed before emitting an artifact. A fall-through-only body can infer void, but concrete void should be preferred. Erlang-style final expressions participate in the same checked inference; braces do not implicitly return their last expression.

For public interfaces, overrides, actor contracts and exported methods, prefer a concrete result annotation to preserve a stable API. Infer is explicitly allowed for provably resolved signatures; implementations without complete inference must issue a clear unsupported diagnostic instead of guessing.

The token infer is reserved for this annotation context (and separately specified inference contexts) and must not become an implicit field, parameter, generic or local type.

## Migration and tooling

The return-first declaration `fnc T <- name(params)` (or bare `T <- name(params)` in a declaration scope) satisfies the mandatory return-type rule because `T` is explicit *before* the callable name. `T` may be `void` or `infer`. See [return-first callable syntax v1](return-first-and-begin-callables-v1.md). A missing return both before and after the callable name is still invalid.

This is source-breaking for older declarations that omit the return spec. Migrate by checking each callable's actual return paths and then adding a concrete annotation; do not blindly append void. Use infer only when the author intentionally requests inference.

Use **E_RETURN_ANNOTATION** (or a stable equivalent) for a missing annotation, indicating options of concrete T, void, or infer. Use **E_RETURN_INFER** for inconsistent or unprovable inference. A formatter should prefer arrow-plus-concrete-type, retain infer when explicitly authored, preserve the C-brace/Erlang-comma body family, and never silently fill missing annotations. A linter may warn (not error) for infer in public exported signatures.

## Verification

The companion registry atto-platform-conformance/contracts/explicit-callable-return-types-v1.json defines positive and negative fixtures across named callable categories and both separator families. Pass requires executed compiled guests or an actual negative compiler diagnostic with no artifact, pinned to source SHA. Parser-only acceptance is not compiled guest evidence. Legacy compatibility profiles that still allow omitted returns are not strict-v1 compliant.
