# Proposal: compilation unit boundaries and incremental build equivalence v1

**Status: proposal / draft.** Build semantics only; introduces no new keywords and does not certify backend support.

Related implementation contract: [atto-common-source #133](https://github.com/atto-lang/atto-common-source/pull/133). Implementation tracker: [atto-compilers-parity-testing #53](https://github.com/atto-lang/atto-compilers-parity-testing/issues/53).

## Semantic identities

- A package instance is a pinned manifest/dependency-lock identity. Package ownership, import provenance and visibility must be verified before compiler cache reuse.
- A file with one explicit `use namespace N;` belongs to exactly `(PackageInstanceId, NAMED, N)`. Multiple validated files may contribute to that one namespace within the same package, independent of directory. Namespace membership **never spans packages**.
- Under [namespace modes v2](../language/namespace-modes-v2.md), omitted/default/file headers are the same tagged file scope. Named and explicit folder modes may aggregate only verified participants with the same exact scope key. A source added to or removed from a shared scope changes membership and requires invalidation; changing among file spellings does not change identity. No ambient folder grouping for cache convenience.
- `define module` remains a separate source-language construct and does not implicitly join a namespace aggregate. Import resolution, runtime initialization and actor state rules are not changed by the build cache.

## Required build guarantee

Incremental compilation is permitted only when the resulting program is **observationally equivalent to a clean compilation** of the same verified snapshot with the same target, flags and toolchain: type/borrow/effect/actor admission, errors, public ABI, required artifact provenance and executable guest behavior must agree.

The minimum optimizable dirty set is the owning compilation unit (file scope or explicit named/folder scope). Finer-grained function/declaration reuse is permitted if dependencies are proven. The compiler may re-link/repackage an output after regenerating only one source unit; linking is **not** the same as recompilation. Global optimizations may require more codegen work, which must be reported accurately.

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
