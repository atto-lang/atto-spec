# Hosted asynchronous `std.http` and `std.fs` v1

**Status: proposed normative contract; no backend execution is certified by this document.**
This is the target for `atto-source.*` compilers, `atto-common-source`, `atto-platform-conformance`, `atto-compilers-parity-testing` and `atto-format`. Existing HTTP/3 QUIC **pure policy/codec** sources are not an outbound HTTP client. In particular, accepting the syntax is not evidence of a working HTTP/TLS/FS host ABI.

## Canonical Atto example

```atto
import * as http from "std.http";
import * as fs from "std.fs";

pub susp fnc main(): int {
  val response = await http.get("https://example.com/data");
  val body = await response.text();
  await fs.write_text("./response.txt", body);
  val saved = await fs.read_text("./response.txt");
  return saved.length;
}
```

The two imports are **required**, not invisible prelude globals: a file without the imports must fail unresolved binding lookup unless it defines its own `http`/`fs` names. The `import * as … from "std.*"` form denotes built-in compiler-library modules without `pkg`, per the proposed built-in selector rules in `language/unified-static-imports-v1.md` ([import specification #150](https://github.com/atto-lang/atto-spec/pull/150)). Third-party dependencies still use `pkg`; importing a built-in does not grant permissions. No new `async` keyword is introduced; `susp` is canonical and `await` is the suspension operator. `saved.length` has the already-specified String length semantics; the I/O contract must not silently reinterpret it as UTF-8 byte length. The example needs granted network and file permissions and is **not** a deterministic integration test: its remote endpoint can return any status/body or fail.

## Layer and package contract

- Both modules are **hosted `std`**, not freestanding `core` or allocator-only `alloc`. Their canonical selector is the reserved built-in name without `pkg`: `"std.http"` or `"std.fs"`. The resolver must dispatch only through a compiler-provided built-in table; never fall back to a local file or external dependency. A bare-metal target must reject unresolved hosted I/O with a deterministic diagnostic, never link a no-op shim.
- `std.http` and `std.fs` are **portable native Atto `.atto` APIs** with the same public names, semantics, error taxonomy and source bytes across backends where possible. Implement protocol composition, typed responses, policy helpers, retries, UTF-8 validation and ownership handling in Atto wherever expressible.
- The host boundary is restricted to capability-checked, actor/tenant-scoped primitives: socket/DNS/TLS I/O or secure descriptor-relative file operations; async completion; timers/cancellation. It must not export raw file descriptors, network handles, arbitrary paths, host `fetch` objects or ambient OS access to untrusted guest code.
- No backend may emulate guest execution using a host-only test. Compiler, linked guest and actual target artifact must be distinguished.

## Source-level public API

The names and observable types below are normative targets. Suspension semantics are those of a `susp fnc`; `await` produces the stated value. Ordinary recoverable failures are typed `Error` subclasses raised via ordinary **throw**, and `trap await …` must yield a `Result` under `trap-result-v1`. A fatal host crash, source `raise`, `panic`, cancellation or security trap must **not** be caught by `trap`.

| API | Successful value | Ownership / semantics |
| --- | --- | --- |
| `await http.get(url: string)` | `HttpResponse` | HTTP GET, follows redirect policy below; response owns bounded body stream |
| `response.status` | `int` | Actual HTTP status including non-2xx; status alone is not transport failure |
| `await response.text()` | `string` | Strict UTF-8 decode of bounded body, consumes body exactly once |
| `await fs.write_text(path: string, text: string)` | `void` | UTF-8 encode and replace/truncate regular file on success; not a durability or atomic-replace guarantee |
| `await fs.read_text(path: string)` | `string` | Read bounded regular file, strict UTF-8 decode |

`HttpResponse` must also expose typed headers, `ok` (200–299), and `close()`/structured automatic cleanup; streaming/body-byte APIs require separate specification before shipping. `response.text()` twice must be a deterministic consumed-body error; cancellation/early-exit must release ownership. A transport error must never fabricate a 200 response; a 404/500 response must not automatically be converted into a thrown transport error. Neither HTTP request nor `fs.write_text` may automatically retry after an uncertain side effect.

Expose typed `HttpError`, `FsError`, `PermissionError`, `CancelledError`, `ResourceLimitError`, `InvalidUtf8Error` under the common `Error` hierarchy, with stable classes/kinds; host-specific errno, Java exceptions, browser DOM exceptions and .NET exceptions must not leak as the public API. The application can use `trap await …` for ordinary failures. No implicit Result-unwrapping, silent catch-all, or non-`Error` throws.

## Capabilities, isolation and path safety

- **Deny by default.** Admission requires explicit target-appropriate network connect/origin/DNS authority and scoped `FILESYSTEM_READ`/`FILESYSTEM_WRITE`. CLI grants follow the common Deno-like permission model (via `flags-2-env` where that policy is implemented). Reject unauthorized operations **before** any DNS lookup, connection, open, create, truncation, or background submission.
- Recheck effective network authority for DNS resolution, resolved IPs, redirects (including scheme/port and localhost/private-IP changes), cross-origin credentials and proxy selection. HTTPS must validate certificate chain/hostname; fail closed on unavailable TLS support. Bound redirect count; default policy must not automatically forward sensitive credentials cross-origin. Limit header bytes/count, total response bytes, decompression expansion, redirects, connection concurrency and duration.
- Every filesystem operation resolves relative to a **tenant-scoped granted root**, not compiler working directory or host ambient cwd. `./response.txt` denotes the tenant-visible working root. Protect against `..`, absolute-path and symlink/rename/TOCTOU escapes using descriptor-relative handles or equally strong platform-specific mechanisms, including parent/destination checks on write. No FIFO/device/special-file access through text I/O. Separate READ and WRITE grants; successful WRITE does not implicitly grant READ.
- A failed write may leave an incomplete file: `write_text` is **not** atomic or durable. A separate `write_text_atomic`/durable variant must specify rename/fsync semantics and unknown-outcome handling; do not silently conflate APIs with the older Java-host migration PRs. Explicitly close/release all handles on success, denial, cancellation and error.
- Browser Wasm: `fs` may only access an explicitly granted origin-private/virtual/mounted filesystem; never the user's host disk by implication. Node/desktop/native platforms use independently authorized adapters. Unsupported WASI/embedded/HDL targets diagnose unavailable capability, not a stubbed success.
- An actor may not access another actor's file/network authority or handles by reference. Namespace, capability and resource budgets are bound to tenant identity and actor incarnation; revocation closes outstanding leases/requests without cross-tenant leakage.

## Async, scheduling, and errors

Both modules are suspension-capable, not blocking APIs disguised by `await`. Network and filesystem completion must not pin the guest scheduler/carrier. If an OS lacks a native async filesystem primitive, a bounded I/O executor may be used **outside guest carriers**, with backpressure, deadlines and cancellation, without pretending an operation is physically cancellable after submission. Every completion resumes the owning actor/continuation at most once. No unbounded host thread pool or detached operation that survives actor shutdown without authority. Close/revocation and cancellation races must be deterministic and resource-safe. Per-request/body/file quotas must be enforced before allocation, while streaming, and after any decompression.

The compiler/linker must preserve `susp` effects and ownership through `await`. Absent built-in module resolver, stream runtime, socket/TLS broker, file grant, or effect lowering must yield a typed **no-artifact** diagnostic (`E_UNSUPPORTED`, `E_CAPABILITY_UNAVAILABLE`, or existing more specific diagnostic); **never** emit guest code that panics at runtime solely because support was claimed.

## Acceptance and parity evidence

For each `atto-source.llvm`, `.java`, `.net`, `.wasm`, `.rs`, `.forge`, `.cranelift`, `.js`, `.atto`, `.hdl` and `.realtime` backend:

1. Compiler acceptance of the exact two-import fixture, typed `susp` calls, response lifecycle, `await` and `String.length`; negative diagnostics for missing imports, missing capabilities, invalid effects, non-UTF-8 and unsupported targets.
2. **Real compiled guest**, against a locally served HTTP fixture (not external example.com), demonstrates response status, full body, file bytes and reopened text length. Record the source blob SHA, compiler commit/tree, target triple, host-adapter version and executed steps. A host-only Rust test or static parser test is explicitly `NOT_EXECUTED`.
3. Transport negatives: DNS failure, denied origin/IP/redirect, TLS invalid cert, too many redirects, chunked body, binary/invalid-UTF-8 body, oversized/decompression-bomb body, non-2xx status, response-body double consumption, timeout, abort, close and duplicate completion.
4. FS negatives: read/write independently denied, path escape, symlink final/intermediate, swap race, directory/device/FIFO, invalid UTF-8, file oversize, partial write, existing file truncation, cancellation and cleanup. Include two-tenant isolation and actor stop/revoke while I/O is in flight.
5. Execute ordinary throw/`trap` coverage, scheduler continuity with one carrier, AOT/zero-GC where claimed, native and browser capability checks, and actual SHA-pinned conformance on each supported target. Unsupported targets **must fail closed**.
6. Cross-repo test evidence states `PASS`, `FAIL`, `UNSUPPORTED`, or `NOT_EXECUTED` **per backend**, never a global PASS derived from another backend.

### Existing work to integrate rather than duplicate

- Atto `atto-spec#42`, `atto-common-source#23`: `core -> alloc -> std` layer policy.
- Atto `atto-source.rs#186`: async/await and JSPI subset; `atto-source.rs#386` with browser HTTP capability ABI, plus browser playground `#156/#176`. None constitutes a production HTTP+FS pair.
- Legacy `oreslang-source.java#221` (native file boundary), `#584` (async HTTP), `#2114/#2126` (strict async-only hosted I/O), `#2055` (atomic write) and `#3118` (durable manifest). Inspect ownership, dependency, private-source export prohibitions and current legal migration status **before** copying implementation. Do not bypass private-source approvals.
- Atto HTTP/3+QUIC policy `atto-common-source#14` and backend `stdlib/net/*.atto` are protocol helpers, **not evidence** of `http.get`.

**Release gate:** This proposal does not make the shown program run. The program is considered supported only after exact-head compiled guest execution with requested permissions and a real HTTP+FS roundtrip on that backend.
