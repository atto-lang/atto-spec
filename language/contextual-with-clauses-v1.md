# Contextual with clauses: actor and callable admission v1

**Status: proposed hardening; not compiler-certified.** Extends [unified inferred effects](unified-inferred-effects-v1.md), [scheduling policy](actor-scheduling-policy-v1.md), [copy-update](with-copy-update-v1.md), [actor state](../spec/05-actors-and-state.md), and [effect/lifetime rules](../spec/23-effects-and-lifetimes.md). This is a reconciliation proposal, not a claim that new syntax is already admitted.

## Separate grammatical contexts

- Callable header: `with state.read, state.write` is a closed static may-effect upper bound. Absent clause means infer, not empty or unrestricted authority. The compiler must distinguish absence from a present list. An empty list, repeated clause, duplicate entry, trailing separator, unknown or incomplete qualified name rejects in the proposed initial profile. A backend must reject unsupported effect names rather than silently discard them. Preserve independently established checked throws/raises/panics, susp/suspends and spawns markers and existing result/body delimiters. Canonical placement for return-first headers is after parameters, before begin, :: or braces. Name-first admission must preserve the existing effect-before-result and result/body grammar; no heuristic rewrite.
- Spawn expression: `spawn Worker() with schedule(...)` is a typed policy request, not a callable effect row or record update. Only the existing scheduling proposal's closed schema and host admission apply. Do not add arbitrary actor-header or spawn keys by inference. Reject unknown, repeated, malformed or conflicting keys before spawning; do not silently fall back. Neither scheduling nor effect clauses change the declared actor execution class or grant authority.
- Value expression: `original with {age: 31}` remains the distinct immutable Record/Struct update operation. Preserve its evaluation order, typing, ownership and reconstruction rules. An actor reference, actor instance or state loan is not an ordinary record to update.
- Scoped `using` and critical state loans remain separate executable constructs. Do not reinterpret a scoped using as a signature annotation. Older signature using syntax needs explicit versioned migration, not automatic replacement.

The parser must represent each context separately (no generic map of arbitrary attributes). Contextual recognition must respect nested calls, generic arguments, comments, strings, delimiters, and the exact header/body boundary. On malformed input, stop admission instead of discarding the suffix or parsing the body as a clause. Bound nesting and clause item counts using the frontend's explicit resource limits. Formatter round trips must preserve context, resolved effect/policy facts, body kind and observable evaluation order.

## Callable and actor semantics

For every admitted callable, compute resolved transitive may-effects over typed CFG/MIR and every normal, exceptional, cancellation and cleanup edge. Include constructors, destructors, deferred work when executed, callback invocation, imported and indirect calls, actor spawning and compiler-generated operations. A present explicit bound admits only a subset of that bound; absence uses inferred metadata. A caller of an explicitly bounded imported/interface callable must conservatively account for its exported upper bound. Unknown target/summary remains unknown and rejects in a strict context. Override or hot-loaded replacement must not widen the admitted effect bound. No runtime permission is minted by an effect declaration.

State is still a sealed `state {}` container. Declaring state.read or state.write does not permit direct state field access, cross-actor state access, forged loans or escaped callbacks. A read/modify/write requires both facts. A critical-read loan never permits writes; an exclusive critical-write loan still requires the corresponding effect and actual checked authority. Disallow suspension, blocking and spawning through direct or transitive calls while a protected loan is live according to existing lifetime and spawn contracts. The rule applies to serial actors and lifecycle methods too. Observe existing construction-only initialization exceptions. Actor sends account for admission effects, not the future receive body's effects. Preserve distinct throw, raise, panic, and cancellation paths and cleanup effects.

## Scheduling policy admission

Scheduling options are validated against the existing scheduling contract, declared domain, serial cap, quota and authenticated host policy before actor publication. A failed policy/admission must not publish a live actor or leak a reservation. Do not override existing concurrency or affinity decisions, accept unverified policy keys, or increase authority through metadata. Preserve the exact typed policy in AOT metadata and verify it at load and runtime admission. No implicit JIT or interpreter fallback.

## Required conformance matrix (all NOT_EXECUTED)

| ID | Scenario | Expected |
| --- | --- | --- |
| W01 | read through a valid scoped read loan, matching declared bound | accept, actual guest result |
| W02 | read/modify/write through valid exclusive loan with both effects | accept, actual guest result |
| W03 | missing clause on a resolved effectful callable | infer nonempty bound |
| W04 | state write omitted from explicit bound | effect-bound diagnostic |
| W05 | read-modify-write with only write fact | effect-bound diagnostic |
| W06 | declaration lists state.write, code writes through read loan | loan diagnostic |
| W07 | declaration lists state.read, code directly accesses sealed state | sealed-state diagnostic |
| W08 | declared state effects, callback attempts to escape a loan | lifetime diagnostic |
| W09 | transitive callback/helper may suspend or block inside critical loan | critical-effect diagnostic |
| W10 | transitive spawn upper bound inside critical loan | spawn-in-critical diagnostic |
| W11 | imported or indirect target with unavailable bound | unknown-effect diagnostic |
| W12 | overriding/hot-loaded callable widens admitted bound | reject before activation |
| W13 | destructor/defer contributes undeclared effect | effect-bound diagnostic |
| W14 | duplicate effect, incomplete dotted name, unknown effect, repeated/empty clause | grammar or effect-name diagnostic |
| W15 | with list immediately before each admitted body delimiter | preserve body AST and result |
| W16 | valid schedule request with admitted budget | guest-observed requested policy |
| W17 | malformed/unknown/duplicate policy option | reject without actor publication |
| W18 | serial actor requests physical cap greater than one | reject |
| W19 | policy request exceeds granted domain/quota | typed admission failure, no orphan |
| W20 | record update alongside callable effect header and spawn syntax | distinct ASTs, unchanged original |
| W21 | record-update operator applied to actor/state loan | reject |
| W22 | using scoped resource nested inside callable with header | distinct ASTs, cleanup preserved |
| W23 | send to actor with effectful receive | only send admission effects charged |
| W24 | listing I/O effect without an actual runtime permission | denied at resource admission |
| W25 | formatter round-trip for all admitted forms | identical checked semantics |
| W26 | malformed/oversized clauses, nested syntax and comments | bounded deterministic rejection |

Use existing diagnostic families (E_EFFECT_BOUND, E_EFFECT_UNKNOWN, E_EFFECT_CRITICAL_SUSPEND, E_SPAWN_IN_CRITICAL, E_CAPABILITY_DENIED) where appropriate; exact additional diagnostic codes require compiler/contract agreement. Each negative must prove the intended diagnostic and no executable artifact, not merely a generic parse failure. W19/W24 are runtime-denial cases and need a compiled executable, expected typed failure, and no forbidden resource/actor side effect.

## Backend acceptance

Apply to Java/GraalVM, LLVM, .NET NativeAOT, Wasm, Forge, Cranelift, Rust, JS and HDL as applicable; unsupported targets explicitly reject before lowering. No claim that all nine have an independent frontend. Record actual compiler/version/profile, input blob, exact head/tree, typed IR, emitted artifact, guest result and real executed test steps. Distinguish parser, static analysis, formatter, runtime and native guest evidence. No source-free model or zero-step workflow counts as guest parity. Do not promote this proposal until the existing syntax and conflicting older clauses have been reconciled.
