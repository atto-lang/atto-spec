# Bang-suffixed aliases for `pipe`, `rpipe`, and `stop` (v1)

**Status: TARGET / normative proposal, not an executable-backend parity claim.**
This amendment records the language decision to accept `pipe!`, `rpipe!`, and
`stop!` as exact semantic aliases for the corresponding existing
constructs. It does **not** introduce new operators, execution effects, or
privileges. In particular, the directional `rpipe` contract is currently
staged in [atto-spec PR #45](https://github.com/atto-lang/atto-spec/pull/45);
the new spelling cannot make that unmerged feature executable.

## Grammar and semantic equivalence

For every grammar position in which a given bare spelling is valid, its bang
spelling MUST parse to the same checked operation, with the same operands,
types, precedence, associativity, evaluation order, diagnostics, effects,
ownership, capabilities, resource limits, and runtime outcome:

```ebnf
forward_pipe_op = "pipe" | "pipe!" ;
reverse_pipe_op = "rpipe" | "rpipe!" ;
stop_op         = "stop" | "stop!" ;
```

These productions **extend only the existing corresponding grammar positions**.
They must not be recognized globally as identifier renames. The `!` is one
contiguous ASCII character immediately following the whole word; `pipe !`,
`rpipe !`, and `stop !` are *not* aliases. Recognize tokens with identifier
boundaries: `mypipe!` and `pipe!suffix` must not be split into these
operations. Strings, template literals, quoted Symbols, comments, attribute
names, module names, user-defined function names, and plain identifiers remain
opaque. A lexer can represent each bang form as a contextual token pair
(keyword/identifier + `!`) provided the parser recognizes the whole syntax
in the permitted context and preserves source locations.

`A pipe B` and `A pipe! B` always denote the same continuous dataflow
edge **A → B**. `A rpipe B` and `A rpipe! B` denote the same continuous
edge **B → A**. A chain can mix bare and bang spellings **of the same
direction**, but a chain that mixes forward and reverse direction without
parentheses remains invalid. The bang does not turn any pipeline into a
single-value functional `|>` or `<|` expression; it does not change
stream/channel backpressure, checked graph admission, PipeHandle ownership,
structured cancellation, tenant capabilities, or `get_done()`.

```atto
producer pipe! transform pipe consumer;       // forward: producer -> transform -> consumer
consumer rpipe! transform rpipe producer;     // equivalent reverse-written graph
producer pipe! transform pipe! consumer;      // same as all-bare forward
consumer rpipe transform rpipe! producer;     // same as all-bare reverse
```

For a **recognized graceful-stop operation** in an actor/graph lifecycle
context, `stop!` means exactly what `stop` means. Where the existing
lifecycle API admits `worker.stop()`, `worker.stop!()` is a contextual alias
for that same invocation; it is not a new method declaration, a method named
`stop!`, or an automatic rewrite of arbitrary user-defined `stop()`
methods. If a backend supports a standalone `stop target` statement, it
must admit `stop! target` with identical behavior. Otherwise neither form
gains that standalone admission from this amendment.

`stop!` MUST NOT imply force termination, panic, cancellation, bypass of
actor supervision or TenantVM capabilities, stronger privileges, or quicker
physical retirement. It has the same effect/return type and completion rules
as the corresponding bare stop. In particular, `stop!` cannot bypass a
missing stop capability or an already-closing actor/graph state.

## Formatting and compatibility

- Keep both spellings legal. A formatter MUST preserve the authored spelling
  and may not rewrite `pipe!` to `pipe`, or vice versa, by default.
- Round-trip parsing MUST preserve operation identity, source locations,
  pipeline stage ordering, and diagnostics. Only explicit opt-in
  source transformations can change spelling after equivalence is proved.
- `Actor.pipe(...)` is a nominal factory method, not the infix keyword.
  This amendment does NOT add `Actor.pipe!(...)`, `io.pipe!(...)`, or a
  synthetic `rpipe!`/ `stop!` exported function name.
- `worker.stop()` remains a legal callable/member spelling, where already
  admitted; a parser must distinguish it from an admitted built-in
  lifecycle call before treating `worker.stop!()` as an alias.
- `a pipe! b rpipe! c` is rejected for mixed direction, just as
  `a pipe b rpipe c` is. `pipe!foo` is not a pipe operator.
- Do not reinterpret `!=`, logical `!expression`, ownership `take!`,
  `copy!!`, or a legal `pipe !condition` token sequence.

## Admission and verification

Implementations must perform full parser/context and type/effect validation,
not a global regex replacement. Positive and negative fixtures must cover
token adjacency, comments/strings/Symbols, whitespace, nested pipelines,
mixed directions, stage evaluation order, exact stop lifecycle/capabilities,
independent `pipe` versus `rpipe` direction, alias/bare diagnostics
equivalence, formatter idempotence and unchanged emitted guest outcomes.

The [machine-readable contract](../contracts/pipe-stop-bang-alias-v1.json)
and [source-only integrity tests](../tests/pipe-stop-bang-alias-contract.test.mjs)
prove documentation consistency only. They are **not** a live parser,
compiler, executed guest, Native AOT or multi-backend conformance proof.
Until separately verified, backends must reject unsupported forms with
an explicit diagnostic rather than silently changing their meaning.

Related staged work: [atto-spec #45](https://github.com/atto-lang/atto-spec/pull/45),
[atto-source.rs #224](https://github.com/atto-lang/atto-source.rs/pull/224),
and [atto-platform-conformance #102](https://github.com/atto-lang/atto-platform-conformance/pull/102).
