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

#### Candidate externally pinned active ledger record

The record is eight ASCII bytes ATTOLED1, a four-byte unsigned big-endian
scope length, the ASCII scope, an eight-byte unsigned big-endian nonzero
epoch, and 32 bytes of SHA-256 of the derived active receipt key. Total
length is 52 + scope length, at most 564 bytes. No master or derived key
is stored in the record. Admission requires exact expected scope,
current record SHA-256 from an independently protected authority, and
the independently provisioned master for that epoch. Reject malformed
records, wrong scope, incorrect master and stale records against that
current pin. A valid record under a stale pin is not evidence of current
authority; the host must supply the current pin and serialize rotation
with builds. A record codec is not a durable ledger implementation.

For test-only master 32 repetitions of byte 07, scope tenant/a and
epoch 2, the derived receipt key is
d2153371616fc59b235d24aff7417a37fea38a6fdc5391503a54ea33f429a90e.
The record is
4154544f4c4544310000000874656e616e742f610000000000000002a63c8f18ca3245c9d319f61b2ca45a2a6605ea3293664ad236792133ce088462
and its SHA-256 is
95c69714073e8a9a4c845fa54d0f87706f718fed1f5879016723780618b83309.

The explicit incremental candidate must re-admit the current ledger and
source closure before lookup. A valid hit skips compilation; a true miss
compiles and publishes only successfully verified compiler output.
Corrupt or wrong-key entries fail with a cache diagnostic, not an
implicit fallback. Explicit cold mode bypasses lookup and rebuilds;
after rotation the host must cold rebuild or provision a fresh cache
namespace. No guest API, implicit production activation, or signing
arbitrary caller-provided artifacts.

#### Local authority adapter and rotation fencing candidate

For a local Linux x86-64 host, a protected authority directory distinct
from the cache root may hold the bounded active record (never master
or receipt key bytes). The trusted host supplies the current independently
authenticated pin and epoch master. All cooperating sessions acquire a
shared descriptor-relative directory lease before reading that record and
hold it through source admission, artifact lookup, cold compilation and
publication. An exclusive rotation lease must conflict with all live
shared leases. A reader holding an old epoch cannot publish after a
successful rotation through this adapter. Busy rotation is a retryable
host condition, not permission to proceed without a lease.

Provisioning is explicit and refuses an existing active record. Rotation
uses compare-and-swap against the old pin, authenticates the previous
master, requires increasing epoch and a changed master, and verifies the
next independently provided pin before publication. Write only the record
to an exclusive pending inode, fsync it, rename within the same directory,
then fsync the directory. A failure after rename is an indeterminate
durability result: re-admit against current external authority before use.
Reject nonregular, linked, oversized or non-owner-only active records
before opening for data. Require a trusted local filesystem, procfs and
protected ancestors. Advisory locks do not defend against a malicious
same-UID writer or replaced authority roots. A restored record must fail
against an independently retained current pin. Restoring both the external
authority and record is outside this candidate's rollback protection.
The provider that maintains current pins and synchronizes rotation across
host restarts remains a production gate; no claim of hardware-backed or
distributed rollback resistance.

Initial acceptance uses a twelve-source locked package with ten files
declaring three namespaces and two unnamespaced modules. The clean and
warm guest return 42; an independently repinned edit to one unnamespaced
provider returns 43. Require cold/warm byte identity, rejection of stale
source pins, and no cache changes after failed semantic checks. This
whole-package final-artifact test is not proof of selective parse, typed-IR,
codegen or relink reuse. A second importing package and per-unit counters
remain mandatory for the full tracker #53 acceptance fixture.

#### Transactional source-local transformation memo

The initial process-local memo may reuse deterministic manifest import
rewrites and extracted local import paths only when the current source
bytes authenticate against the supplied trusted lock and the exact
manifest bytes, canonical file path, source digest and effective target
agree with the previous accepted snapshot. The memo must not cache
authority, visibility decisions, typed IR, borrow/effect proofs or
generated code under these witnesses. The complete current graph and
provider authority are still admitted. Cold mode does not use previous
memo entries. Successful compiler publication or authenticated artifact
reuse commits the staged memo; any diagnostic or publication failure
leaves the previous memo untouched. Deletion and manifest/target changes
must not allow stale entries to survive. Expose rewrite and rewrite-reuse
counts separately from parsing, rechecking, code generation and linking.

