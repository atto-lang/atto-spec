# Extensible declarations v1 — contextual `define keyword`, full AOT

**Status: DRAFT / TARGET / NOT_EXECUTED.** Proposed language design, not implemented syntax or a claim of backend support. Full ahead-of-time compilation is mandatory for every admitted declaration kind. No runtime interpreter or macro fallback.

## Motivation and scope

Libraries should be able to name recurring declaration patterns, enforce contracts and eventually derive boilerplate without introducing new global reserved words or arbitrary grammar. A custom kind is a compile-time declaration descriptor, not a runtime value, metaclass, new actor primitive or separate object model.

```atto
define keyword entity as class
    requires Entity;
end

define entity Customer as
end
```

Assume Entity is an existing visible interface whose requirements Customer satisfies. The semantic equivalent is an ordinary `define class Customer implements Entity as ... end`, with the original source identity and diagnostic spans. A custom kind does not grant new construction rights or imply database persistence.

```atto
define keyword service as class
    requires Service;
end

define keyword durable_object as actor
    requires DurableObject;
end
```

These require ordinary visible contracts of the appropriate base kind. A DurableObject contract alone does not implement storage, replay, routing or durability; those require explicit library implementations and verified runtime support. Actor state and entrypoints use the normal actor grammar, including existing private external init/receive restrictions. No special privilege accrues to generated code.

## 1. Initial grammar and staging

Illustrative EBNF; integrate into the existing declaration, visibility and import productions rather than fork them.

```ebnf
keyword_decl = "define", [ visibility ], "keyword", identifier,
               "as", base_kind, { requirement }, "end" ;
base_kind = "class" | "actor" ;
requirement = "requires", qualified_contract_name, ";" ;
custom_decl = "define", [ visibility ], custom_kind_name,
              identifier, base_kind_header_and_body ;
custom_kind_name = qualified_identifier ;
```

Use the canonical placement of visibility after define and the existing visibility vocabulary. The first implementation admits class and actor only; if a backend does not yet support the base kind it must reject the custom kind too. Later review may add supervisor, module, struct, and refined type forms; a refined type uses its normal equals/where grammar rather than requiring an invented as/end body. No new member grammar in v1. Parse custom bodies using the base grammar, including all ordinary modifiers, generic restrictions, balanced nesting and end delimiters. `define keyword entity as class end` is valid as a pure declaration alias; `define entity;` is not sufficient to register a kind. Inline requirements such as `requires mtd ...` and state predicates are deferred; use existing interface/trait contract semantics, never invent a second method matching system.

`keyword` is contextual only immediately in the declaration/import-kind position; custom names remain ordinary identifiers in expressions and other grammar positions. No user lexer plugin, operator registration, arbitrary token rewriting or syntax extension inside a body. Reserve all existing built-in declaration kinds and modifiers (including pending canonical additions at integration); reject shadowing even by aliases. Unresolved custom kinds are errors, never silently treated as classes. Formatter, highlighter and IDE use resolved kind information; formatter must preserve unknown forms or report unsupported syntax rather than rewriting them.

## 2. Static resolution

A descriptor can be private or explicitly public using `define pub keyword`. Proposed selective import extension:

```atto
import keyword entity from "std.database";
define entity Customer as
end
```

The path is illustrative, not a promise this library exists. Follow the canonical static import resolver, visibility, dependency lock, namespace and library-layer rules. No implicit import by a runtime value, wildcard pollution or runtime selection. Qualified use of a public descriptor through an explicitly imported namespace is permitted only through the same canonical export table. Ordinary type/value bindings are not declaration descriptors; a same-spelling local value never changes the kind resolution. Duplicate/conflicting kind imports are errors; explicit qualification resolves ambiguity. Reject attempts to use descriptor symbols as runtime values or instantiate them.

An initial header pass collects descriptor names, visibility and contract references in the existing compilation-unit/module graph; resolve identities and base kinds before parsing custom declaration bodies. Use bounded, delimiter-aware token ranges, never source-text substitution. Resolve forward references independent of declaration order. Separate type graph recursion already permitted by ordinary language semantics from forbidden descriptor/expansion cycles. No executable initialization runs in header collection. A dependency can provide a versioned, verified descriptor containing canonical package/module/export identity, base kind, contract IDs, semantic version and source provenance. Revalidate imported metadata; spelling never confers trusted core or std identity. Dependency hashes and compiler schema versions participate in build/cache keys.

General descriptor chaining is deliberately excluded in v1. Later `define alias model = entity;` (or the independently reviewed alias spelling) may bind a descriptor, only if the canonical alias contract supports that symbol category. Reject all alias cycles including across modules (DFS/SCC with a deterministic cycle diagnostic), unknown aliases and category mismatches. Do not use define const to store a descriptor.

