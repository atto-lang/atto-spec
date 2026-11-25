# Enum pattern alias v1 — audit evidence (2026-11-14 UTC)

**Change:** draft PR #60, `feat/enum-pattern-alias-v1-20261114`. **Maturity:** source-only TARGET, not backend feature parity.

## Problems found and hardening

1. The original positive fixtures called undefined worker methods. Replaced these with self-contained local projections, so future compiler acceptance will not be masked by missing-method errors.
2. `as r` was described as a borrow, but field shorthand binding and non-Copy `Bytes` ownership were underspecified. Chapter 27 now states that Copy fields may be read by value and non-Copy fields are immutable projections, never implicit moves/clones.
3. Added nominal enum qualification and wrong-enum rejection cases, duplicate field/alias cases, nonexhaustive patterns, borrow-after-arm, move-with-live-alias, and statement-versus-expression matching fixtures. Fail-closed diagnostics must be checked for the intended reason.
4. Guards must not publish tentative bindings on mismatch; aliases and projections remain scoped to the selected arm and receiver turn.
5. Sealed supervisor CONTROL metadata remains distinct from user-forgeable DATA enums, and same-process local messages do not implicitly serialize.

## Executed source-free tests — PASS

**Machine:** local Node.js v22.16.0. **Command:**
```sh
node --test tests/enum-pattern-alias-contract.test.mjs tests/enum-pattern-alias-model.test.mjs
```

**Result:** 8 tests passed, 0 failed, 0 skipped. This is a source-level model and fixture-shape run, **not** a Java/LLVM/Atto compiler execution. The following tests were checked byte-for-byte using independently calculated Git blob SHA-1 (`SHA1("blob " + size + NUL + bytes)`) against the PR's GitHub blob SHAs:

| File | Git blob SHA |
| --- | --- |
| `tests/enum-pattern-alias-contract.test.mjs` | `eeac31e7796c7315d4319e5872a29ca13cf9bf65` |
| `tests/enum-pattern-alias-model.test.mjs` | `800a2ab186019a054c218aedb354364c9d205769` |
| `tests/fixtures/enum-pattern-alias-v1/accept-worker-receive.atto` | `ea8f8d0d9deb70134471bfed61d1af7db30c4e5e` |
| `tests/fixtures/enum-pattern-alias-v1/accept-short-and-qualified.atto` | `ec63643830feaf32b7ea13e3a46af53eda2e0b7a` |
| `tests/fixtures/enum-pattern-alias-v1/reject-alias-collision.atto` | `a0746d1518c9a9b5631d79888839271122c854f5` |
| `tests/fixtures/enum-pattern-alias-v1/reject-unknown-variant.atto` | `a70619861b11299a240238e708bab63fd2752753` |
| `tests/fixtures/enum-pattern-alias-v1/reject-field-alias-v1.atto` | `505acda7b66652df620314474d5c88df65484932` |
| `tests/fixtures/enum-pattern-alias-v1/reject-duplicate-payload-binding.atto` | `8e55cc720d41af4f8991a15405f77f7a38793e04` |
| `tests/fixtures/enum-pattern-alias-v1/reject-missing-variant-field.atto` | `a3cbd57549f2d204a0d975d84981079a2f093489` |
| `tests/fixtures/enum-pattern-alias-v1/reject-cross-enum-variant.atto` | `e889f4e94cda36dad36f35a5decaf74fe3dc1fbd` |
| `tests/fixtures/enum-pattern-alias-v1/reject-alias-escape.atto` | `ab958ee5a74905893591180b4145a57bf7462917` |

Only these specific fixtures were part of the executed local tests. Other authored fixtures are **NOT EXECUTED**, not falsely counted as passed.

## Source GitHub Actions — NOT EXECUTED

The isolated read-only CI workflow `.github/workflows/enum-pattern-alias-contract.yml` was authored. On this PR branch, [run 43640412084](https://github.com/ores-truffle-oreslang/attolang-language-spec.md/actions/runs/43640412084) completed as `failure` with job `source-free-contract` reporting **no steps**. This is a runner/allocation-side failure, not evidence of test failure. The available GitHub metadata does not prove the precise billing cause. Rerunning without capacity or authorization would not improve evidence.

## Private-source carrier gate

The source repository is private. The private-source export policy in `oreslang-platform-conformance/docs/PROTECTED_SOURCE_EXPORT_ADMISSION.md` requires independently reviewed, exact source-tree/destination authorization and additional security conditions for Oreslang compiler snapshots. It explicitly says that available Actions minutes and a token-free private mirror do **not** by themselves authorize transfer. **No cross-organization source objects were exported.** A funded runner is not a substitute for that gate.

## Required before merging as an implemented language feature

- Compiler-owned lexer/parser/AST handling of `define enum`, `on Variant`, named fields and trailing `as r`.
- Nominal variant resolver, exhaustiveness and guard rollback, duplicate binding checks, and confined case-view type inference.
- Dataflow borrow checker proving no move/escape of aliased message or payload into mailbox, heap, tasks, and suspension; no hidden allocation/serialization.
- Formatter round-trip, actual .atto positive/negative compiler tests, guest execution, and LLVM/native AOT with sanitized ownership stress.
- Independently executable and SHA-pinned conformance on Java/Graal, LLVM, WASM, Forge and .NET. Each backend must report separately.

**Verdict:** spec and source-free reference model hardened; CI runner and all guest compiler/AOT gates are still blocked or not implemented/verified. Keep PR #60 **draft**.
