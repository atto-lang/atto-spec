# Typed sequence-pattern fragments and std.pattern v1

Status: **additive target design, NOT IMPLEMENTED or guest-verified** (2026-11-19).
This proposal extends [structural sequence matching v2](sequence-pattern-matching-v2.md) without
changing its witness selection, guard semantics, bounded matching, or ownership rules.
No current compiler, formatter, stdlib, or backend parity is inferred. The historical
[v1](sequence-pattern-matching-v1.md) remains unchanged. This work is staged with
[atto-spec #59](https://github.com/atto-lang/atto-spec/pull/59) and conformance #56.

## Surface syntax and semantic equivalence

~~~atto
import module pattern from "std.pattern";

pub fnc main(): int {
    val items: List<int> = List.of(1, 2, 3, 4, 5);
    return match<int> items over
        on List.of(
            pattern.of("..."),
            is int as val a,
            is int as val b,
            is int as val c,
            pattern.of<int>("...")
        ) -> a + b + c,
        on _ -> 0
    end;
}
~~~

Expected result: 6. Both pattern.of calls are compile-time-only, and the arm must
produce the same typed AST and selected bindings as:

~~~atto
on List.of(..., is int as val a, is int as val b, is int as val c, ...)
    -> a + b + c
~~~

Double-quoted strings are the proposed canonical source spelling. Single-quoted
multi-character literals are not introduced by this contract. The parser recognizes
pattern.of only after resolving the imported **canonical std.pattern intrinsic
symbol**; textual name matching, redefinitions and user-controlled lookalikes
must never grant intrinsic evaluation.

## Two distinct type levels

1. Compile-time pattern fragment: pattern.SeqPart<T> is a **compile-time-only
   compiler-known type**, not a runtime value, function, trait, user extractor,
   reflection hook, serialized code object or arbitrary AST pointer. T is the
   *subject sequence element type*. It does not mean "search for a T".
2. An ordinary subject List<T>/Array<T> is a runtime sequence; only its elements
   are inspected. Ordinary Tuple patterns remain exact-arity under v2.
3. The permitted pattern-position forms are pattern.of("literal source"),
   pattern.of<T>("literal source"), and references to proven compile-time
   pattern.SeqPart<T> constants. The literal may be a provably compile-time
   pure string constant; a runtime val, an environment-backed define const,
   interpolated runtime string or effectful function call is not admissible.
4. Without an explicit <T>, infer T from the surrounding List<T>/Array<T>
   pattern subject after normal type-checking. If the subject's static element
   type is Any, T=Any. No inference may introduce an unsound runtime cast.
5. With explicit <T>, T must equal the context's **normalized element type**
   (in v1, require type identity rather than variance/coercion). For a
   List<Any>, pattern.of<int>("...") is therefore a type error; use
   pattern.of<Any>("is int") for one checked integer element, or the native
   "is int as val x" pattern for a capture.
6. A wildcard inside pattern.of<T>("...") accepts any element of T. It never
   implicitly performs a runtime is-T check. Type tests inside the fragment
   remain explicit; impossible element-type tests are diagnosed.
7. A SeqPart<T> cannot escape into ordinary expression execution, become Any,
   cross an actor/TenantVM boundary, be used as a runtime argument, or be
   reconstructed by deserializing data. Compile-time imports, generic
   specialization and visibility resolve the canonical fragment value before
   final typed-AST lowering.

The normal file/module define const rules are not relaxed for arbitrary
functions: only the whitelisted, pure compiler-intrinsic pattern.of constructor
may form a compile-time SeqPart<T> value. This requires a narrowly scoped
constexpr admission rule alongside the existing
[file/module const contract](file-module-const-v1.md), not an exception for
any call that happens to return a similarly named type.

## Bounded template grammar

pattern.of consumes a **pattern fragment**, not a full Atto source file or
expression. The first edition permits comma-separated sequence items:

~~~ebnf
fragment         = fragment_item, { ",", fragment_item } ;
fragment_item    = "..." | "_" | literal | "is", ["!"], reifiable_type
                 | "...(", repeat_segment, { ",", repeat_segment }, ")" ;
repeat_segment   = nonnegative_integer, "of", repeat_atom ;
repeat_atom      = literal | bare_builtin_type | "is", ["!"], reifiable_type | "_" ;
~~~

Existing v2 rules apply: zero counts are validated, repetition expands to
exact positions, nested repetition and binders inside repetition are rejected,
and resource limits are cumulative across expanded items and nested matching.
The fragment is parsed with a bounded, quote-aware lexer and validated in the
context of the *surrounding subject type*. All strings must be valid UTF-8;
malformed escapes, trailing separators, unmatched delimiters and trailing
unconsumed tokens are errors, not implicit fallback to runtime evaluation.

No identifiers, imports, member calls, custom extractors, predicates, arbitrary
functions, guards, closures, suspension, ownership operations or declarations
are admitted **inside** a fragment string. In particular, "is int as val x"
in a string is rejected. Bindings must be visible in normal Atto tokens.

A fragment expands into zero or more **sequence items** at its exact call
position. Adjacent rests are checked after all fragment and constant expansion.
For example, List.of(pattern.of("..."), ...) is a compile error. A fragment
containing multiple comma-separated items has no implicit tuple/list wrapper
and no implicit copy or allocation. Direct syntax and expanded syntax must have
identical type checking, source-order pattern analysis, reachability, matching
witnesses and guards.

For nested patterns the first edition supports intrinsic fragments in List.of
or Array.of pattern-item positions only. A stand-alone runtime call
pattern.of("..."), a fragment in an expression constructor, or a rest fragment
inside Tuple.of fails closed. Fixed-width patterns inside Tuple.of can be added
only through an independently verified exact-arity extension.

## Explicit bindings and borrowed rest captures

Named bindings are written **outside** the fragment string.

~~~atto
on List.of(
    pattern.of("...") as val before,
    is int as val a,
    is int as val b,
    is int as val c,
    pattern.of("...") as val after
) -> a + b + c
~~~

After expansion, a single bare rest item may have an external "as val name"
binder. The synonymous native spelling is "... as val name". The binder
denotes a borrowed, read-only SeqView<T> scoped to the matched subject and
the selected witness's region, **not** an allocated List<T>, owner, writable
alias or copied array. The view can be zero-length and need not be contiguous.
Its lifetime and operations must be specified in core/stdlib; until then
compilers must reject captured-rest syntax as unsupported rather than fabricate
ownership. No implicit take!, share!, copy!, mutation or cross-TenantVM access.

An external "as val name" binder on a fragment that expands to exactly one
ordinary atomic pattern item binds the single matched element under normal
borrow/Copy rules. A fragment expanding to multiple items, counted group or
zero items cannot be given a single external binder. Duplicate names and
shadowing of names from the same pattern are errors. Dynamic captures using
as const are invalid unless the actual initializer is proven constexpr;
ordinary subject values cannot become const by matching.

The existing [local binding mutability](local-binding-mutability-v1.md) and
[tuple ownership](tuple-destructuring-v1.md) contracts control val/let/mut,
root lifetimes, mutable loans, and actor isolation. Rest captures do not cross
await, actor state access or owner destruction unless lifetime/loan checks
prove that the corresponding borrow remains valid.

## Matching, error handling and diagnostics

The compiler must expand all fragments **before** v2 feasibility, dominance,
reachability and exhaustiveness checks. Expansion does not invoke user code.
For multiple witnesses use v2 leftmost-shortest selection. Evaluate any
ordinary when guard exactly once after choosing that witness, without retrying
a different decomposition. Failed arms never leak binder state.

Suggested diagnostic categories, standardized exact codes to follow with
conformance:
- E_PATTERN_CONTEXT: intrinsic used outside supported pattern context.
- E_PATTERN_CONSTEXPR: template not proven compile-time constant.
- E_PATTERN_SOURCE: invalid or unsupported template grammar.
- E_PATTERN_TYPE: type argument, subject type or reifiability mismatch.
- E_PATTERN_BINDING: capture embedded in text, duplicate or invalid capture.
- E_PATTERN_BUDGET: source/expansion/work/depth resource limit.
- E_UNSUPPORTED: backend has no correct lowering/borrow-checking yet.

No error may silently become "pattern does not match". Source diagnostics
must avoid leaking sensitive constant input where policy forbids disclosure.

## Runtime pattern facilities: distinct later milestone

A future safe runtime API may expose:

~~~atto
val parsed: Result<pattern.SeqPattern<int>, pattern.PatternError> =
    pattern.parse_seq<int>(user_text, limits);
~~~

This is **illustrative, not an approved callable signature or implementation**.
Runtime parsing must never introduce lexical binders into match arms, dispatch
arbitrary calls, use regex-like catastrophic backtracking, perform I/O, access
ambient permissions, or expose references across TenantVMs. Validated
programs and matches require explicit per-tenant resource budgets, deterministic
failure outcomes and Result-based errors. No implicit conversion exists between
runtime SeqPattern<T> and compiler-only SeqPart<T>. Design and implement the
runtime engine in a separate reviewed contract.

## Required positive and negative conformance

Positive: inferred and explicit T; quoted literal; is-T fragment in List<Any>;
counted segments; multi-item expansion; transparent equivalence with native
...; empty rest; repeated rests separated by atoms; leftmost-shortest
capture; guard called once; compile-time constant reference; borrowed capture
only with correct lifetime support; safe nested List position.

Negative: runtime string; os.read_env initializer; malformed literal/escape;
single-quoted "..."; injections such as "is int as val x"; inline call syntax;
unmatched parentheses; trailing comma; nested repetition; overlarge count;
adjacent rest after expansion; explicit type mismatch; List<Any> to int
mismatch; shadowed std.pattern symbol; Tuple rest; bind multiple items;
duplicate capture; borrowed view escaping owner/await; attempting referent
mutation; cross-tenant view transport; resource exhaustion.

Reference-model/registry checks are **HOST_ONLY**. All cross-backend compiled
guest and formatter-equivalence evidence remains NOT_EXECUTED until proven on
exact source/head SHA using real compilers and guest outputs. Never infer
compiler support from acceptance of source text or host-only Node tests.