A bounded trusted-host Rust experiment may expose an explicit opt-in
library feature for the locked-snapshot profile. It must not change
default compiler behavior, expose a guest signing service, or infer
host authority from caller-supplied version strings. Require independently
attested compiler/toolchain identities, separate protected authority
and cache roots, independently current epoch pin, host-provisioned key,
and local lease fencing. A library feature alone is not production
deployment approval; external rollback-resistant authority, its recovery
protocol, platform ports, and independent review remain requirements.

#### Experimental registry-root cache profile

A single independently lock-pinned application source may import an
explicit host-approved set of 1–16 independently authenticated frozen
registry snapshots. No ambient registry acquisition, transitive dependency
resolution, or implicit authority from a package name is admitted by this
profile. The application manifest and its sole source are authenticated
before lookup; duplicate names or self dependencies fail closed. Aggregate
source and binding-witness bytes are bounded at 4 MiB each.

The final-artifact stage is registry-wasm-module, distinct from the local
locked-snapshot stage. Its key binds the application identity, entry path,
trusted application lock digest, actual resolved token stream (including
positions, compiler-private explicit token tags and framed payloads), all
approved provider names and lock digests in canonical order, compiler,
toolchain, target and configuration. Every approved lock is included even
if unused. The existing registry resolver performs current binding and
visibility checks before lookup; successful cold compilation passes the
same ordinary semantic checker and emitter. No token witness is a typed
IR authorization.

Process-local immutable provider views may be reused only for an unchanged
approved name, trusted lock digest and target in the same host-attested
session. All current manifest, lock and raw inventory bytes are still
reauthenticated. Resolve the entire current application graph every time.
Stage the replacement view map; commit it only after authenticated
artifact reuse or successful compilation and publication. Cold mode
reconstructs all views; rotation clears both source and provider memos.
Report freshly authenticated providers, rebuilt views and reused views
separately from typed-IR/codegen counters. An edited provider conservatively
invalidates final guest output and triggers full compilation on a miss.
This profile is not the full multi-file cross-package acceptance matrix
and provides no independent durable external authority.

#### Closed namespace semantic-check memo and callable signature telemetry

The direct-function registry lane may memoize a successful isolated
semantic check of a closed namespace in the current host process only.
Admission still authenticates the current source inventory, determines
the actual binding graph, checks current visibility and rejects free calls
and callable capture before any proof reuse. The memo compares the full
exact ordered token stream including source positions for the same package
name and namespace in the pinned compiler/target session. No hash-only
comparison, public signature-only reuse, or cached negative lookup is
admitted. Closed units cannot depend on another namespace's typed state;
nominal lanes do not consult this memo. On a miss perform the existing
isolated parser/checker and host-import rejection. Stage memo replacements
until authenticated final-artifact reuse or successful compile/publication.
Re-authenticate and resolve all root bindings every time, including prior
negative lookups, even when closed checks can be reused.

For telemetry, a partial scalar callable-interface digest may frame public
function names in canonical order, parameter names/order, scalar parameter
and result types, parameter mutability, declared purity/exception bounds,
and inferred escaping throw/raise from the existing typed call-graph effect
solver. It is not a complete public ABI, ownership or effect contract:
nominal/generic layout, constants, reexports, visibility outside the
function inventory, fatal panics and broader effects require more proof.
The digest must NOT authorize skipping checks of a changed unit or root.
Record exact isolated checks/reuses separately from partial signature
changes; unchanged signatures are not evidence of unchanged implementation.
A final-artifact miss still checks and emits the whole linked program.
No independently reusable typed IR or object code is claimed.

Test actual cold/warm/edited guests, a named parameter change with unchanged
positional behavior, a transitive escaping exception change in the typed
effect solver, position drift, failed-build rollback, adding an export that
resolves an earlier negative lookup, and unchanged sibling namespaces in
a changed authenticated package. These remain a bounded profile, not general
red-green dependency invalidation or full backend parity.

#### All compiler owners: distinct reuse and execution evidence

The acceptance matrix MUST enumerate every atto-source.* repository.
A successful bounded native or RTL artifact differential is not proof of
general namespace linking, typed-IR reuse, or persistent cache authority.
Record the exact source commit, physical root tree and material workflow
(or test) blob; record actual executed compilation and guest/simulation
steps, target/ABI, exact work counters and diagnostics. Separate these
capabilities rather than inferring one from another:

