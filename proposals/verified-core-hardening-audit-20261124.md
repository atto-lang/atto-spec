# Verified Core hardening audit — 2026-11-24

Status: candidate follow-up to #224; no new surface syntax is admitted by this note.

## Source contract and contradictions

- Use the candidate file-local declarations in verified-core-quantities-v1.md and verified-core-protocol-declarations-v1.md: contextual `define dimension`, `define unit`, `define protocol ... as ... end`, contiguous quantity literals `5000<Millis>`, and explicit `.to_unit<Second>()`. Rust #523's `T[unit]` and `of` proposal is an alternative, not a second canonical grammar. Do not globally reserve contextual words or reinterpret existing comparisons/generics. Add lexer/parser negative controls for whitespace, generic calls, comparison operators, identifiers named unit/dimension/protocol, malformed and trailing tokens.
- Rust #523 uses a closed nine-dimension registry, u128 scales and +/-12 exponents. The #224 nominal profile uses file-local declarations, 32 dimensions, 256-bit reduced components and +/-64 exponents. Do not claim parity or silently narrow #224 until the shared corpus passes. Treat SI names as a separately resolved library; distinguish counts and information from plain scalars. Imported dimensions need stable compiler-resolved module identity, not name-only equality; this is outside the current file-local profile.
- Conversion is exact iff the value times the rational ratio is integral and fits the carrier. A fractional ratio is not inherently lossy. Include zero, negatives, i64::MIN, overflow, 1000 ms -> 1 s and 1500 ms rejection. Cross-cancel before bounded multiplication; no floating approximation or wraparound. Rust internal diagnostics need a specified mapping to shared categories.
- No implicit affine temperature conversion, currency rate conversion, unit erasure through FFI/serialization/unchecked casts, or arbitrary unit-polymorphism in this profile. Add explicit tests that unsupported features reject without publishing an executable.
- The shared serial protocol reference must stage a detached snapshot of already validated fields, never reread mutable inputs. A protocol fingerprint is schema identity, not sender authority. Ingress must independently check actor identity, generation, edge, range, normalized unit, and resource budget before execution. Malformed frames, unknown tags, stale generations and rejected handlers must not publish state or leak credits. Actor stop/restart must fence staged publication.
- Deterministic graph edges and terminal-state checks prove neither deadlock freedom nor eventual delivery. Report reachability, safety, fairness, bounded model results and liveness separately. No global proof from a single local protocol graph.

## Endemic formal methods: admission checklist

1. Quantity preservation: normalized dimension/scale on all admitted operations, integer conversion exactness and explicit arithmetic failure.
2. Refinement preservation: obligations at assignments, joins, calls, return, imports, serialization and FFI; unknown/refuted/timeout obligations fail closed in strict mode.
3. Protocol preservation: only declared edges, invariant-preserving staged values, atomic publication under unchanged incarnation, exact-once resource settlement. Separate serial reference from concurrent scheduler and guest runtime.
4. Ownership and effects: prohibit staged external effects and escaping aliases; prove cancellation and move-only payload behavior independently before extending the copy-scalar profile.
5. Proof receipts: bind exact source/dependency tree, obligation IDs, solver/checker version, assumptions, result, target and artifact digest. Independent verification and negative mutation controls required. Bounded model checking is not unbounded proof; host-only tests are not compiler-backed guests.
6. Backend gate: Java JVM/native as claimed, LLVM native, .NET NativeAOT, Rust/Wasm and remaining targets independently. A zero-step runner is not evidence. If origin quota blocks CI, use an authorized private funded carrier with exact-tree identity verification; keep origin gates intact.

## Reproducible audit anchors

- Spec #224 at 5536fcdde03ec92b5db9a979518f8865321c2059
- Shared reference #140 at 3ead2318350c116630f355456eae36972427ccab
- Java #1806 at 1ae5f62e4ca5b80cffdf474c4466a8ebd9b20234
- LLVM #899 at da799b6b2aaa2c949fe6e126fb187fa4084aff01
- .NET #241 at 4cac8883e51d0399f956c3e9373896351023ac63
- Rust #523 at 9d524bee9ec1fcd29c4b45a72e3c9e63de4c2b32

These are inspected source revisions, not execution receipts. Current-head guest tests and independent proof-checking remain required.
