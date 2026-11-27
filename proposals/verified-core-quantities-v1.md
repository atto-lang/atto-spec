# Verified Core quantities v1

Status: **candidate executable profile**. This proposal covers the first file-local, signed-64-bit slice of the [Verified Core RFC](https://github.com/atto-lang/atto-source.java/pull/1799). The full RFC defines the later language surface, including typed bindings and signatures, refinements, contracts, and protocol payloads.

## Source and elaboration

A file can open with contextual `define dimension Name;` and `define unit Name: Dimension;` declarations before executable declarations. Names are case-sensitive and resolve in one file-local declaration scope. Declare each dimension before its units. A bare unit establishes scale one for its dimension. A derived unit names an earlier unit of that dimension and may scale it by a positive signed-i64 integer. The accepted forms are `= Base`, `= Base / N`, `= Base * N`, and `= N * Base`. Reject duplicate names, multiple scale-one base declarations for a dimension, unresolved or wrong-kind references, cross-dimension derivation, and nonpositive scales. Earlier-only resolution rules out cyclic definitions.

A decimal signed integer literal next to `<Unit>` is a quantity in a closed return expression. The literal and opening angle are contiguous. This slice scopes unit literal recognition to code with quantity declarations and uses a complete unit suffix where existing relational syntax could conflict. `5000<Millis>.to_unit<Second>()` requests exact compile-time conversion of a literal. `-7<Millis>` carries the same unit and a negative value. Conversion has ordinary postfix precedence for a unary minus outside a literal. Reject unknown units and conversions that produce a fractional result or exceed the signed i64 range. An unannotated `int` return requires a fully cancelled dimension vector and scale.

```atto
define dimension Time;
define unit Second: Time;
define unit Millis: Time = Second / 1000;

pub fnc main() -> int {
    return 84_000<Millis>.to_unit<Second>() / 2<Second>;
}
```

## Static semantics

A type is a pair of a signed-i64 carrier and a normalized unit `(D, s)`. The dimension `D` maps nominal base dimensions to their nonzero integer exponents. The scale `s` is a reduced positive rational. Plain `int` is `({}, 1)`. Addition and subtraction require equal dimensions and scales, then preserve both. Unary signs preserve the unit. Multiplication adds exponents and multiplies scales. Quantity division subtracts exponents and divides scales. Operators retain the host-independent, checked signed-i64 semantics of the profile. The historical meaning of a slash with two plain `int` operands remains governed by the existing numeric rules.

An unannotated `int` return and any existing int-only operation require both an empty dimension vector and a scale of one. For example, the numeral produced by `1<Second> / 1<Millis>` cannot enter an unannotated return since the resulting scale is 1000. Equal reduced scales for differently named units allow those units to be used together. A checked conversion preserves the dimension and multiplies the numeric value by the exact ratio of source scale to destination scale before checking divisibility and range. It never silently rounds.

Each source profile admits at most 128 quantity declarations, 32 distinct dimensions per unit, exponents from -64 through 64, and at most 256 bits in each reduced scale component. Check limits after normalization. Report stable categories for incompatible dimensions, scale, names, erased quantities, range, and inexactness. For source that reaches executable lowering, every numeric operation still follows checked i64 semantics. A source compiler can fold a closed quantity expression only after checking the same types and operations, and must preserve the observable arithmetic failure. The proof checker and conformance gate track static rejections separately from runtime failures.

## Evidence

The executable reference semantics live in `atto-common-source/reference/verified-core`. The source corpus and its expected observations live in `atto-platform-conformance/fixtures/verified-core-quantities-v1`. Verify accepted quantities through each compiler's ordinary source entry point and a real generated guest. For static failures compare the diagnostic category and assert that no executable artifact was published. Compare execution failures separately, including zero and signed-minimum division. This profile has no ABI for exporting units, runtime conversions, or dynamically supplied quantity/refinement values. Those continue in later slices of the RFC.

See [the staged standard measurement and mathematical refinement contract](standard-measure-refinements-v1.md) for the planned catalog, generic predicates, and additional evidence gates; this does not expand the admitted v1 source profile.