## 3. Elaboration and contracts

1. Parse/import/resolve descriptors and select base body grammar. Produce a typed declaration syntax node with resolved descriptor identity and source span.
2. Elaborate to ordinary base declaration AST before executable semantic IR. Merge required contracts with explicit implemented contracts by resolved identity; reject conflicts and incompatible kind/interface/effect obligations. Do not remove user constraints, silently add required method bodies or change visibility. Preserve user-declared type identity; two kinds may produce two distinct nominal types as ordinary declarations would.
3. Run ordinary name resolution, type, visibility, construction, generic, effects, ownership/borrowing, actor isolation, state and lifecycle validation on the full resulting program. Enforce all required contracts with existing conformance rules, including parameter/result types, mutability, effects and visibility. Missing or incompatible members are compile-time errors.
4. Emit only ordinary verified IR; retain descriptor origin as optional static diagnostic/debug metadata, not a runtime object. All normal AOT reachability, closed generic instantiation and linking rules apply.

For actors, no descriptor or macro may expose private lifecycle entrypoints, bypass mailbox or generation fences, fabricate state guards or share mutable memory illegally. A generated method is subject to the same checks as an ordinary method with identical authority. An effect/ownership violation is not repaired by a descriptor.

## 4. Optional future macro integration — not required for phase 1

