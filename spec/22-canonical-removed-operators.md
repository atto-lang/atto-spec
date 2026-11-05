# 22 — Canonical removed operators and release negatives

**Normative target (not yet independently compiler verified):** `%`, `^`,
and `^^` are removed from expression syntax. All five core compiler
families must reject each of the three authored negative `.atto` fixtures
with an **operator-specific** diagnostic and nonzero compiler exit, while
compiling and executing the positive multiplication fixture. A runtime
trap, runner admission failure, empty job, missing compiler, or host-only
token search does **not** satisfy that negative compiler gate.

See `contracts/removed-operators-v1/` and
`scripts/canonical-operators.mjs`. The latter is a limited lexical test
model, not the AttoLang lexer: it excludes template interpolation and does
not claim to parse context-sensitive grammar.

Chapter 16 contains **historical v0.6 Java** operator tables which still
include `%` and `&`. Those descriptions are observed legacy grammar, not
permission to reintroduce removed operators or C-style borrow syntax into
canonical `.atto`. The compiler and specification must be reconciled before
release. Canonical ownership remains `rt borrow`/`rt share`/`rt take`/
`rt copy`, with no pointer markers.

Release acceptance requires full source/compiler HEAD+tree identities,
compiler executable SHA-256, a stepful runner receipt, observed diagnostics
and positive guest execution from Java/GraalVM, LLVM, .NET NativeAOT, Wasm
and Cranelift/Forge as separately accounted for. No parity is claimed here.
