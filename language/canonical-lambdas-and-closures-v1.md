#  Canonical lambdas and AOT closure semantics (v1)

**Status: DRAFT / TARGET — not implementation or parity certification.**

AttoLang's canonical lambda spelling is **`|x| -> expression`**. Every formatter, compiler, documentation example, and conformance fixture MUST favor this form. This is a design target; actual guest admission remains independently gated.

## Canonical grammar (single-expression v1)

```ebnf
lambda_expr   = "|", [lambda_params], "|", [result_annotation], "->", expression ;
lambda_params = lambda_param, { ",", lambda_param } ;
lambda_param  = identifier | type_expr, identifier | identifier, ":", type_expr ;
result_annotation = "=>", type_expr | ":", type_expr ;
```

```atto
|x| -> x + 1
|x, y| -> x + y
|int x| -> x * 2
|int x, int y| -> x + y
users |> filter(|user| -> user.active) |> map(|user| -> user.name)
```

The merged typed-lambda contract permits both `int x` and `x: int`, zero parameters `||`, discarded parameters `|_|`, explicit typed inline annotations `=> T ->` (colon compatibility), and separately admitted braced statement bodies. See [lambda return types](lambda-return-types-v1.md). This expression-only subset does not override those forms. The lambda is an ordinary expression and MUST parse in argument positions, parentheses, nested lambda bodies, `match`/`switch` arms, and the RHS of functional `|>`.

The lexer MUST distinguish `|`, `|>`, `||`, and `->` without text replacement. The parameter bars are not binary bitwise operators. A lambda body associates with its owning `->` and normal expression delimiters. Duplicate parameter bindings are rejected. Lexical shadowing of an outer binding by an inner lambda parameter is allowed under ordinary scoping. Formatter output MUST be idempotent, preserve explicit types, parameter order, precedence and source spans, and keep the canonical `|...| ->` syntax.

Elixir captures (`& &1.active`), implicit numbered placeholders (`_1` without a lexical binding), and omitted-arrow forms are **not** recognized lambda shorthand. This does not prohibit an ordinary, explicitly bound identifier named `_1` if allowed by the normal identifier grammar. Unsupported shorthand MUST fail closed rather than silently desugar.

## Static typing, invocation and pipelines

A lambda has a statically checked callable type with an ordered parameter list, one result type, and an effect set. Unannotated parameter types use bidirectional inference from an expected callable type (argument, variable, return value or functional pipeline); the body constrains the result. Explicit parameter types must agree with context. Implementations MAY use normal static constraints but MUST reject ambiguity rather than assuming `Any`, runtime dynamic dispatch or backend-specific defaults.

The callable and arguments are evaluated exactly once in lexical order before the body; the body expression supplies one result value. Functional `|>` passes one LHS value to a RHS callable, with an explicitly admitted tuple expansion for multi-parameter lambda stages. The next top-level pipe is outside the lambda body; explicit grouping is required to nest it. Actor `pipe` remains a different construct.

## Closures, ownership, actors

- Resolve free variables at the lexical definition site. A nested lambda's own parameter shadows an outer name.
- Enumerate and type-check all captures. Do not implicitly clone, copy, share, or move an owned resource merely to satisfy a closure. Existing explicit ownership operations (`copy!`, `take!`, `share!`) retain their normal meaning.
- Borrowed captures MUST NOT outlive their owners. An escaping lambda cannot retain a stack or sealed actor-state loan without a separately valid lifetime and permission proof. Captures surviving suspension require storage/pinning valid under the scheduler's existing borrow rules.
- Moved values cannot be reused through prior bindings; repeated closure invocation may not duplicate linear resources. Invocation cardinality must respect ownership.
- A closure never bypasses sealed `critical-read`/`critical-write` access, actor isolation, `Sendable`, permission, or cross-isolate transport restrictions. Arbitrary capture environments are not implicitly serialized.
- Destroy or clean up capture environments on normal, exceptional, and cancellation exits. Do not assume a tracing GC will reclaim them.

An explicit capture-list syntax, if introduced later, is outside this v1 contract; static capture analysis is still mandatory.

## Effects and suspension

Check lambda effects as for named callables: `await`, `throws`, `raises`, `panics`, `trap`, critical access, cancellation and permissions. A possibly suspending closure cannot be assigned to an incompatible nonsuspending callback. Borrowing across `await` requires the established pinned-frame/lifetime proof. This chapter intentionally does **not** canonize the proposed `susp |x| -> ...` modifier until effect syntax is reconciled with the function grammar.

## Strict full-AOT lowering

1. Generate a statically typed, statically emitted code body before guest execution; there is no JIT, `eval`, interpreter, or runtime compilation fallback.
2. Represent noncapturing lambdas as direct function references or equivalent statically known callables.
3. Represent capturing lambdas as statically laid-out code-plus-environment values; compile their alignment, call ABI, and destructors for each target.
4. Use escape/lifetime analysis for legal stack/actor-arena/explicitly owned storage. No implicit general-purpose GC or process-global rooting is required for lambda support.
5. Reject unsupported dynamic specialization, reflection, or capture transport at compile time rather than silently falling back to another execution strategy.

Java/GraalVM Native Image, LLVM, WASM, Forge, and .NET Native AOT must agree on observable semantics even where their emitted ABIs and storage layouts differ.

## Required conformance and evidence

At minimum: typed and context-inferred parameters; nesting and lexical shadowing; `|>` precedence; duplicate binder and unknown name rejection; wrong type/arity; borrowing/escape/move rejection; effect admission; sealed actor-state and `Sendable` checks; formatting round-trip; and execution of an AOT-compiled guest artifact.

Each real backend report MUST include immutable source/fixture and compiler SHAs, independently verified exact Git tree, target/profile, compiled artifact identity/hash, compile/run commands, actual guest exit status, and runner logs. Missing, unsupported or skipped cases are BLOCKED/FAIL, never PASS. Manifest integrity tests or mock commands do not establish compiler or five-backend parity.

## Compatibility

Do not normalize historical alternate lambda forms until a separately reviewed equivalence proof preserves ownership, effects, comments, and source mapping. This contract introduces no Elixir-style capture or placeholder shorthand.
