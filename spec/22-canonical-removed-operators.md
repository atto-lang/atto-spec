# Canonical operator fixture reconciliation (source-only)

Status: TARGET / NOT EXECUTED by guest compilers. This supersedes the November 5 blanket token-removal proposal. The current [bitwise and stream operator contract](../language/bitwise-and-stream-operators-v1.md) and [return sequence contract](../language/return-shorthand-and-sequences-v1.md) govern.

- A single infix caret (e.g. `42 ^ 7`) is invalid. Statement-leading `^ expression;` and the contextual literal `return ^ (steps..., tail)` are distinct legal target forms.
- Integer `^^` is bitwise XOR, not a removed token. Boolean `^^` is a typed rejection; use `Xor(bool,bool)`. No implicit coercion.
- Named `Integer.rem` and `Integer.mod` follow the checked arithmetic contract. The original percent fixture is retained as a historical candidate, not a blanket portable rejection gate; edition-specific admission requires its own ratified evidence.

The scanner only identifies a bounded set of fixture shapes, ignoring nested comments and quoted strings. Unknown caret contexts require real parsing. A host scan is neither acceptance nor a compiler diagnostic, and cannot establish typed boolean rejection. The fixture names encode proposed outcomes, not observed outcomes.

Each supported backend must run the positive multiplication, caret return, contextual sequence and integer-XOR guests and verify their expected values; reject infix caret and boolean XOR before artifact emission with the expected diagnostic. Pin compiler and source identities and report unsupported or not-executed separately. Do not treat zero-step jobs, source scans or host models as guest parity. Canonical ownership bangs and their legacy aliases are governed independently by chapter 16.
