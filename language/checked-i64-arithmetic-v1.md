# Checked signed-i64 arithmetic and legacy source migration — v1

**Status: proposed portable AttoLang contract; cross-backend compiler/guest certification is NOT EXECUTED by this document.** This resolves a known behavioral contradiction between the historical JVM evaluator's signed-`long` wraparound and LLVM's checked signed-i64 source lowering. The normative `const` overflow requirement already appears in [compile-time constants v1](compile-time-constants-v1.md).

## Numeric model

For the portable scalar `int` profile, represent values in the closed range `[-9223372036854775808, 9223372036854775807]`. On canonical AttoLang source:

- `a + b`, `a - b`, `a * b` and unary `-a` operate on mathematical integers first, then require an in-range signed-64-bit result. No wrap, saturation, floating conversion, undefined behavior, or optimization-induced omission of the overflow check is permitted.
- Check **each** intermediate arithmetic operation, including inside a larger expression that would return to range. For example, `(INT64_MAX + 1) - 1` must fail, not yield `INT64_MAX`.
- Evaluate effectful operands left-to-right exactly once, subject to the existing type/effect rules. A backend cannot reorder or discard an observable evaluation to avoid a checked fault. Neither an actor scheduler, JIT nor AOT optimizer may convert an overflow into an ordinary value.
- Constant expressions that overflow reject at compile time with `E_CONST_OVERFLOW`, without producing a guest artifact. This is separate from runtime arithmetic overflow after input-dependent values are read.
- Runtime checked overflow is a **terminal arithmetic-fault category** until a portable fault/error/CONTROL wire ABI is ratified. It must never be silently converted into an ordinary guest `throw`, `Result.Err`, `Option.None`, or catchable `trap` success. [Trap-to-Result v1](trap-result-v1.md) catches ordinary source `throw` only.
- `Integer.rem(a,b)` is signed truncating remainder; `Integer.mod(a,b)` is Euclidean modulus. Both reject a zero divisor. `Integer.rem(INT64_MIN, -1)` is zero, not an overflow. Full signed division and `pow` overload policy, integer widths other than `int`, floating point and high-precision math require separate contracts.
- Bitwise XOR, AND/OR/NOT and shifts perform exact bit-pattern operations and are **not** arithmetic overflow events. Operator spelling remains governed by the separately evolving caret/`^^` and directional-I/O rules.

## Source admission and compatibility

**Target canonical edition:** a named `.atto` code unit is checked by default. A legacy `.ores` code unit may remain wrapping *only* through an explicit versioned compatibility boundary; existing unmarked `.ores` evaluator behavior is an archival migration exception, not portable AttoLang semantics. The exact first-line `// oreslang:checked-i64-v1` directive currently opts a historical Java `.ores` unit into the checked profile, and unknown/duplicated/displaced directives are rejected. That temporary directive is a migration selector, not a general ambient permission or license to mix numeric models.

A compiler must derive the source edition/profile from a trusted code-unit or explicit package identity, never from a mutable guest argument or imported module text. **If a source unit is anonymous or its edition cannot be proven, do not silently promise canonical checked semantics from a legacy wrapping executor:** require an explicit checked profile or fail closed until a versioned edition mechanism is available.

Transitive imports **must preserve one checked numeric model** across the linked call graph, including function pointers, overloads, inlining, prechecked AST leases and generated native/AOT artifacts. Until the compiler verifies every imported code unit and its compiled interface, a checked caller must reject unsupported imports *before execution*. A filename suffix in an unchecked dependency is not proof of semantic compatibility; cache/hot-load entries must not reuse artifacts compiled under another arithmetic model.

## Required executable conformance

| Case | Input/result | Portable outcome |
| --- | --- | --- |
| In-range add | `40 + 2` | `42` |
| Max boundary | `INT64_MAX - 1` | `9223372036854775806` |
| Min boundary | `INT64_MIN + 1` | `-9223372036854775807` |
| Add overflow | `INT64_MAX + 1` | runtime overflow |
| Subtract overflow | `INT64_MIN - 1` | runtime overflow |
| Multiply overflow | `3037000500 * 3037000500` | runtime overflow |
| Negation overflow | `-INT64_MIN` (dynamic operand) | runtime overflow |
| Intermediate overflow | `(INT64_MAX + 1) - 1` (dynamic) | runtime overflow |
| Remainder boundary | `Integer.rem(INT64_MIN,-1)` | `0` |
| Remainder zero divisor | `Integer.rem(1,0)` | terminal zero-divisor |
| Const overflow | `const int n = INT64_MAX + 1` | `E_CONST_OVERFLOW`, no artifact |
| Mixed unit import | checked caller → unchecked callee | no execution / no emitted artifact until profile proof |
| Compatibility | unmarked archival `.ores` add overflow | versioned legacy wrapping only |
| Spoofed selector | wrong-version, duplicate or displaced directive | fail closed |

`INT64_MIN` and `INT64_MAX` in this table denote *test-harness constants*; they are not a promise that these names exist as source-language symbols. Test cases exercising runtime rather than const overflow must use function parameters or another runtime input to prevent legitimate constant-fold-time diagnostics.

Maintain canonical shared source fixtures in `atto-platform-conformance`, track exact-source compiler and fixture blob SHA, target architecture/toolchain and observed diagnostics/outcomes. A selector unit test, source-only manifest, LLVM IR inspection, host C helper, or Actions job with zero executed steps is **not** a guest parity PASS. Required targets: Java/GraalVM JVM and Native Image, LLVM O0/O2 native AOT, and subsequent Wasm/JS/.NET/Forge targets where the same `int` profile is advertised. Record unsupported as `UNSUPPORTED` rather than pass.

## Implementation/PR relationships

- [Java #66](https://github.com/atto-lang/atto-source.java/pull/66): a draft checked-by-default `.atto` evaluator and explicit legacy profile. Its unmarked `Context.eval("ores", text)`/anonymous source, whole-program arithmetic model and full linked-AOT boundary need independent review. Local selector compilation is not a GraalVM guest run.
- [LLVM source](https://github.com/atto-lang/atto-source.llvm): native signed-i64 checked-lowering baseline; full errors, imports, actor fault propagation, and cross-backend parity remain unverified.
- [Legacy Java arithmetic characterization](https://github.com/ores-truffle-oreslang/oreslang-source.java/blob/main/docs/GRAAL_I64_RUNTIME_CHARACTERIZATION.md): documents wrapping `long` behavior as a historical observation, not the canonical AttoLang rule.
- [Compile-time constants](compile-time-constants-v1.md): already requires checked const arithmetic; this proposal aligns runtime integer arithmetic with that design.

**Review decision needed before adoption:** canonical anonymous/eval source edition, the portable runtime overflow fault ID and actor CONTROL mapping, and whether archival wrapping requires an explicit per-package edition rather than inference from `.ores`. No automatic rewrite or silent mixed-profile linkage is authorized by this proposed rule.
