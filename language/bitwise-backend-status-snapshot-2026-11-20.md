# Operator backend status snapshot — 2026-11-20

**Historical status report preserved from atto-spec PR #151.** This is an archival checkpoint and **not** a fresh execution receipt on the present PR head. Treat the compiler hashes, claimed runs and labels below as reported historical results that must be reverified against the actual backend PR heads and guest artifacts. Canonical current operator rules live in [bitwise-and-stream-operators-v1.md](bitwise-and-stream-operators-v1.md); the accepted design record is [semantic-reconciliation-2026-11-20.md](semantic-reconciliation-2026-11-20.md). In particular, the accepted shift-count policy is checked 0..63 and `int ^^ int` is XOR.

### Backend status (2026-11-20)

Reported as PASS / FAIL / UNSUPPORTED / NOT EXECUTED, locally on the exact pushed heads; hosted CI is billing-blocked.

| Item | Java (atto-source.java 12ded133d8) | LLVM (atto-source.llvm 79827f2a4) | .NET (atto-source.net) |
| --- | --- | --- | --- |
| `<<<`, `>>>`, infix `ashr` | PASS: Graal guest tests incl. BW-005/006/007/009/010/011 | PASS: native guest `tests/native_odb1_bitshift_source_execution.sh` (13 executed assertions, 4 compile rejections, 4 runtime traps) | UNSUPPORTED (no shift operators) |
| `<<`/`>>` rejected as integer shifts | PASS | PASS (fail closed: native channel I/O is not lowered) | PASS by absence (not tokenized as operators) |
| Checked shift count `0..63` (BW-008) | PARTIAL: fails closed via host exception; needs language error normalization | PARTIAL: native trap; needs language error/CONTROL normalization | UNSUPPORTED |
| Compound `<<<=`, `>>>=`, `ashr=` | UNSUPPORTED (no compound assignment) | UNSUPPORTED | UNSUPPORTED |

Java also implements the io-direction shorthand (atto-spec #32 draft) for `Channel<T>` statements: `sink << value;`, `source >> val|let name [: T];` and `val|let name [: T] << source;`, desugared to exactly `writech`/`readch`. `select` arms and non-channel streams are NOT EXECUTED.
