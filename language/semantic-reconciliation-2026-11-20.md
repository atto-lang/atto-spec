# AttoLang semantic reconciliation — owner decisions, 2026-11-20

**Status:** approved target semantics. **Not** backend-execution evidence. All overlapping implementation/conformance PRs remain subject to review and exact-head tests.

| Topic | Canonical rule | Migration/evidence |
| --- | --- | --- |
| Class field default | An unqualified class field is `val`; explicitly use `let` for rebinding, and `mut` for authorized referent writes | Implicit `let` is legacy |
| Trap | `trap expression` returns `Result`, catches only ordinary escaping `throw`; `raise`, `panic` and cancellation bypass; no nested Result wrapping | Legacy Option trap manifest is historical |
| Tenant isolation | Enforced TenantVM boundary required for hostile tenants sharing one OS process; OS process per tenant is optional | A plain arena/thread/unchecked cage never qualifies |
| Caret/XOR | `^ value;` is return; `int ^^ int` is integer XOR; Boolean XOR uses `Xor(bool,bool)` | No infix single `^` or Boolean `^^` |
| Shifts | `<<<`, `>>>`, `ashr` with checked count `0..63`; invalid count is language-level failure | Host Java exception / raw LLVM trap need normalization |
| Actor state | Only scoped, compiler-checked critical-read/write callbacks access sealed persistent state; checked construction initialization is separate | Direct `self.field` inside `receive` is legacy |
| Match | Every `match ... over` arm requires `on`, including `on _`; `default` is `switch`-only | Old bare/default match tests are historical |
| Division | `int / int` yields floating-point; truncation is explicit, e.g. `Integer.div_trunc` | Superseded by the [November 23 truncating division contract](cross-backend-semantics-reconciliation-v1.md#numeric-semantics) |
| Return-first | `<-` and the exact U+2022 bullet `•` are equivalent return-first separators (with optional `fnc`) | Formatter retains either spelling; reject lookalikes |
| Imports | Historical November 20 choice: `import * as math from "+/lib/math";` | Superseded by November 24 namespace-first target #227; star-as is migration-only |

These decisions do **not** supersede the separately proposed lambda four-style or exception-control bang keyword PRs; those need their own reviewed merge sequences.

## Historical backend evidence preserved

The original Java/LLVM/.NET operator implementation status from this decision draft is archived in [bitwise backend status snapshot](bitwise-backend-status-snapshot-2026-11-20.md), not appended to the canonical syntax chapter. Those reported historical execution labels are **not** current exact-head compiler or guest test receipts. The canonical operator decision is now merged in [atto-spec #143](https://github.com/atto-lang/atto-spec/pull/143); later merged revisions retain its semantics and preserve historical evidence independently. This record does not certify implementation.

## Evidence policy

Keep prior source blobs and real execution receipts immutable. Create versioned new contracts where expected semantics change. A compiler returning `UNSUPPORTED` must fail closed without emitting a guest artifact. Every conformance PASS requires pinned source/compiler revisions, actual compiled guest execution, diagnostics and provenance; host-only semantic checks must not be promoted to guest PASS.
