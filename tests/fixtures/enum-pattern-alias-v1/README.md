# Enum match-arm aliases v1 — TARGET fixtures

These .atto files specify **desired** frontend and ownership behavior; they are not executable conformance evidence until a named compiler accepts/rejects each file with stepful test proof.

| Fixture | Expected compiler result |
| --- | --- |
| accept-worker-receive.atto | Accept: fields plus narrowed whole-variant aliases; do match is void |
| accept-short-and-qualified.atto | Accept: short alias and explicitly qualified variant |
| accept-expression-and-statement.atto | Accept: expression match returns a value, do match permits explicit return |
| reject-alias-collision.atto | Reject: alias collides with selected field binding |
| reject-unknown-variant.atto | Reject: matched enum has no Delete variant |
| reject-field-alias-v1.atto | Reject: unsupported per-field renaming (v1 only) |
| reject-alias-escape.atto | Reject: non-owning whole-variant alias sent to actor |
| reject-duplicate-payload-binding.atto | Reject: same payload field bound twice in one arm |
| reject-missing-variant-field.atto | Reject: payload field not defined on variant |
| reject-nonexhaustive-match.atto | Reject: nonexhaustive closed enum value match |
| reject-borrow-after-arm.atto | Reject: arm-scoped borrow accessed after arm |
| reject-move-with-live-alias.atto | Reject: ownership move through a borrowed variant or while conflicting field loan is live |
| reject-cross-enum-variant.atto | Reject: ServerMsg.Stop used when matching WorkerMsg |

## Evidence categories

1. **Authored source fixture**: file exists. No parser claim.
2. **Source-free model**: Node semantic/reference tests pass. Not the AttoLang parser or ownership checker.
3. **Frontend**: real AttoLang lexer/parser and static type/ownership checker run and produce expected diagnostics.
4. **Guest execution**: code actually compiles and executes on the target backend with expected results.
5. **Native guest AOT**: real native generated executable and bounded memory/ownership evidence.

The local Node checks in tests/enum-pattern-alias-*.test.mjs are strictly category 2. CI checks must record actual runner allocation and nonempty steps; a zero-step run is NOT_EXECUTED. No source mirror to another organization is allowed without the reviewed authorization gate for that exact private source snapshot and destination.

Negative fixtures must fail before executable IR. Review each rejection diagnostic so an unrelated undefined method, missing symbol, or unsupported file extension does not masquerade as ownership or enum-pattern coverage.