- Java: independently checked unit reuse and actual trusted JVM execution;
  strict untrusted native-isolate execution remains a separate gate.
- .NET: frozen provider parsing reuse, exact frozen CIL artifact reuse,
  and separately linked NativeAOT guest differential. A CIL hit is not a
  persisted native executable hit. A cold miss runs ordinary CFG and
  module linkage verification. Returned CIL arrays cannot alias the memo.
- Rust: authenticated local and frozen registry stage witnesses, persistent
  final-artifact reuse, source and closed namespace check reuse. External
  durable authority and independently reusable typed/codegen units remain open.
- JavaScript: validate the entire scalar module IR, reuse only exact
  checked function fragments keyed by function slot and canonical IR
  including call target indices. Rebuild exports every time. Slot drift,
  changed call target and changed arity must not silently bind old code.
- LLVM: bounded process-local native IR reuse binds exact source and
  execution profile; actual clang-linked native differential, not a
  browser-Wasm frontend test. No persistent or per-unit native IR claim.
- Forge: bounded process-local runtime-argument assembly reuse binds
  exact source and native architecture. Assemble and execute the actual
  x86-64 output; ARM64 emission is not ARM64 execution.
- Cranelift: bounded host-target relocatable object reuse, executed via
  the checked status/out-pointer native ABI. No JIT fallback claim.
- HDL: exact immutable parser-admitted AST and emitted RTL reuse, with
  actual RTL simulation and failed-input rollback. No general actor or
  software ABI parity claim.
- Wasm integration: run the actual Rust cold/warm/edited guest artifacts
  under the appropriate browser ABI. Keep the strict native core Wasm
  admission contract separate (bounded exported memory, exact export
  inventory); do not weaken it to accept incompatible browser artifacts.
- Atto-authored compiler: stage-0 scalar seed is executable but not a
  general compiler. Stage-1 source pipeline and verified typed units
  are prerequisites for incremental parity; a Rust or JS host model
  cannot substitute for actual Atto-authored compiler execution.
- Realtime: repository bootstrap; executable deterministic source
  admission/lowering and bounded target-specific timing/memory contracts
  are prerequisites. No real-time certification or cache parity yet.

All profiles must reject invalid source without committing staged state;
compare accepted output to independent clean builds. Exact source or
validated IR equality is a conservative first experiment, not general
red-green invalidation. Where a compiler does not yet support a required
profile, report NOT_IMPLEMENTED or UNSUPPORTED and leave acceptance open.

#### Host receipt interoperability and evidence mode (2026-11-25)

All implemented compiler cache candidates use the same canonical v1
key and HMAC receipt byte format. JavaScript and HDL use Node host crypto,
with descriptor-only plain metadata, dense bounded dependency arrays,
native byte-buffer slots, no shared backing, and defensive copies.
LLVM and Cranelift share the Rust primitives; Forge uses host OpenSSL
SHA-256/HMAC and constant-time comparison. The canonical key and tag
vectors are identical across these implementations, not separate backend
hash conventions. None of these primitives grants source authentication,
permission to load code, protected durable storage or rollback-resistant
key authority. Do not expose signing to guest or browser code.

A cache may not silently substitute an artifact or memoized semantic
check for a requested compiler evidence side effect. When borrow-event
export is active, Rust's authenticated HostSession rejects both cold
and incremental locked/registry builds with E_CACHE_EVIDENCE_MODE before
touching authority, store, or memo. The caller must separately invoke
ordinary clean compilation to obtain the actual evidence stream.
Never publish synthetic evidence or a partial event stream from a
warm artifact. Future traced/cache profiles need explicit, verified
evidence artifacts and independent replay rules.

For Java's legacy named-package layout API, layout is an explicit
input to each invocation. Strict and legacy committed layouts and
cache state are separate; an invalid new layout or failed build cannot
destroy accepted prior state. Distinct roots claiming the same unpinned
package name are denied until independently pinned instance identities
are available. Preserve the same invariant for persistent key witnesses.

Editor reverse-dependency refresh planning is complementary, not a
substitute for trusted linker authority: a removed/added/rebound unit
can affect importers in either the old or current graph. An incomplete
or failed lookup is not proof of independence. Keep editor diagnostics
and semantic proof/artifact reuse distinct.
