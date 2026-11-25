# Proposal: compilation unit boundaries and incremental build equivalence v1

**Status: proposal / draft.** Build semantics only; introduces no new keywords and does not certify backend support.

Related implementation contract: [atto-common-source #133](https://github.com/atto-lang/atto-common-source/pull/133). Implementation tracker: [atto-compilers-parity-testing #53](https://github.com/atto-lang/atto-compilers-parity-testing/issues/53).

## Semantic identities

- A package instance is a pinned manifest/dependency-lock identity. Package ownership, import provenance and visibility must be verified before compiler cache reuse.
- A file with one explicit `namespace N;` belongs to exactly `(PackageInstanceId, N)`. Multiple validated files may contribute to that one namespace within the same package, independent of directory. Namespace membership **never spans packages**.
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
namespace users;
pub fnc lookup(int id): int { return id; }

// app/src/users/create.atto
namespace users;
pub fnc create(int id): int { return id; }
```

An implementation-only edit to `alpha.atto` must not require recompiling `beta.atto`, nor either `users` source fragment, unless a verified cross-unit dependency requires it. An edit to `users/lookup.atto` may rebuild the `users` group, but should not recompile `alpha.atto` merely because both belong to the same package.

## Conformance and rollout

Prove clean-vs-incremental equivalence using actual compiled guests and source fixtures, including file-without-namespace independence, multi-file namespace membership, ABI edits, inline bodies, file deletion/movement, missing/negative imports, package pin changes, SCCs, actor contracts and cache corruption. Record build reasons and actual parsing/typing/codegen/relink counts.

Target CLI UX (`atto build --incremental --explain-rebuild`, `--clean`) is a separate tooling decision, not new language syntax. Compilers unable to prove reuse may perform correct clean compilation and report incremental support as unsupported, never as a successful cache optimization.

**Review note:** do not merge this proposal before reconciling existing namespace/import/module proposals, manifest ownership contracts and independent source-compiler review.
