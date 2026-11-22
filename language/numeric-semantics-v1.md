# Numerical semantics v1 — correctness before vectorization

**Status: TARGET / NOT GUEST-EXECUTED (2026-11-21).** This is a proposed language contract, not evidence of compilation, native AOT or cross-backend parity. Its independent host-reference goldens are in [numeric-semantics-v1.json](../contracts/numeric-semantics-v1.json). Preserve the separate checked-i64 corpus and all historical receipts; never relabel host-only runs as guest tests.

## Existing discrepancies and overlap

The [primitive chapter](../spec/17-primitives-and-core-types.md) observes Java accepting out-of-range sized integers and wrapping bigint, with LLVM rejecting several types; integer division and overflow differ. Java implementation PRs [#1329](https://github.com/atto-lang/atto-source.java/pull/1329), [#748](https://github.com/atto-lang/atto-source.java/pull/748), and [#742](https://github.com/atto-lang/atto-source.java/pull/742) already contain overlapping integer, decimal and matrix changes. Reconcile them rather than implementing a parallel numeric system. In particular, the default DECIMAL128/HALF_EVEN division in #748 conflicts with #1329's exact-until-context division: neither behavior is declared guest-portable by this proposal without resolving that difference.

## Fixed-width integers and bigint

* Signed i8/i16/i32/i64 are two's-complement value ranges of exactly 8/16/32/64 bits. u8/u16/u32/u64 range from zero through 2^N-1. **int aliases i64; uint aliases u64**, never host-sized types. Native/FFI layout is a separate explicitly checked ABI choice.
* A typed literal outside its range must fail at compile time. Arithmetic on +, -, *, unary negative and division must check mathematical results for the declared width; wraparound, UB and implicit promotions are forbidden. Checked constant-folding obeys the same contract. Dynamic overflow follows the guest failure policy of chapters 07/17; the final Error subclass/effect classification needs cross-compiler agreement. **Blocking contract conflict:** chapter 17 currently calls checked overflow an uncatchable actor panic, while the staged Java/Graal numeric branch implements an ordinary catchable `ArithmeticOverflowError <: Error` (proposed stable code 65537). These are observably different. Do not mark either behavior cross-backend conformant, promote a backend to supported, or merge an incompatible implementation until the language owner resolves throw-vs-panic semantics and fixtures test both `try/catch` and `trap` plus supervisor escalation.
* **int / int truncates toward zero**, with integer output. Remainder carries the dividend's sign; MIN / -1 overflows and division by zero is distinct. Explicit conversions are required for floating-point division or potentially lossy mixed types.
* **bigint is a true arbitrary-precision signed integer**, or an unsupported compile-time feature. It cannot truncate to i64, decimal or binary float. Arithmetic is mathematically exact subject to explicit per-operation/actor memory and work budgets; budget failure must be typed, deterministic, failure-atomic and reported rather than silently changing precision. An ahead-of-time compiled library is valid; an interpreter or runtime-generated numeric helper is not.

## Exact decimal and fixed point

* decimal is modeled as a finite base-ten coefficient plus signed scale, with value coefficient × 10^(-scale). Parse from source text without passing through binary float. Exact addition, subtraction, multiplication, comparison and terminating division preserve mathematical value. Normalize textual equality across trailing zeros and reject silent mixed decimal/binary-float arithmetic.
* Division with an infinite decimal expansion **requires a caller-specified context** (precision and rounding policy); no global host MathContext or implicit DECIMAL128 fallback. Exact division without such context fails with decimal_context_required. Explicit quantization supports half_even as a first mode, with symmetrical negative ties and an observable inexact flag where applicable. Scale/precision/exponent and operation-work limits must be versioned and enforced.
* Decimal literal syntax such as 0.1d and a Decimal.parse API remain target candidates, not a parser support claim.
* Proposed Fixed<Rep,Scale> is statically monomorphized: value = integral Rep × 10^(-Scale). Same-scale add/subtract check Rep overflow; multiplication widens its accumulator to bigint and adds scales; narrowing and rescaling are explicit checked operations. Fixed<i64,2> can run with static storage in an embedded or real-time profile even if arbitrary bigint is unavailable.

## Binary floating point and deterministic kernels

* f32/f64 are distinct IEEE-754 types. Proposed float-to-f64 alias needs compatibility review. NaN unordered comparisons, infinities, signed zero, conversion rounding and constant folding require bit-level tests. No implicit conversion from bigint or exact decimal to float. Strict mode disallows reassociation or unapproved fused multiply-add differences; transcendentals need correctly rounded algorithms or explicit verified error bounds.
* Arrays/vectors/slices require checked shape, index and byte extent; scalar arithmetic semantics apply to every lane. The first failing **logical index** determines an integer overflow diagnostic, independent of AoS/SoA/AoSoA/SoAoS physical layout and SIMD width. Shape preflight, ownership, alias checks, cancellation and quota checks precede publication; no partial user-visible output on failure.
* Strict dot/sum/fold and row-major matrix multiplication use increasing logical indices and checked product-then-accumulation, preserving deterministic scalar results. Matrix shapes (including rectangular rows) are validated before any computation or output publication; the failing location is reported as (row, column, inner) in logical traversal order, independently of SIMD width or physical layout. Hardware SIMD/GPU and reassociation may be used only if proven observationally equivalent or separately requested through a documented fast/approximate mode. Fast-mode error bounds and reproducibility must be explicit rather than hidden by optimizations.

## Dimensional analysis

Proposed Quantity<Dimension,Rep> stores values with normalized compile-time rational unit exponent vectors. The v1 reference oracle uses exact decimal coefficients for quantity values: 3 meters / 2 seconds produces 1.5 meters/second, never truncated 1; 1/3 without an explicit decimal rounding context fails with decimal_context_required; division by zero has the normal typed failure. Other scalar representations must explicitly declare their division result type and rounding policy. Addition requires identical dimensions; multiplication/division combine dimensions; narrowing unit conversions require an explicit rounding context. Affine Point<Dimension,Rep> values distinguish absolute points from deltas: point minus point is a delta, point plus delta is a point, and point plus point is rejected. Type-level dimensions monomorphize/erase to static layouts without runtime reflection or dynamic unit dispatch.

## Full guest AOT and hard-real-time admission

Every admitted numerical API must be compilable into a **complete guest AOT artifact**: known specialization, statically linked numeric implementation, checked foreign ownership/effects if any, no runtime compilation, interpreter fallback or dynamic type metadata. Hard real-time lanes reject uncontrolled bignum precision, heap allocation or unbounded work unless proven bounded and preallocated. Capability and tenant quotas still apply.

## Evidence required before calling any backend supported

1. Parser/formatter and compile-time positive/negative diagnostics for each nominal type, range and operation; reject unsupported feature before executable IR or artifact creation.
2. Same-byte positive guest source and error fixtures with exact source commit/tree, compiler commit, fixture blob, target, AOT mode, run/job/runner IDs, meaningful executed steps and output/diagnostic.
3. Independent bigint/decimal reference goldens, scalar-vs-vector metamorphic checks, alias/shape/failure-atomicity, precision and tie-rounding edges, resource quota tests, and actor/FFI ownership tests.
4. Performance/SIMD measurements only **after** exact strict-mode parity; track explicitly unsupported Cranelift/Rust-Wasm subsets rather than reporting false passes.

The checked-in Node reference test uses JavaScript BigInt for exact mathematical oracle calculations. It does **not** compile AttoLang or certify execution, native image, portability, or permission for private-source mirroring.
