# 23 — TenantVM (canonical name for per-tenant execution domains)

**Status: DRAFT, normative target terminology, not backend certification.**
**Decision date: 2026-11-11.**

The name for the per-tenant VM in **every AttoLang toolchain** is
**`TenantVM`**. Existing references to *IsolateVM*, *tenant isolate*,
*tenant VM-isolate* and implementation-specific `TenantVm` are historical
spellings of this **same concept**. They are not separate runtime layers.

A tenant principal is different from a TenantVM instance: restarting the same
tenant creates a **new TenantVM incarnation**, including a fresh generation and
host-issued authority. No guest may create tenant authority by supplying a
tenant name.

## Runtime hierarchy

```text
OS process
  OresVM — trusted runtime root, supervisor, capability broker and carrier pool
    TenantVM(tenant = acme, generation = 7)
      tenant-private heap/globals/symbol scope/grants/actor registry
      actor worker_1 — sealed state, owned arena, mailbox, turn
      actor worker_2 — sealed state, owned arena, mailbox, turn
    TenantVM(tenant = globex, generation = 4)
      actor worker_3 — separate tenant-private data
```

One **OresVM** may supervise many **TenantVMs** within one OS process.
A **TenantVM** encloses all actor instances for exactly one authenticated
tenant incarnation. A tenant may host many actors. Each actor retains its
own private mutable state and mailbox; a TenantVM does not merge actor
state into one shared writable object. Actors may execute concurrently
subject to checked state access and scheduling policy.

## Target semantics

1. TenantVM identity is (tenant principal, generation, opaque root authority),
   not a string name or reconstructible `ActorRef`.
2. A TenantVM owns tenant-scoped module globals, ordinary user symbols,
   permissions, resource budgets, in-flight work, actor registry and lifecycle.
   Approved immutable code can be shared across TenantVMs.
3. Actor-private state remains sealed; concurrent readers and exclusive writers
   obey existing `critical-read` / `critical-write` and borrow rules.
   Individual scalar turns remain non-reentrant where the runtime requires it.
4. Host/broker checks deny foreign tenant/actor tickets, forged/replayed
   generation handles, direct cross-tenant pointers and implicit host imports.
   Cross-tenant communication requires explicit authorized serialization or
   checked ownership transfer, with bounded quotas.
5. Quiescence fences new work and pin issuance. Real guest call and I/O
   retirement precedes physical resource release; restarts never reuse stale
   authority.
6. The word `TenantVM` does **not** itself prove protection. Untrusted guest
   execution requires an actual validated-code boundary, enforced memory/
   CPU limits, bounded resource use, independent termination and adversarial
   execution evidence. Unsupported backends must deny admission, never silently
   downgrade to a generic context, Worker, CLR heap or trusted native callback.
7. A separate OS process per tenant is **not required** by the shared-process
   architecture. An optional OS sandbox may add defense in depth; native
   runtime/compiler faults and timing side channels remain shared-process risks.

## Naming, source API and compatibility

- `TenantVM`: canonical architecture/type name across Java/GraalVM,
  LLVM, Wasm, Forge, .NET, Rust, Cranelift, JS and future backends.
- `OresVM`: root runtime. `Actor` and `ActorRef` keep their current
  roles inside tenant ownership and broker rules.
- `TenantVMHandle` and `TenantVMPolicy` are **target vocabulary**, not
  a claim that the corresponding exported type/API already exists.
- A guest language-level `tenant_vm` identifier is **not** a new keyword;
  ordinary function and method names remain `snake_case`.
- Historical exported types, ABI headers, wire tags, repository paths,
  CLI flags, versioned conformance schema IDs and tests stay unchanged until
  a dedicated, tested compatibility migration. Documentation rebranding
  alone must not alter binary or source behavior.

## Per-toolchain implementation mapping

| Toolchain | Current implementation name or substrate | Required interpretation |
| --- | --- | --- |
| Java/GraalVM | `TenantIsolateManager`, `IsolatePolicy`, polyglot `Context` | Trusted host substrate; not yet proven untrusted TenantVM |
| LLVM | C++ `IsolateVM`, `OresVM` and native tenant admission | `IsolateVM` is historical spelling; validated guest cage proof still required |
| Wasm/Wasmtime | `TenantRegistry`, `Store` and `Instance` | TenantVM target; multi-actor guest containment and termination proof outstanding |
| Forge | `runtime/isolate.hpp`, `TenantIsolationAdmission.hpp` | Host registry and fail-closed untrusted guest admission |
| .NET Native AOT | `OresVmHost`, `IsolateHandle`, `NativeVmIsolate` | Logical host substrate; native validated-Wasm TenantVM integration pending |
| Cranelift | `src/isolate.rs`, trusted JIT bridge | Native scalar host model; no untrusted guest guarantee |
| Rust frontend | `oreslang-source.rs` scalar compiler | Must preserve TenantVM facts in future IR/actor lowering |
| JavaScript | `tenant-isolation-policy.mjs`, Worker adapters | Worker alone not hostile tenant containment |
| HDL | experimental source-to-RTL compiler | Does not support TenantVM or actor execution; fail closed |

This chapter standardizes terminology, **not execution evidence**.
Backend-specific documentation must link to its `docs/TENANT_VM_NAMING_V1.md`
and retain any historical symbol spellings needed to build existing code.

## Conformance

Use the existing [tenant isolation v2 shared-process contract](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/blob/main/contracts/tenant-isolation-v2.json).
Require real compiled guest tests with at least two tenants, multiple actors
inside one TenantVM, denial of cross-tenant access, stale-handle invalidation,
per-actor/tenant/host quotas, a trapped/spinning tenant, neighbor survival and
verified physical teardown. Source-free models and zero-step CI runs are
**not** executable backend security evidence.
