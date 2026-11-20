# Unsafe blocks and unsafe callable boundaries v1

**Status: TARGET DESIGN CONTRACT — NOT COMPILER / GUEST EXECUTION CERTIFIED (2026-11-19).**

Canonical AttoLang spelling is `unsafe { ... }`. This defines a lexical *proof-obligation* boundary, not a new trust level, permission, memory domain, or scheduler mode. It reconciles the historical Oreslang `unsafe-boundary-v1` / `std/unsafe` drafts without importing their guest-facing unsafe package. The language spec is authoritative; formatting and backend profiles follow it.

## Syntax and phase distinction

```ebnf
unsafe_block           = "unsafe", block ;
unsafe_callable_prefix = [ "pub" ], [ "susp" | "suspends" ], "unsafe", ("fnc" | "routine") ;
block                  = "{", { statement }, "}" ;
```

- `unsafe` is a full-token contextual keyword in the above positions, not a substring of `unsafe_tools` or part of a string, comment, or Symbol `#unsafe`. Statements and braces must be parsed structurally, not recognized with a regex or by balancing arbitrary text after a token.
- Version 1 guarantees a **statement** form `unsafe { ... }` (including empty and nested blocks). A value-producing block form, if introduced, needs an independent typed-expression/last-value contract; implementations MUST NOT silently treat a statement block as a value.
- `pub unsafe fnc read_word(...): int { ... }` declares a callable with an unsafe **caller obligation**. A call to it needs a lexical `unsafe` block even from an unsafe callable. The body of an `unsafe fnc` is **not implicitly unsafe**: raw operations inside it still require an explicit `unsafe { ... }`. Ordinary Atto effect declarations (`susp`, `spawns`, `throws`, etc.) remain independent and must be preserved.
- Nested callable/lambda/actor declarations do **not** inherit the enclosing unsafe permission, even if their source text appears inside a block. Unsafe context ends at its matching closing brace. Macro expansion, inlining, callbacks, dynamic dispatch and imported callables do not acquire caller permission by accident.
- `unsafe` is not a cast, binding qualifier, ownership operation, exception handler, or synonym of `trap`. `rt ref`, `ref!`, `deref!`, `unref!`, `borrow!`, `take!`, `share!`, `pin!`, `drop!` and `copy!!` keep their existing typed ownership semantics in and out of blocks.

```atto
// TARGET SYNTAX — NOT YET EXECUTED AS AN ATTO GUEST.
pub fnc main(): int {
    val int before = 20;
    unsafe {
        // The safe operation is still checked; this block grants no extra rights.
        val int after = before + 22;
        stdio.println(after);
    }
    return 42;
}
```

```atto
// SIGNATURE/FFI PSEUDOCODE ONLY — requires separately approved native-host ABI.
pub unsafe fnc native_read(RawPointer<int> ptr): int {
    unsafe {
        // checked_native_read is an illustrative host intrinsic, NOT a public API.
        return checked_native_read(ptr);
    }
}
pub fnc read_validated(NativeRegionGrant grant): int {
    unsafe {
        // Grant validation, actor/generation, alignment, bounds, alias and lifetime
        // obligations have to be established independently of this keyword.
        return native_read(grant.checked_ptr());
    }
}
```

## Two independent admission gates

An unsafe operation may run iff **both** gates hold:

1. **Lexical/compiler:** the operation is explicitly marked `unsafe.memory`, `unsafe.ffi`, `unsafe.mmio` or `unsafe.intrinsic` by a verified callee/IR contract, and is in the correct `unsafe { }` context; an unsafe callable call must satisfy its signature. Every safe operation remains type/effect/borrow checked. The compiler records unsafe-region source spans and origin/reason in typed IR and must not erase checks at optimization boundaries.
2. **Authority/runtime:** the operation has an independently validated, least-privilege, nonforgeable grant from the host profile (exact code/module binding, operation rights, allocation/region, actor, TenantVM, generation, lifetime and revocation). The source keyword, an `unsafe fnc` declaration, import, manifest flag, reflection, annotation or guessed integer address **cannot mint a grant**.

An empty unsafe block or one containing only safe operations can be syntactically valid in a supported trusted host profile. An operation needing an unsafe grant must be rejected if the grant is missing even if the code has an unsafe block. A grant without a lexical unsafe context also cannot satisfy an unsafe call.

## Permitted only within admitted trusted-native host profiles

Subject to the two gates: explicit `RawPointer<T>` access; checked raw casts/arithmetic; foreign ABI calls; compiler intrinsics; memory-mapped I/O. `RawPointer<T>` is a distinct, provenance-bearing interface, **not** interchangeable with Atto's checked `Pointer<T>` or `ref!` / `deref!` / `unref!` handle model. `NativePointer<T>` is an unresolved legacy name, not a second implicit alias. A plain integer address cannot create valid pointer provenance.

