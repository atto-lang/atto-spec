# Temporary Java behavioral reference v1

Status: decision for reconciliation, not a backend certification. The language owner directs us to use atto-source.java as the temporary semantic reference while striving for full guest AOT and zero guest tracing-GC.

Reference snapshot: [Java main e8f31a6fe759](https://github.com/atto-lang/atto-source.java/commit/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848), tree a23bb5e6fbbd372c742111e658ea5f2527c7aff2. Distinguish the following observations from execution receipts:

| Domain | Pinned Java source witness | Reconciliation |
| --- | --- | --- |
| Equality | [StrictAttoEqualityAdmissionTest](https://github.com/atto-lang/atto-source.java/blob/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848/src/test/java/dev/oreslang/StrictAttoEqualityAdmissionTest.java) | Strict: eq, neq, contiguous !eq; reject == and !=; identical numeric types. Legacy aliases remain legacy. Alternative identity syntax is unratified. |
| Physical scheduling | [OresSchedulerStateModelTest](https://github.com/atto-lang/atto-source.java/blob/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848/src/test/java/dev/oreslang/runtime/OresSchedulerStateModelTest.java) | Terminal receipt is not physical retirement. Release only after exit and notification drain. Model is not runtime proof. |
| Serial actor | [ActorSerialCarrierSafetyV2Test](https://github.com/atto-lang/atto-source.java/blob/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848/src/test/java/dev/oreslang/runtime/ActorSerialCarrierSafetyV2Test.java) | One serial callback at a time in tested host model; no inference of full guest scheduler support. |
| Heap placement | [Actor heap placement admission](https://github.com/atto-lang/atto-source.java/blob/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848/docs/runtime/actor-heap-placement-admission.md) | Owner-checked arena is not proven physical independence, isolate creation or independent GC. |
| AOT | [Strict frontend](https://github.com/atto-lang/atto-source.java/blob/e8f31a6fe7595e5f7ab30c6b40188bc6f9e56848/docs/ATTO_STRICT_AOT_FRONTEND_V1.md) | Classfile emission or Native Image host is not proof of full native guest AOT. |

## Acceptance hierarchy

Explicit language decisions and safety invariants take precedence over incidental host behavior. Prefer Java's typed semantic behavior for unresolved contradictions; check exact current compiler tests, profile, and implementation. Mark differences in other backends as gaps rather than rewriting the language to their convenience. Existing integer XOR and caret-return decisions remain authoritative over stale Java documentation. Do not change default profile silently.

## Full guest AOT and zero GC targets

All reachable admitted guest functions, typed dispatch, effects, closures, actor/task continuations and cleanup edges must lower before launch; unsupported constructs reject before executable publication. Governed precompiled-module loading is a separate profile, not runtime compilation. No hidden interpreter, JIT, arbitrary runtime reflection or code emission in sealed guest AOT.

Guest-owned memory requires explicit ownership, bounded actor/task regions, checked loans and deterministic reclamation, including long-lived churn, cancellation, supervisor restart, delayed I/O and OOM. Zero guest tracing-GC, host managed GC, and process zero-GC are independent; Epsilon alone does not prove bounded reclamation. Require actual compiled guest and artifact inspections plus allocator/GC measurements and independent regression receipts. No backend is certified by this decision.
