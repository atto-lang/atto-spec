# Standard measurement and mathematical refinements — staged contract

Status: candidate extension to [quantities v1](verified-core-quantities-v1.md) and [refinements v1](verified-core-refinements-v1.md). The existing bounded profile remains authoritative for admitted source. This document defines staged acceptance targets, not implemented syntax or guest evidence. Reference prelude: atto-common-source#161; adversarial catalog checks: atto-common-source#162.

## Separation and placement

- Carrier, value predicate, dimension and unit are independent. Sign is a predicate, never a unit or dimension.
- Standard definitions belong to the pure allocation-free core/prelude. Backend-owned implementations must preserve semantics; do not require identical production code or implicit imports in the file-local profile.
- Keep existing contiguous integer quantity suffix and exact literal conversion; preserve explicit checked casts and the distinct unit ascription proposal in #242. Generic refinements use angle brackets when admitted. No new reserved unit-symbol keywords, whitespace-suffix grammar, or implicit numeric promotion is introduced by this document.
- File-local declarations must not impersonate imported nominal dimensions or bypass refined signatures. Resolve aliases deterministically, diagnose collisions, and preserve case-sensitive SI symbols. Prelude registration, public import/export and stable ABI identity require independent implementation and tests.

## Linear catalog

Provide the seven base dimensions Length, Mass, Time, ElectricCurrent, Temperature, AmountOfSubstance, LuminousIntensity and base units Meter (m), Kilogram (kg), Second (s), Ampere (A), Kelvin (K), Mole (mol), Candela (cd). Information and count dimensions are separate extensions, not SI base dimensions. Kelvin in the existing linear profile represents temperature intervals; absolute temperatures require a separately specified point type.

The complete catalog target includes the 22 named coherent derived units: rad, sr, Hz, N, Pa, J, W, C, V, F, Ω, S, Wb, T, H, °C, lm, lx, Bq, Gy, Sv, kat. Celsius is affine for absolute points, not an ordinary linear scale declaration. Support the 24 SI decimal prefixes Q R Y Z E P T G M k h da d c m µ n p f a z y r q (the corresponding powers 30,27,24,21,18,15,12,9,6,3,2,1,-1,-2,-3,-6,-9,-12,-15,-18,-21,-24,-27,-30). Prefix mass through gram, not kilogram; no stacked prefixes. B and bit are distinct; kB=1000 B, KiB=1024 B; 1 B=8 bit. Do not mistake decimal and binary prefixes for interchangeable names.

Do not inject the entire catalog as user file-local declarations: the existing 128 declaration limit remains. Resolve the prelude with a separately bounded, checked registry. Large SI scales require checked exact rational representation even when individual literal factors are bounded signed i64. Reject oversized normalized exponents or scales; no floating-point substitution for exact linear scales.

## Arithmetic and conversion

Preserve the v1 same-dimension, same-scale rule for add/subtract and assignment, unless a later approved promotion rule explicitly changes it. Conversion is exact by default: first reduce and compute with sufficient intermediate width, then check integrality and destination carrier bounds. No truncation, overflow, or unit erasure. Products and quotients normalize dimension exponents and scale; an ordinary scalar return requires both cancellation and scale one. Preserve evaluation and trap ordering, including signed minimum divided by -1 and division by zero. A normal-result interval is not a proof of total execution safety.

## Refinement targets

Positive<T>: x>0; Negative<T>: x<0; NonNegative<T>: x>=0; NonPositive<T>: x<=0; Zero<T>: x=0. Range<T,Min,Max> is inclusive, rejects inverted/out-of-carrier bounds. NonZero<T> is disjoint over signed integers and must not be represented as a single interval that admits zero. Even/Odd apply to integer carriers. Finite rejects infinities and NaN; NonNaN admits infinities. Proposed floating-point admission: sign predicates exclude NaN, signed zeros fail strict sign and NonZero, infinities can satisfy a sign unless Finite is also required. Confirm NonZero/NaN behavior explicitly before generic float admission. Probability uses a closed [0,1] bound. No implicit refinement for unchecked foreign/deserialized input.

Refinement propagation is sound only for checked normal outcomes. Positive integer division can yield zero; floating multiplication can underflow to zero; floating infinity arithmetic can yield NaN; wrapping arithmetic can change sign. Strict proofs cannot infer total safety from clipped normal-outcome intervals. Preserve nominal quantity distinctions where dimensions coincide (energy/torque, Hz/Bq, Gy/Sv); do not conflate angle and plain ratio by default. Absolute temperature coordinate predicates are unit-dependent; temperature differences are linear. Require explicit exchange rates for nominal currencies.

## Acceptance matrix (expected observations, not execution)

| Case | Expected |
| --- | --- |
| exact 4200 cm to m | 42 m |
| 1 cm to integer m | E_UNIT_INEXACT |
| 10 m plus 5 cm without conversion | E_UNIT_SCALE |
| 1 m plus 1 s | E_UNIT_DIMENSION |
| 1 s divided by 1 ms returned as int | E_UNIT_ERASURE |
| 1 KiB to B, 1 kB to B | 1024, 1000 |
| max/min signed i64 B to bit | E_UNIT_RANGE |
| negative or zero scale; unknown or cyclic reference | static rejection |
| 1 m divided by zero m | E_I64_DIV_ZERO at execution in ordinary profile |
| signed minimum m divided by -1 m | E_I64_OVERFLOW at execution in ordinary profile |
| 0 in Positive or Negative | rejection |
| 0 in NonNegative and NonPositive | acceptance |
| Positive integer 1 / Positive integer 2 | zero; not Positive |
| NonZero signed input -1, 1, 0 | accept, accept, reject |
| positive infinity and NaN in Finite | reject both |
| positive and negative zero in strict sign | reject both |
| exact 1 attosecond in seconds, integer carrier | reject fractional conversion |
| absolute 0 °C converted to Kelvin | 273.15 K with exact decimal or specified precision |
| temperature point minus point | linear interval |
| temperature point plus point | reject by default |
| energy plus torque without explicit semantic conversion | reject under nominal-kind extension |

## Implementation and evidence gates

1. Core reference catalog and exact-scale adversarial checks; independent host tests do not establish compiler support.
2. Ordinary source entrypoint and real emitted guest for existing integer quantities/refinements on JVM, LLVM, NativeAOT, Rust, browser Wasm, Forge, Cranelift, JS, and supported HDL subset; exact source and canonical diagnostic categories; artifact-free static denials.
3. Stable prelude identity/import and type ABI, checked boundary ingress for FFI, actor mail and deserialization; no metadata wrappers or allocation when static erasure is sufficient. Dynamic validation and numeric operations may still cost runtime work.
4. Explicitly gate generic noninterval predicates, floating-point, compound named units, symbolic/irrational conversion factors, affine points, and nominal quantity kinds until their actual backend guests and negative controls pass.

For each backend record source corpus hash, compiler head and tree, build toolchain, executed job/steps, artifact type, guest outcomes, rejection categories and regression results. Distinguish HOST_ONLY from compiler-backed actual guest execution. No runner/zero-step failure is runner admission failure, never a semantic receipt. Use only approved source-transfer destinations and exact-tree verification; never disclose source to an unapproved carrier. No merge without fresh evidence and independent review.
