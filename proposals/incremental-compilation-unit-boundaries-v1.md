# Proposal: compilation unit boundaries and incremental build equivalence v1

**Status: proposal / draft.** Build semantics only; introduces no new keywords and does not certify backend support.

Related implementation contract: [atto-common-source #133](https://github.com/atto-lang/atto-common-source/pull/133). Implementation tracker: [atto-compilers-parity-testing #53](https://github.com/atto-lang/atto-compilers-parity-testing/issues/53).

## Semantic identities

- A package instance is a pinned manifest/dependency-lock identity. Package ownership, import provenance and visibility must be verified before compiler cache reuse.
- A file with one explicit `use namespace N;` belongs to exactly `(PackageInstanceId, N)`. Multiple validated files may contribute to that one namespace within the same package, independent of directory. Namespace membership **never spans packages**.
- A file with **no explicit namespace header** is a distinct `(PackageInstanceId, SourceUnitId)` compilation unit. No compiler may implicitly merge such source files into one global/default namespace just to form a cache group. Files in the same package remain separate units, regardless of folder. A source added to or removed from a namespace changes compilation identity and requires appropriate invalidation.
- `define module` remains a separate source-language construct and does not implicitly join a namespace aggregate. Import resolution, runtime initialization and actor state rules are not changed by the build cache.

## Required build guarantee

Incremental compilation is permitted only when the resulting program is **observationally equivalent to a clean compilation** of the same verified snapshot with the same target, flags and toolchain: type/borrow/effect/actor admission, errors, public ABI, required artifact provenance and executable guest behavior must agree.

The minimum optimizable dirty set is the owning compilation unit (unnamespaced file or explicit namespace). Finer-grained function/declaration reuse is permitted if dependencies are proven. The compiler may re-link/repackage an output after regenerating only one source unit; linking is **not** the same as recompilation. Global optimizations may require more codegen work, which must be reported accurately.

Public interface/effects/ownership/actor protocol changes can invalidate importers. Implementation-body changes invalidate embedding/inlining/specialization consumers as needed. Negative symbol lookups, source membership changes, package/version/alias rebinding, compile-time macro expansion, target/toolchain/runtime profile changes and hot-load generations must also be covered. An invalid, missing, stale or untrusted cache witness must never bypass semantic admission or silently reuse old code.

## Example target behavior

```atto
// app/src/alpha.atto — no namespace
pub fnc alpha(): int { return 1; }

// app/src/beta.atto — no namespace
pub fnc beta(): int { return 2; }

// app/src/users/lookup.atto
use namespace users;
pub fnc lookup(int id): int { return id; }

// app/src/users/create.atto
use namespace users;
pub fnc create(int id): int { return id; }
```

An implementation-only edit to `alpha.atto` must not require recompiling `beta.atto`, nor either `users` source fragment, unless a verified cross-unit dependency requires it. An edit to `users/lookup.atto` may rebuild the `users` group, but should not recompile `alpha.atto` merely because both belong to the same package.

## Conformance and rollout

Prove clean-vs-incremental equivalence using actual compiled guests and source fixtures, including file-without-namespace independence, multi-file namespace membership, ABI edits, inline bodies, file deletion/movement, missing/negative imports, package pin changes, SCCs, actor contracts and cache corruption. Record build reasons and actual parsing/typing/codegen/relink counts.

Target CLI UX (`atto build --incremental --explain-rebuild`, `--clean`) is a separate tooling decision, not new language syntax. Compilers unable to prove reuse may perform correct clean compilation and report incremental support as unsupported, never as a successful cache optimization.

**Profile boundary:** [static imports v2](../language/static-imports-v2.md) governs source namespace headers, authenticated package identities and aliases. Preserve private declaration and capability checks, including [host permission ceilings](../language/host-permissions-v1.md). This candidate adds build-cache requirements only; implementation and persistent cache activation remain gated on independent compiler/security review.

## Persistent cache admission (candidate v1)

Private typed intermediates may be retained by the same compiler instance.
Persistent artifacts cross a trust boundary: a content-addressed filename
or a digest recorded beside untrusted bytes does not prove that an artifact
was produced by an authorized compiler. These rules apply to disk, shared,
remote and restored CI caches. No JIT or new language syntax is required.

### Identity and key material

Separate stable logical identity (package owner + namespace or source unit)
from authenticated changing input identity. A logical ID must not depend on
inventory order or unrelated providers. A frozen package lock digest commits
to its exact dependency pins; conservative v1 invalidation traverses the full
changed dependency closure. Package name and version alone are insufficient.

A key MUST commit to the cache schema/stage, exact compiler and relevant
toolchain/runtime/library identities, architecture/OS/data layout/target
features/ABI, language edition and semantic flags, optimization profile,
capability/ownership/effect policy, authenticated logical unit identity,
manifest/lock/source membership and content digests, resolved import
provenance and stage-relevant dependency witnesses, and generated inputs or
expansion tool identities where enabled. Encode field boundaries
unambiguously with a domain separator and version; sort only unordered inputs,
reject duplicate identities, distinguish absent from empty values, preserve
semantic source order. Cross-backend reuse requires proven matching stage
format and toolchain identities. Canonical wire encoding and cross-language
key vectors remain a separate implementation gate.

### Trust and atomicity

1. Verify the complete required source closure and resolve current bindings
   before lookup. Missing/unauthorized imports, stale pins and ambiguous
   identities reject even on a warm build.
2. A hit requires the expected key, artifact stage, size, digest and
   independently trusted provenance binding that key to that digest (such as
   a signed compiler receipt or separately protected local compiler ledger).
   An attacker-controlled blob and matching attacker-controlled metadata
   are not evidence. Untrusted intermediates may be hints only if fully
   revalidated or recomputed; do not execute untrusted native code to validate it.
3. Use bounded safe file-handle reads; reject symlinks, traversal, nonregular
   files and substitution between validation and use. Bound entry size,
   storage, file count and parsing effort. Respect package access boundaries.
4. Stage privately and publish atomically only after all required semantic,
   ownership, effect, linking and artifact-verification gates succeed.
   Failure, cancellation, crash, concurrent writers or eviction must not
   publish partially valid or stale entries.
5. Corrupt, untrusted or incompatible cache entries are misses or explicit
   diagnostics, never permission to reuse stale code. Invalid source graphs
   are compilation rejections, not misses. Never cache live runtime handles,
   host pointers, credentials, actor state or runtime capability grants.

### Required conformance matrix

| Fixture | Required outcome |
| --- | --- |
| Cold / warm / inventory permutation | Equivalent guest; stage-specific actual reuse counters |
| C edit in A → B → C; independent D | A/B/C and affected consumer invalidated; D eligible |
| Unrelated insertion ahead of A; removal and re-add | Stable existing IDs; removed entries evicted |
| Changed compiler, target, ABI, flags, policy or lock | Miss or rejection, no incompatible reuse |
| Private/undeclared/negative import on warm graph | Same rejection as clean build; no partial publication |
| Blob corruption, swapped key, forged digest/receipt, unknown signer | No trusted hit even with self-consistent local metadata |
| Symlink, traversal, nonregular file, oversized entry, interrupted writer | No escape, unsafe read or partial hit |
| Concurrent readers/writers, eviction, failed build and recovery | Clean-build equivalence and no stale artifacts |

Report parsing, type checking, CFG/IR verification, code generation, linking,
native publication and actual guest execution separately. A parser hit is not
a code-generation hit. A persistent-cache claim requires a second process or
restarted compiler and hostile on-disk fixture tests.

### Candidate canonical cache-key envelope v1

The executable reference in [compiler-cache-key-reference.mjs](../tests/compiler-cache-key-reference.mjs)
defines a bounded **key envelope only**. Each stage must separately specify
how its six input digest witnesses are constructed and authenticated; this
envelope does not turn a caller-supplied digest into authority.

Encoding: SHA-256 of ASCII `atto.compiler.cache-key.v1` plus one zero byte,
then four length-prefixed ASCII identities (stage, owner, unit kind,
unit), then six fixed 32-byte binary SHA-256 witnesses in this order:
compiler, toolchain, target/ABI, semantic configuration, source/lock
inventory, binding provenance. Length/count prefixes are unsigned 32-bit
big-endian. Identities contain 1–512 printable nonspace ASCII bytes;
unit kind is exactly namespace or source-unit. Generated-input witness
uses a one-byte presence tag: 0 means absent, 1 is followed by its 32-byte
digest. Finish with a dependency count (0–128) and that many
length-prefixed dependency identities followed by 32-byte digests,
sorted lexicographically by ASCII bytes; duplicate identities reject.
The input API requires every field, lowercase 64-character hex digests,
and explicit null for absent generated inputs. Unknown fields reject.
This deliberately narrow ASCII envelope is not a general source path
normalization rule or a cross-backend artifact compatibility guarantee.

The shared vector in the reference hashes to
`6d0658c41d4e45ede029ca0c7654333c5aa0bc117f3179f12832aa7b1d22b657`.
Independent Java/.NET/Rust implementations must reproduce the vector and
all rejection cases before persistent cache integration. Receipt authentication,
safe storage and full stage-specific input witnesses are still mandatory.

### Candidate local trusted-ledger artifact receipt v1

This bounded profile uses a **symmetric HMAC-SHA-256** key of exactly 32
cryptographically random bytes, provisioned independently by the trusted
host. It MUST NOT be stored in the cache, exposed to guest code, accepted
from an artifact, committed to a repository, or used as a shared cross-tenant
key. Every verifier holding the key can also create receipts; this is not
a public-key signature, remote attestation, or suitable for untrusted
verifiers. Deployment must isolate the signing authority and define key
rotation and revocation. The test key below is exclusively a fixture.

An envelope has exactly 112 header bytes plus 0–4,194,304 payload bytes:
eight ASCII bytes ATTOCAC1, 32 binary bytes of the independently computed
canonical cache key, eight unsigned big-endian payload-length bytes,
32 binary SHA-256 bytes of payload, 32 HMAC-SHA-256 bytes, then payload.
Authenticate ASCII atto.compiler.artifact-receipt.v1 followed by a zero
byte and the first 80 header bytes. The expected key is derived from
current authenticated inputs, never from the envelope. Verify size,
magic, exact expected key, exact length, HMAC and payload digest before
returning a private copy of the verified bytes; do not return a path
for later reopening. No trailing bytes. Failure is a miss or explicit
cache diagnostic, not executable authority.

Test vector: key 6d0658c41d4e45ede029ca0c7654333c5aa0bc117f3179f12832aa7b1d22b657;
test secret bytes 00 through 1f; payload hex
6174746f2d61727469666163742d763100ff (18 bytes); payload digest
12159b7475693b14fdfe1090dc00659901309d07d525fd96647e04e53fe5c4e1;
expected HMAC 3653396c79c689b07bb08274d60b4de17d57d0c9dd4fd22180aa7af88940b524.

A Linux-only candidate store may use 16 fixed direct-mapped slots (first
key nibble) and one pending file, with at most 64 MiB published payload
plus headers and one pending envelope. A slot collision is a miss.
Use a pinned owner-only directory, reject symlinks, nonregular files and
hardlinks, inspect pinned inode before opening it for reading, bound
reads, serialize cooperating writers, fsync complete pending data,
atomically rename within the directory and fsync the directory. Recover
interrupted pending files only under the writer lock. A trusted host and
trusted procfs are prerequisites for the Linux descriptor implementation.
This is a logical store bound, not an OS-enforced disk quota against
arbitrary external writes or a defense against a hostile same-UID
process. No automatic portable filesystem or native-loading claim.

Receipt signing must be downstream of successful compiler verification,
not a service that signs arbitrary caller-supplied executable bytes.
This candidate only specifies and tests the envelope and storage
primitives. Compiler stage witnesses, key provisioning, independent
cryptographic/filesystem review, real cross-process compilation and
guest execution remain mandatory before activating cache reuse.

#### Target and key lifecycle admission

A synchronous build MUST pin its effective target and semantic configuration
across graph preparation, key derivation and cold compilation. Reading a
mutable process default at multiple stages is not a valid cache witness.
The bounded Wasm candidate uses an explicit per-build target OS scope;
it must restore nested scopes on errors and must not leak configuration
between concurrent builds. The canonical source witness commits to the
trusted lock digest; the binding witness commits to deterministic linked
source. These are conservative whole-package witnesses, not per-unit
typed-IR reuse. The host must independently attest the actual compiler,
embedded libraries and toolchain identity; a caller's version string
is not proof.

For a local trusted-ledger deployment, a candidate tenant-derived receipt
key is HMAC-SHA256(master, ASCII atto.compiler.local-receipt-key.v1, zero
byte, unsigned 32-bit big-endian scope length, scope bytes, unsigned
64-bit big-endian epoch). Scope is 1–512 nonspace printable ASCII bytes;
epoch is positive. Master is a protected random 32-byte host key.
An active-key policy must reject backwards or equal epochs, avoid
reusing a master at rotation, and accept only receipts authenticated by
the active derived key. Old receipts become invalid. Tenant scope
separation is not a substitute for isolation of the key holder.
The authoritative active epoch and key must survive restart in an
independently protected, rollback-resistant host ledger. An in-memory
policy cannot prevent a privileged caller from reconstructing an old
epoch after restart; do not claim durable revocation until that ledger
and its failure/concurrency cases are tested. No secrets in diagnostics,
cache files, source fixtures used outside tests, or guest APIs.

Report cold and warm graph admission, frontend/code generation,
receipt verification/read, publication/fsync, process start and actual
guest execution separately where possible. A tiny debug fixture with
hot OS page cache is a smoke measurement, not a representative speedup
or an acceptance threshold. Include compiler identity attestation cost
and describe any amortization.
