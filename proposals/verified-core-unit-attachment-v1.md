# Verified Core explicit unit attachment (candidate)

User-approved direction, 2026-11-25. Extends the closed [quantity profile](verified-core-quantities-v1.md) and typed scalar [refinements profile](verified-core-refinements-v1.md). Keep compact contiguous decimal quantity literals `84<Second>`. Add postfix `84::<Second>` and explicit `84 as Second`. Do not introduce `..<`.

~~~atto
define dimension Time;
define unit Second: Time;
pub fnc main() -> int {
    return (1 as Second) / (0 as Second);
}
~~~

The three spellings of the operands produce the same checked division-by-zero runtime failure, not a static rejection. `::<Unit>` is postfix, before unary sign and binary arithmetic; `as Unit` follows ordinary cast precedence (after arithmetic). Parenthesize an as-attachment used as an arithmetic operand. Signed minimum literals follow the existing signed-literal rule. The compact suffix remains literal-only; explicit forms can attach a resolved concrete unit to a scalar expression or immutable scalar parameter.

## Static semantics

Resolve Unit as a concrete unit declaration, never a dimension, module, type parameter, scalar carrier, or unrecognized identifier. Existing checked type/refinement casts retain their semantics; when the target resolves to a unit, use the explicit attachment judgment instead. Reject ambiguity between type and unit names in a declaration scope. Attachment requires normalized empty dimension vector AND exact scale one. The result carries the selected unit and preserves the numeric carrier and value, evaluating the operand exactly once. No coercion from an already dimensioned value, no silently rescaling dimensionless residual scales, no repeated tagging, no bypass of refinement checks. A fully cancelled scale-one ratio may be attached, as it is an ordinary scalar. The source must type-check even if an earlier arithmetic operation traps. Attachments do not suppress arithmetic failures.

Use `to_unit<Target>()` for genuine conversions, retaining exactness and range checks. The existing constant-literal conversion profile may accept the symbolic attachment immediately followed by conversion; dynamic conversion remains separately gated. Affine units are excluded. No runtime unit reflection or solver is needed.

## Grammar compatibility

The existing double-colon token remains a callable-body delimiter in its existing grammar context; recognize the explicit angle suffix only in admitted quantity expressions, not by global token replacement. Preserve compact relational/generic disambiguation and existing generic-call parsing. Do not reinterpret range notation or change nonquantity casts. Unknown or malformed attachment fails closed. Whitespace between explicit tokens is permitted by the token grammar; compact decimal adjacency remains unchanged. Formatter preserves spelling by default.

## Evidence gate

Run all three spellings with normal values, division by zero and signed minimum overflow; expression and parameter attachment; exact literal conversion; reject existing quantity reinterpretation, duplicate attachment, residual non-one scale, wrong-kind/unresolved targets and malformed delimiters. Exercise ordinary comparison, callable-body and cast syntax independently. Require real compiler/guest outcomes and per-backend admission. This candidate is not a statement of existing parity.
