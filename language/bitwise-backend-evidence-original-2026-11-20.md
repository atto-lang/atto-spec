# Historical backend evidence — 2026-11-20

Historical report preserved from prior main; not reverified, and evaluated against the superseded masked-count policy. The current target requires checked counts.

### Backend status (2026-11-20)

Reported as PASS / FAIL / UNSUPPORTED / NOT EXECUTED, locally on the exact pushed heads; hosted CI is billing-blocked.

| Item | Java (atto-source.java 12ded133d8) | LLVM (atto-source.llvm 79827f2a4) | .NET (atto-source.net) |
| --- | --- | --- | --- |
| `<<<`, `>>>`, infix `ashr` | PASS: Graal guest tests incl. BW-005/006/007/009/010/011 | PASS: native guest `tests/native_odb1_bitshift_source_execution.sh` (13 executed assertions, 4 compile rejections, 4 runtime traps) | UNSUPPORTED (no shift operators) |
| `<<`/`>>` rejected as integer shifts | PASS | PASS (fail closed: native channel I/O is not lowered) | PASS by absence (not tokenized as operators) |
| Shift count `n & 63` (BW-008) | FAIL: distances outside 0..63 are rejected at runtime | FAIL: distances outside 0..63 trap | UNSUPPORTED |
| Compound `<<<=`, `>>>=`, `ashr=` | UNSUPPORTED (no compound assignment) | UNSUPPORTED | UNSUPPORTED |

Java also implements the io-direction shorthand (atto-spec #32 draft) for `Channel<T>` statements: `sink << value;`, `source >> val|let name [: T];` and `val|let name [: T] << source;`, desugared to exactly `writech`/`readch`. `select` arms and non-channel streams are NOT EXECUTED.
