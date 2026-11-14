# Enum match-arm aliases v1 — TARGET fixtures

These .atto files specify **desired** frontend and ownership behavior; they are not executable conformance evidence until a named compiler accepts/rejects each file with stepful runtime/test proof.

| Fixture | Expected |
| --- | --- |
| accept-worker-receive.atto | Accept: explicit fields plus narrowed whole-variant aliases |
| accept-short-and-qualified.atto | Accept: short alias and qualified variant |
| reject-alias-collision.atto | Reject: field and alias same binding |
| reject-unknown-variant.atto | Reject: wrong variant for matched enum |
| reject-field-alias-v1.atto | Reject: unsupported per-field renaming |
| reject-alias-escape.atto | Reject: borrowed alias sent to another actor |

A positive source acceptance alone is insufficient: run type-check, ownership validation and actual guest code execution. A negative case must fail *before executable IR* with an appropriate diagnostic. No host-only string matching or JSON checks count as compiler support.