When the compiler cannot prove native aliasing/alignment/initialization/exclusivity properties, the **author** of a trusted-host unsafe component must document and preserve them. But unsafe does **not** waive host-enforced allocation bounds, provenance/grant checks, ACLs, capability permissions, code origin verification, quota accounting, or branch/CFI validation. Any target unable to enforce the required isolation must reject unsafe host execution or run it behind a separate process boundary; never call native unsandboxed guest code a secure in-process TenantVM.

## Non-bypassable Atto invariants

- **TenantVM:** untrusted actors and every VM-isolate (including otherwise trusted guest code) cannot admit `unsafe` blocks/calls or import/link/transitively load the native `std/unsafe/*` package. This v1 policy is fail-closed even for an empty unsafe block in those execution profiles. Safe standard I/O APIs may have independently trusted host implementations.
- **Actor state:** sealed `handle_state(critical-read/critical-write)` boundaries, membership/generation, actor heap confinement, mailbox `Sendable` vs `Serializable`, CONTROL supervisor notices, panics and lifecycle gates are not bypassed. No raw pointer, native grant, lock lease or unsendable alias may cross actor or TenantVM boundaries through erased types, reflection or serialization.
- **Ownership:** no implicit `take!`, `share!`, `copy!!`, live-borrow escape, double `drop!`, skipped destructor, or mutable shared alias. Raw access requires its distinct checked grant; it cannot make an illegal high-level ownership operation legal.
- **Suspension:** `await` / `select` remain subject to `susp` checks. Raw pointers, active exclusive loans, lock leases and revoked grants cannot survive suspension, cancellation, restart, hot reload or migration without a separately verified pinned/owned continuation and grant; unsafe does not imply such proof. Ordinary safe suspension inside an unsafe block does not extend the lexical permission into a resumed callback.
- **Permissions/RT:** no bypass of Deno-style FS/net/process permissions, path/socket capability checks, fuel/reductions, memory/stack limits, watchdog, hard-RT policies, or cancellation cleanup. MMIO/FFI may be unsupported on targets; unsafe does not make them portable.
- **Safe wrappers:** a safe public wrapper around unsafe host internals must establish preconditions for **every** allowed call and maintain postconditions across error, panic, cancellation, and normal exit. It must not return a raw host pointer, native token or unvalidated memory view to guests.

## Fail-closed compilation and typed diagnostics

A backend whose parser/checker/IR/runtime does not implement the required feature MUST reject it with a typed diagnostic *before* publishing executable guest artifacts. G0 implementations may reserve the standalone token and emit `E_UNSAFE_UNSUPPORTED` for any unsafe block/call; this is **not** positive syntax parity.

Recommended stable diagnostic families:
- `E_UNSAFE_CONTEXT`: unsafe operation/call outside lexical block
- `E_UNSAFE_UNSUPPORTED`: backend/profile lacks checked lowering
- `E_UNSAFE_DOMAIN`: TenantVM, untrusted actor or guest-isolate restriction
- `E_UNSAFE_GRANT`: missing/invalid/revoked capability or provenance
- `E_UNSAFE_ESCAPE`: cross-actor, cross-tenant, return/serialization or suspension escape
- `E_UNSAFE_CALL`: unsupported callable/effect/ABI contract

Parser/AST must carry `UnsafeBlock` with source span and body, and callable signatures must carry `requires_unsafe`. Type checking retains the unsafe-region stack and operation/effect/grant evidence. Checked IR must preserve the source-to-intrinsic permission boundary through optimization, inlining and codegen. Unknown effects, unsupported intrinsics and unresolved imports fail closed.

## Negative-first conformance and rollout

Conformance MUST cover: standalone keyword vs comments/string/Symbol/identifier; nesting/brace scope; unsafe fnc call inside/outside block; no implicit unsafe body of unsafe fnc; deny untrusted TenantVM (including empty block and transitive native imports); forged pointer, stale generation, bounds, alias, actor/tenant transport; deny granted FFI call without lexical context; no suspension or lock-lease escape; checked safe arithmetic unchanged; formatter idempotence; exact guest output only for implemented profiles. Test no artifact on rejection.

Stages: **G0** reserve and reject unsafe execution; **G1** parse AST + effect/context diagnostics in trusted profiles without native operation lowering; **G2** audited trusted-native grant-backed operations with exact ABI/generation, native sanitizer/CFI tests, and independently executed compiled guest fixtures; **G3** any separately proven bounded sandbox profile. No stage automatically grants unsafe to TenantVMs.

Report each target independently as `passed`, `failed`, `unsupported`, or `not_executed`, with exact source and compiled artifact SHAs and nonzero-step execution. Source-only registries, formatter tests, lexer probes, native host models and CI without actual guest execution are NOT execution or cross-backend parity. Dependencies: atto-format (semantic-preserving braces), atto-platform-conformance (positive/negative fixtures), atto-source.* (typed parser/checker/lowering), and the historical Oreslang unsafe boundary and native-host-only stdlib drafts (reconciled, not silently imported).
