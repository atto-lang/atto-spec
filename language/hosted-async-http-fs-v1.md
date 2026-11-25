# Hosted asynchronous `std.http` and `std.fs` v1

**Status: proposed normative contract; no backend execution is certified by this document.**
This is the target for `atto-source.*` compilers, `atto-common-source`, `atto-platform-conformance`, `atto-compilers-parity-testing` and `atto-format`. Existing HTTP/3 QUIC **pure policy/codec** sources are not an outbound HTTP client. In particular, accepting the syntax is not evidence of a working HTTP/TLS/FS host ABI.

## Canonical Atto example

```atto
import namespace http from std.http;
import namespace fs from std.fs;

pub susp fnc main(): int {
  val response = await http.get("https://example.com/data");
  val body = await response.text();
  await fs.write_text("./response.txt", body);
  val saved = await fs.read_text("./response.txt");
  return saved.length;
}
```

The two imports are **required**, not invisible prelude globals: a file without the imports must fail unresolved binding lookup unless it defines its own `http`/`fs` names. The v2 `import namespace alias from std.*` form creates a static namespace alias for a built-in compiler library without `pkg`, per the proposed built-in selector rules in `language/unified-static-imports-v1.md` ([import specification #150](https://github.com/atto-lang/atto-spec/pull/150)). Third-party dependencies still use `pkg`; importing a built-in does not grant permissions. No new `async` keyword is introduced; `susp` is canonical and `await` is the suspension operator. `saved.length` has the already-specified String length semantics; the I/O contract must not silently reinterpret it as UTF-8 byte length. The example needs granted network and file permissions and is **not** a deterministic integration test: its remote endpoint can return any status/body or fail.

## Layer and package contract

- Both modules are **hosted `std`**, not freestanding `core` or allocator-only `alloc`. Their canonical selector is the reserved built-in name without `pkg`: `"std.http"` or `"std.fs"`. The resolver must dispatch only through a compiler-provided built-in table; never fall back to a local file or external dependency. A bare-metal target must reject unresolved hosted I/O with a deterministic diagnostic, never link a no-op shim.
- `std.http` and `std.fs` are **portable native Atto `.atto` APIs** with compatible public names, semantics and error taxonomy. Each compiler may own an independently maintained `.atto` implementation; source files need not have identical bytes. Implement protocol composition, typed responses, policy helpers, retries, UTF-8 validation and ownership handling in Atto wherever expressible.
- The host boundary is restricted to capability-checked, actor/tenant-scoped primitives: socket/DNS/TLS I/O or secure descriptor-relative file operations; async completion; timers/cancellation. It must not export raw file descriptors, network handles, arbitrary paths, host `fetch` objects or ambient OS access to untrusted guest code.
- No backend may emulate guest execution using a host-only test. Compiler, linked guest and actual target artifact must be distinguished.

## Source-level public API

The names and observable types below are normative targets. Suspension semantics are those of a `susp fnc`; `await` produces the stated value. Ordinary recoverable failures are typed `Error` subclasses raised via ordinary **throw**, and `trap! await …` must yield a `Result` under `trap-result-v1`. A fatal host crash, source `raise`, `panic`, cancellation or security trap must **not** be caught by `trap!`.

| API | Successful value | Ownership / semantics |
| --- | --- | --- |
| `await http.get(url: string)` | `HttpResponse` | HTTP GET, follows redirect policy below; response owns bounded body stream |
| `response.status` | `int` | Actual HTTP status including non-2xx; status alone is not transport failure |
| `await response.text()` | `string` | Strict UTF-8 decode of bounded body, consumes body exactly once |
| `await fs.write_text(path: string, text: string)` | `void` | UTF-8 encode and replace/truncate regular file on success; not a durability or atomic-replace guarantee |
| `await fs.read_text(path: string)` | `string` | Read bounded regular file, strict UTF-8 decode |

`HttpResponse` must also expose typed headers, `ok` (200–299), and `close()`/structured automatic cleanup; streaming/body-byte APIs require separate specification before shipping. `response.text()` twice must be a deterministic consumed-body error; cancellation/early-exit must release ownership. A transport error must never fabricate a 200 response; a 404/500 response must not automatically be converted into a thrown transport error. Neither HTTP request nor `fs.write_text` may automatically retry after an uncertain side effect.

Expose typed `HttpError`, `FsError`, `PermissionError`, `CancelledError`, `ResourceLimitError`, `InvalidUtf8Error` under the common `Error` hierarchy, with stable classes/kinds; host-specific errno, Java exceptions, browser DOM exceptions and .NET exceptions must not leak as the public API. The application can use `trap! await …` for ordinary failures. No implicit Result-unwrapping, silent catch-all, or non-`Error` throws.

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
5. Execute ordinary throw/`trap!` coverage, scheduler continuity with one carrier, AOT/zero-GC where claimed, native and browser capability checks, and actual SHA-pinned conformance on each supported target. Unsupported targets **must fail closed**.
6. Cross-repo test evidence states `PASS`, `FAIL`, `UNSUPPORTED`, or `NOT_EXECUTED` **per backend**, never a global PASS derived from another backend.

### Existing work to integrate rather than duplicate

- Atto `atto-spec#42`, `atto-common-source#23`: `core -> alloc -> std` layer policy.
- Atto `atto-source.rs#186`: async/await and JSPI subset; `atto-source.rs#386` with browser HTTP capability ABI, plus browser playground `#156/#176`. None constitutes a production HTTP+FS pair.
- Legacy `oreslang-source.java#221` (native file boundary), `#584` (async HTTP), `#2114/#2126` (strict async-only hosted I/O), `#2055` (atomic write) and `#3118` (durable manifest). Inspect ownership, dependency, private-source export prohibitions and current legal migration status **before** copying implementation. Do not bypass private-source approvals.
- Atto HTTP/3+QUIC policy `atto-common-source#14` and backend `stdlib/net/*.atto` are protocol helpers, **not evidence** of `http.get`.

**Release gate:** This proposal does not make the shown program run. The program is considered supported only after exact-head compiled guest execution with requested permissions and a real HTTP+FS roundtrip on that backend.


## Full `std.fs` API target (2026-11-22 extension)

Canonical import: `import namespace fs from std.fs;`. All functions use
`snake_case`. `std.fs` is hosted and may have independent, backend-owned
`.atto` implementations; user-facing signatures and error/lifetime rules
remain compatible. This section **extends** the initial `read_text` /
`write_text` subset. The signatures below are normative **targets**, not a
statement that any Atto backend has a linked filesystem guest.

### Types and representative signatures

The following is an API declaration sketch, not a compilable extern file
or permission-granting implementation. `Bytes` means an owned byte buffer.
`PathLike` accepts `string | Path | PathBuf` with explicit, checked coercion.
`Stream<Bytes>` describes a bounded, async backpressured byte stream.

```atto
import namespace fs from std.fs;

type PathLike = string | Path | PathBuf;

enum FsErrorKind {
  not_found, already_exists, permission_denied, invalid_path,
  invalid_handle, not_file, not_directory, directory_not_empty, invalid_option,
  invalid_utf8, closed, cancelled, resource_limit, busy,
  unsupported, io_error, unknown_outcome
}

class FsError extends Error {
  kind: FsErrorKind;
  operation: string;
  path: Option<Path>;
}

// Values are immutable; normalize is lexical, not physical symlink resolution.
class Path {
  string value;
  join(component: PathLike): Path;
  parent(): Option<Path>;
  file_name(): Option<string>;
  extension(): Option<string>;
  normalize(): Path;
}
class PathBuf {
  // Owned mutable builder; conversions and mutation remain validated.
  to_path(): Path;
  push(component: PathLike): void;
  pop(): Option<string>;
}
fnc join(base: PathLike, child: PathLike): Path;
fnc parent(path: PathLike): Option<Path>;
fnc file_name(path: PathLike): Option<string>;
fnc extension(path: PathLike): Option<string>;
fnc normalize(path: PathLike): Path;

struct OpenOptions {
  read: bool;            // default false
  write: bool;           // default false
  append: bool;          // default false
  create: bool;          // default false
  create_new: bool;      // default false
  truncate: bool;        // default false
}

struct Metadata {
  is_file: bool;
  is_dir: bool;
  size: int;             // bytes, nonnegative
  // mtime, permissions and inode are deliberately not portable in v1
}

class File {
  susp read(max_bytes: int): Bytes;    // reads from current cursor
  susp write(bytes: Bytes): int;      // may write only a prefix
  susp seek(offset: int): int;        // absolute byte offset from start
  susp flush(): void;
  susp close(): void;
}
class FileStream {
  susp read_chunk(): Option<Bytes>;    // None at EOF
  susp write_chunk(bytes: Bytes): void; // handles partial writes
  susp flush(): void;
  susp close(): void;
}

susp fnc open(path: PathLike, options: OpenOptions): File;
susp fnc read_file(path: PathLike): Bytes;
susp fnc write_file(path: PathLike, bytes: Bytes): void;
susp fnc append_file(path: PathLike, bytes: Bytes): void;
susp fnc copy_file(from: PathLike, to: PathLike): void;
susp fnc rename(from: PathLike, to: PathLike): void;
susp fnc remove_file(path: PathLike): void;
susp fnc create_dir(path: PathLike): void;
susp fnc create_dir_all(path: PathLike): void;
susp fnc read_dir(path: PathLike): Array<DirEntry>;
susp fnc remove_dir(path: PathLike): void;
susp fnc remove_dir_all(path: PathLike): void;
susp fnc metadata(path: PathLike): Metadata;
susp fnc exists(path: PathLike): bool;
susp fnc is_file(path: PathLike): bool;
susp fnc is_dir(path: PathLike): bool;
susp fnc file_size(path: PathLike): int;
susp fnc read_stream(path: PathLike, chunk_bytes: int): FileStream;
susp fnc write_stream(path: PathLike, options: OpenOptions): FileStream;

// Existing path-based helpers keep whole-file semantics.
susp fnc read_text(path: PathLike): string;
susp fnc write_text(path: PathLike, content: string): void;

// File-instance overloads borrow the SAME affine handle; no FileStream,
// implicit reopen, close, ownership transfer or path-based truncation.
susp fnc read_text(file: File): string;
susp fnc write_text(file: File, content: string): void;
susp fnc read_file(file: File): Bytes;
susp fnc write_file(file: File, bytes: Bytes): void;
```

`DirEntry` contains `name: string`, `path: Path`, and `kind:
file | directory`; entry order from `read_dir` is guaranteed lexical by
portable Unicode scalar comparison (not platform locale or inode order).
All returned bytes, metadata records and entries are snapshots; the backing
filesystem may change after the operation.


### File-class instances as direct I/O arguments (not streams)

`std.fs.File` is the **standard-library affine class** returned by
`fs.open(...)`, not an arbitrary user-created path wrapper. A File instance
may be passed directly into `fs.read_text(file)`,
`fs.write_text(file, content)`, `fs.read_file(file)` or
`fs.write_file(file, bytes)`. The argument is **borrowed for the duration
of the suspended operation**; it is not cloned, serialized, consumed, sent to
another actor or implicitly closed. `FileStream` is optional for *incremental*
chunk consumption and is **not** required for these helpers.

Complete example for the intended Atto `.atto` library surface:

```atto
import namespace fs from std.fs;

// 'fs.File' is a public std.fs class, returned by open().
// This function takes a File instance, NOT a FileStream or path.
pub susp fnc load_text(fs.File file): string {
    return await fs.read_text(file);
}

pub susp fnc file_instance_example(): int {
    val options = fs.OpenOptions {
        read: true,
        write: true,
        create: true,
        truncate: true
    };

    val file: fs.File = await fs.open("data/message.txt", options);
    await fs.write_text(file, "Hello from a File instance");

    // Read helpers use the existing cursor. Rewind after writing.
    await file.seek(0);
    val contents = await load_text(file);

    // The same instance can also be used for raw bytes:
    await file.seek(0);
    val bytes = await fs.read_file(file);

    await file.flush();
    await file.close();

    if contents != "Hello from a File instance" then return 1; fi
    return 42;
}
```

This is the **intended typed guest API example**, not proof that a current
compiler accepts the proposed `fs.OpenOptions` constructor or `fs.File`
namespace type spelling. Conformance must compile and execute this fixture
against the final compiler grammar before an implementation can claim PASS.

File-instance overload semantics (different from path overloads):

- `read_text(file)` / `read_file(file)` read **current byte cursor through
  EOF**, advance the cursor, do not close and do not re-open the path. At EOF
  they return an empty string or byte buffer. `read_text` is fatal-UTF-8
  decoding; invalid encoding reports `FsErrorKind.invalid_utf8`. Cursor
  advancement may persist on an invalid UTF-8 error.
- `write_text(file, data)` and `write_file(file, bytes)` write all the
  supplied data from the **current cursor**, respecting append mode and
  permission checks; they must check short writes and zero-progress, keep
  bounded intermediate buffers and enforce quotas. They do not truncate
  unless `OpenOptions.truncate` did so at `open`, and they never close or
  `fsync` implicitly. Incomplete writes on a real host can leave a prefix,
  reported as an error; no implicit non-idempotent retry.
- `file.seek(offset)` changes the *single File instance* cursor. The
  portable v1 model permits byte positions from zero through the present
  file size, inclusive; no sparse-file extension. `seek(0)` is the standard
  rewind operation. A closed, revoked or stale file rejects further seeks.
- A File may be opened read-only, write-only, append-only or with combined
  rights. Overloads recheck both the **host actor/tenant capability** and
  the File's per-handle mode at each call. A forged handle, wrong actor, wrong
  tenant, stale generation, or use-after-close fails closed. The File is
  bound to one actor incarnation. Duplicate references must not bypass
  affine ownership or a future borrow checker.
- Path-based `read_text(path)` still reads a whole-file snapshot.
  Path-based `write_text(path, data)` still creates/truncates, in contrast
  to writing through a File handle. Overload resolution is by the nominal
  `File` type, **not** by coercing arbitrary objects or `FileStream`.
  Generic streams are not interchangeable with File handles.
- The memory-only Wasm/JS adapters currently have *trusted-host equivalents*
  of these overloads using opaque File-object identity; they do not
  constitute a compiled Atto `File` class, ABI or guest capability.


### Actor-scoped File handle host port — candidate ABI v1

An optional **trusted host bridge** may lower an Atto `fs.File` instance
to a bounded numeric handle, but a numeric handle alone never grants
authority. The host must authenticate the actual actor incarnation from
the runtime dispatcher, not a guest-provided actor ID, generation,
capability mask or `File` object. It resolves the numeric value in a
**per-actor private handle table**, which stores the real host-side File
instance and its permissions. Handle IDs are strictly positive safe
integers, monotonically issued, never reused within the actor port,
and bounded independently from concurrently open File slots.

The initial non-guest implementations are
`runtime/fs-file-handle-port-v1.mjs` in Wasm and JS compiler repositories.
They expose a *trusted host-only* `ActorFileHandlePortV1` with
`open/read/write/seek/flush/close/read_file/write_file/read_text/write_text`.
They do not install Wasm import symbols or lower Atto `susp` and
`await`. The numeric ID is a **candidate internal representation**, not
the public File type, an OS file descriptor or a transferable capability.

Security and lifecycle requirements:

- Create a port **only from an authenticated host-issued actor ticket**.
  Do not expose its JS object or capture/serialize its ticket in untrusted
  guest memory. Each privileged operation rechecks actor incarnation,
  tenant isolation, read/write permission, mode and live handle.
- Reject forged, non-integer and unissued handle IDs with
  `FsErrorKind.invalid_handle`; an issued but closed handle reports
  `FsErrorKind.closed`. Handle retirement is monotonic, including failed
  open reservations; never revive a closed handle using the same ID.
- Maintain independent **active handle** and **issued-ID** budgets.
  Reserve admission slots *before* asynchronous open completion.
  Reject concurrent operations against one File with `FsErrorKind.busy`
  to prevent cursor reordering and double-close. `close_all` must wait
  for pending opens and in-flight operations, clean up host objects,
  and never publish a late success after port teardown. Mutation might
  already have occurred before cancellation: no rollback is implied.
- `read_text(File)` and `read_file(File)` consume bytes from current
  cursor through EOF, but do not close the File; `seek(0)` rewinds.
  Text is strictly UTF-8. `write_text(File)` and
  `write_file(File)` preserve cursor and mode semantics; failure cannot
  be retried automatically if a write outcome is uncertain.
- The compiler must lower nominal `File` methods and overloads to a
  versioned asynchronous, non-parking actor scheduler ABI. Typed
  `FsError`/ `Result` lowering, resource destruction and complete
  guest-conformance checks are **not implemented by this host bridge**.
  If any part is unsupported, fail closed before emitting an executable
  that claims full filesystem functionality.

### Failure and Result behavior

Normal operations return the successful type above and throw **only**
`FsError` for ordinary recoverable filesystem failures. The existing Atto
`trap!` operation is the standard way to obtain `Result<T, FsError>`:

```atto
import namespace fs from std.fs;
pub susp fnc load(path: string): Result<Bytes, FsError> {
  return trap! await fs.read_file(path);
}
```

This preserves the previous `await fs.read_text(path): string` contract and
does not require every I/O caller to double-unwrap an additional Result.
`trap!` does **not** catch actor panic/raise, host crash or security trap.
An explicitly cancelled task reports `CancelledError` per task semantics,
not a fabricated successful I/O result. Error `path` must be tenant-relative,
never a leaked absolute host path; no raw errno or host exception escapes.

### File operations and options

- `open` requires at least one of `read`/`write`/`append`, validates
  `create`/`create_new`/`truncate` against write authority, and rejects
  contradictory or unsupported combinations before touching the filesystem.
  `append` atomically selects end-of-file offset for each write operation
  within a handle; multiple writes are **not** a transaction.
- `read_file` and `read_text` are bounded snapshot reads of regular files.
  `write_file` overwrites/truncates or creates a regular file with bounded
  bytes; `append_file` creates if absent and appends. Neither overwrite nor
  append is guaranteed atomic, durable or automatically retried on an
  uncertain outcome. Existing `write_text` retains its behavior.
- `copy_file` requires source READ and destination WRITE. On a mid-operation
  failure, the destination may be partial; no implicit rollback is promised.
  `rename` requires WRITE authority over both source and destination, is
  restricted to the same granted filesystem/root, and never crosses tenant
  authority or device boundaries. Atomicity across targets is **not**
  promised until an independently specified atomic variant is available.
  Destination-exists behavior: fail `already_exists` rather than silently
  overwrite.
- `remove_file` only removes regular files. Missing paths fail
  `not_found`; a directory fails `not_file`. All directory mutation
  operations require separately authorized WRITE and directory-modification
  capabilities; they cannot be used through a file-only grant.
- `create_dir` creates exactly one missing directory; `create_dir_all`
  creates missing parents under the granted root. `remove_dir` only succeeds
  for an empty directory. `remove_dir_all` requires explicit recursive-delete
  authority in addition to WRITE and may partially complete if interrupted.
  The tenant root itself cannot be removed or renamed.
- `exists` returns false **only** for `not_found`, not permission-denied,
  invalid path or unsupported; similarly `is_file`/`is_dir` return false
  for a present object of the other type or a missing entry, but propagate
  authority errors. `file_size` requires a regular file.

### Paths, handles, and streams

- `join`, `parent`, `file_name`, `extension`, `normalize` are
  *pure lexical* operations. They do not perform I/O, resolve symlinks or
  authorize a subsequent open. Normalization removes redundant `.` and
  `/` only where safe; it **must not** erase `..` traversal to bypass
  root confinement. The host independently validates the canonical
  tenant-relative path at each file operation.
- The root path is a tenant-visible logical root, not an ambient CWD.
  `Path(".")` and `PathBuf(".")` represent that root; `join(".", "a")`
  yields `Path("a")`, `parent("a")` returns `Some(Path("."))`,
  `parent(".")`, `file_name(".")`, and `extension(".")` return `None`.
  The root may be listed with READ and inspected with `metadata`, but
  cannot be deleted, renamed, opened as a file or overwritten.
  `PathBuf.pop()` on a one-component path leaves the builder at `Path(".")`.
  `normalize` may collapse lexical `.` and redundant separators but must
  reject unsafe parent traversal instead of hiding it.
  Absolute paths, drive letters, NUL, invalid UTF-8, `..` escaping the
  grant, symlink/mount boundary escapes and device/FIFO/socket paths fail
  closed. Unsafe OS resolution races require descriptor-relative
  primitives or equivalently strong protection.
- `File` and `FileStream` are affine actor/tenant-incarnation-scoped
  resources. They cannot be serialized, copied, sent to unrelated actors
  or used after `close`, actor restart, host revoke or tenant teardown.
  `close` is idempotent for structured cleanup; post-close operations
  fail `closed`. `write` may report short positive counts. A zero-byte
  write of a nonempty buffer is a write-progress failure, not success.
  `read` returns empty only for EOF or a requested max of zero. Invalid
  negative/overlimit lengths fail before allocation.
- `FileStream` requires **backpressure**, bounded chunk size, one
  outstanding operation per stream and no eager unbounded buffering.
  `write_chunk` loops over verified partial writes; `read_chunk`
  returns `None` at EOF. Host I/O must not block guest carriers.
  `flush` flushes adapter buffers but **does not** imply durability
  (`fsync`); durability needs a separate API.
- Admission must recheck tenant/actor generation, explicit READ/WRITE,
  host and artifact ceilings and per-operation resource limits *before*
  each side effect. Cancellation closes/revokes leases. Handle operations
  must not rely on guessed or forged actor IDs from guest memory.

### Implementation and test gates

Portable path/type/error handling, option validation, chunk loops and
stream composition should live in **backend-owned `.atto` files**.
The privileged host adapter provides only bounded rooted open/read/write,
directory operations, stat, close, and async completion. Built-in name
resolution must be explicit, never a guest filesystem fallback or
external `pkg` dependency.

The conformance suite requires positive byte/text roundtrips,
copy/rename/append, nested directory creation/removal, sorted listings,
metadata, read/write/append handles, partial reads/writes, streaming
EOF/flush/close, and error-to-Result wrapping. Negative tests include
independent READ/WRITE/DELETE/recursive-delete denial, spoofed roots,
traversal/symlink/rename races, actors and tenants crossing access
boundaries, stale/forged/closed handles, byte and handle quotas, invalid
UTF-8, cancellation, non-file objects and unknown outcomes. Every backend
must report `PASS`, `FAIL`, `UNSUPPORTED`, or `NOT_EXECUTED`
with exact compiled guest evidence; **host-only adapter tests are not
compiled guest evidence**.

## Native stdlib static namespace spelling (2026-11-22)

The preferred client-side spelling is `import http from "std.http";`,
which binds the public HTTP API as a static alias rather than a runtime object.
The independently maintained Java implementation currently registers
`"std/http.atto"` and defines `use namespace http;` inside its native
`.atto` file. Those forms must not be conflated with a third-party `pkg`
or filesystem import. Compiler-specific aliases are admitted only via
explicit, verified built-in registries. This spelling change does not
by itself implement `await http.get`, TLS, streaming bodies, network grants
or an actor-safe async host bridge.

## Namespace and selective module import distinction (v2 reconciliation)

The current [static imports v2](static-imports-v2.md) is authoritative: registered builtins use bare or quoted dotted names; `import namespace` is preferred and legacy star-as is compatible, not canonical. The historical shorthand and examples below do not supersede v2.

Use `import namespace http from std.http;` and
`import namespace fs from std.fs;` in normative examples.
The shorthand `import http from "std.http";` may be accepted as
compatibility syntax but is not necessary for the canonical language.

`import module http, http3 from "std.http";` is **not** a
synonym: it selects actual exported module declarations named `http`
and `http3`. This API currently specifies a file/library namespace
with exported HTTP functions and classes, not two guaranteed nested
modules. If the implementation has no such module declarations, the
linker must fail with a missing-export diagnostic rather than manufacturing
a namespace object or silently selecting the whole HTTP library.

Neither import spelling grants network authority. No real async
HTTP+TLS guest execution is certified by this spec change.