Reuse the existing `define macro` and contextual `expand!` design (atto-spec #216), not a competing macro language. Future descriptors may reference a statically resolved declaration transformation with typed syntax input/output, returning ordinary declaration AST; exact clause spelling deferred to a follow-up. No implicit arbitrary executable hooks in v1. Derivation may generate constructors, codecs, equality or RPC bindings only where ordinary language rules admit them. No implicit serialization, operator overloading or runtime reflection.

Macro evaluation happens solely inside the build-time compiler, including any compiler running on a host different from the deployment target. Use hygienic symbols, fresh generated binding IDs, explicit caller-context capture if supported by the reviewed macro contract, provenance backtraces and deterministic ordering. Fixed/versioned instruction, expansion-depth, AST-node and memory budgets, cycle detection and cancellation must fail closed before codegen. No ambient filesystem, network, process, environment, wall-clock, entropy, host FFI, secrets or dynamic libraries in macro evaluation. Inputs are declared, immutable, pinned compiler inputs; target-dependent behavior must be explicitly declared and included in the reproducibility key. Do not execute arbitrary native package build scripts as part of descriptor expansion. Reject forged AST authority, hidden trusted imports, unauthorized symbol capture, invented IR nodes and malformed output. Revalidate the entire expanded AST after expansion. Generated code cannot gain private access merely because its macro came from a privileged package.

## 5. Mandatory full-AOT invariant

For every admitted target, the deployment executable or precompiled module must operate without an AttoLang source compiler, macro evaluator, parser, dynamic bytecode emitter, runtime generic specialization, runtime reflection-based code discovery, JIT, eval or dynamic code loading required for this feature. A host compiler's implementation technology is not a guest runtime dependency. Ordinary statically emitted metadata, vtables and checked indirect calls remain legal under normal AOT rules. Optional JIT features elsewhere cannot be a prerequisite, even for tracing, actors or macro-generated code.

Elaboration must terminate with no unresolved custom-kind or expansion node in executable IR; linker/backend must reject any residual node. Cross-compilation must not attempt to execute target code to elaborate a declaration. Artifact compatibility and ABI identity match the manually elaborated source for the same ordinary declaration. Require deterministic semantic IR and generated symbol ordering for identical locked inputs (normalize documented debug/build-path metadata; do not claim cross-toolchain binaries are bit-identical).

Target matrix (each row currently NOT_EXECUTED):

| Backend/profile | Required artifact and execution |
|---|---|
| Java/GraalVM | Native Image executable, standalone run without JVM/JIT dependency |
| LLVM | linked native executable at O0 and O2 |
| .NET | NativeAOT publish and standalone native run, no dynamic-code fallback; applicable trim/AOT warnings fail |
| Wasm | precompiled Wasm module, test in a verified no-runtime-compilation AOT engine profile for strict full-native-AOT claim |
| Rust | native ahead-of-time executable from actual Atto frontend/lowering |
| Forge/Cranelift | emitted and linked native object/executable, no JIT path |

Browser Wasm source-to-Wasm precompilation is a separate profile; browser engine JIT behavior is outside Atto compiler control and must not be advertised as strict no-runtime-compilation native AOT. Unsupported target features get an explicit diagnostic before emitting an executable. No backend may silently skip checks or fall back to interpreting custom declarations.

## 6. Diagnostics and acceptance vectors

Stable diagnostic categories (names below proposed, map to existing catalog on implementation):
- KIND_UNKNOWN / KIND_DUPLICATE / KIND_RESERVED / KIND_NOT_VISIBLE
- KIND_BASE_UNSUPPORTED / KIND_CONTRACT_MISSING / KIND_CONTRACT_MISMATCH
- KIND_ALIAS_CYCLE / KIND_CATEGORY_MISMATCH / KIND_NOT_RUNTIME_VALUE
- EXPANSION_CYCLE / EXPANSION_BUDGET / EXPANSION_AUTHORITY / AOT_RESIDUAL_NODE

Each vector needs a minimal .atto fixture (with real interface/actor declarations according to current canonical grammar), expected status and diagnostic category; later macro/alias vectors must be gated until that extension is implemented.

| ID | Positive or negative source scenario | Expected |
|---|---|---|
| KD01 | empty class descriptor, ordinary class-shaped body | compile/link/run, same result as handwritten class |
| KD02 | required public interface, matching method returning 42 | native guest returns 42 |
| KD03 | descriptor before or after use, including cross-file public import | identical semantic IR |
| KD04 | ordinary variable named entity outside define | ordinary variable semantics |
| KD05 | actor descriptor, private lifecycle entrypoints, guarded state and real mailbox delivery | normal isolated actor guest, same result as handwritten actor |
| KD06 | required method missing, wrong return/effect/visibility | reject each variant |
| KD07 | unknown, private, ambiguous or duplicate descriptor | reject each variant |
| KD08 | descriptor collides with actor/class/workflow or another built-in | reject |
| KD09 | forbidden direct/self receive/init call, forged state guard, mutable actor alias | reject each variant |
| KD10 | wrong body grammar, invalid base kind, descriptor as runtime value | reject each variant |
| KD11 | nested declarations/strings/comments containing end; formatter roundtrip | preserve AST/identity |
| KD12 | package masquerades as trusted std; malformed descriptor metadata | no authority escalation; reject forged metadata |
| KD13 | later alias cycle A→B→A including cross-module and self-cycle | reject with stable cycle diagnostic |
| KD14 | later hygienic macro generates colliding identifier or unauthorized private call | hygienic binding or reject unauthorized call |
| KD15 | later macro attempts clock/network/FFI or exceeds budget/recurses | reject deterministically |
| KD16 | compiler IR injection of residual descriptor/expansion node | verifier rejects; no artifact published |
| KD17 | repeat clean build with locked inputs and compare normalized IR | deterministic |
| KD18 | cross-target AOT link/run with runtime compiler and macro implementation unavailable | successful guest, artifact/dependency inspection |
| KD19 | backend lacks base semantics or required expansion capability | explicit unsupported diagnostic, no runtime fallback |
| KD20 | malformed build with stale successful artifact present | failure, no stale artifact presented as current output |

For each supported backend execute positive and negative compiler cases, run actual generated guests, compare to handwritten baseline, inspect emitted IR/link dependencies/reachability for no runtime compiler or expansion dependency and capture toolchain version, commands, exit statuses, diagnostic output, artifact SHA, exact source head and root Git tree. Host-only schema/parser checks are not guest evidence. Zero-step runner jobs are NOT_EXECUTED. If alternate-org CI is necessary, follow authorized token-free exact-tree mirroring with matching root tree and source/destination policy; no unauthorized export. Record PASSED/FAILED/UNSUPPORTED/NOT_EXECUTED distinctly. No feature-ready or parity claim until required exact-head gates and independent review pass.

## 7. Related work and rollout

- atto-spec #216: complementary existing AOT macro invocation contract. Reuse its typed AST/hygiene/erasure approach; no new invocation spelling.
- atto-spec #227: import resolver proposal; add descriptor selector only through reviewed shared resolver grammar. Alias spelling remains dependent on the current alias proposal, not namespace-as-const semantics.
- atto-spec #201: type-only class/trait/alias semantics; descriptor is likewise compile-time-only, not a type or runtime value.
- atto-spec #55 and #56: existing full-AOT release constraints, retained.
- atto-source.java #1387: existing built-in activity/workflow have distinct durable semantics/IR; **do not** replace with generic class/supervisor lowering. Reserve built-in kinds. Any migration to a library keyword requires separate equivalence proof.
- Legacy spec macro search surfaced telemetry and lifetime/effects proposals; complementary, no equivalent descriptor implementation identified in the inspected results. This was a targeted overlap scan, not exhaustive implementation review.

Implementation order: shared grammar/resolver and class descriptor; actor descriptor with isolation checks; conformance fixtures and backend-native gates; optional alias and typed hygienic macro extension under separate review. Keep this proposal draft until syntax reconciliation, material compiler-backed evidence and independent review; no runtime support asserted by this Markdown change.
