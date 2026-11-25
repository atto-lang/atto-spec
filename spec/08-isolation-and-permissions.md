# 08 — Isolation, Capabilities and Permission Admission

**Status: DRAFT; profile-dependent security contract.**

**Canonical naming:** [TenantVM](tenant-vm-terminology.md) denotes the per-tenant execution domain; historical IsolateVM identifiers describe the same conceptual boundary. Naming alone does not certify hostile-tenant containment.

## Threat and authority model

Language-level actor confinement is **not** an OS sandbox. Hostile tenants may share one OS process only inside independently verified per-tenant TenantVM/isolate containment boundaries; **a separate OS process is not universally mandatory**. An allocator arena, thread, unchecked cage or user-supplied provenance marker alone is insufficient. A process sandbox remains an optional stronger deployment profile. Actor kind controls runtime policy: trusted shared, private/isolated, or untrusted actors may have different capabilities and transport. Actual memory/CPU fault isolation requires a verified isolate, process, sandbox or platform mechanism.

The guest does not grant itself host access merely by importing a package, declaring an actor or invoking a privileged method.

## Deny-by-default permissions

The target permission categories are `read`, `write`, `net`, `env`, `run`, `sys`, `ffi`, and `import`. Missing authority fails closed; an explicit deny overrides any allow. Effective authority is the **intersection** of independently trusted host/OS ceiling, packaged artifact ceiling, runtime request, current actor/isolate policy and delegated child policy.

CLI permission flags should follow a Deno-like model and be parsed consistently across all implementations using [flags-2-env](https://github.com/flags-2-env). A parser library is not proof of backend enforcement. Permission grant scopes, symbolic links, DNS rebinding, process arguments and environment inheritance require enforcement at the actual I/O operation boundary, not just compile-time inspection.

A verified binary policy manifest binds an artifact digest to its authority ceiling. A hash without an independently trusted expected digest or signature does **not** authenticate an adversarial artifact.

## Isolation invariants

- No ordinary guest source can open an arbitrary foreign host class/library just by spelling an import.
- Every capability is checked before a privileged operation and checked again after redirects, final path resolution, or resumed operations where identity can change.
- An untrusted actor cannot forge a supervisor CONTROL event, allocate host threads, read another actor's mutable arena, or launder a shared-memory capability.
- Separate actor arenas provide ownership boundaries; they are not necessarily hardware-enforced address spaces or separately collected heaps.
- Mailbox, memory, CPU, timer and I/O quotas apply independently and transitively to delegated children.
- All transfer boundaries validate type, generation, serialization, ownership and quotas before enqueue/publication.
- Source hot-reload may not silently inherit broader authority, and stale handles to old code generations are fenced.
- A native FFI permission can authorize a call without making foreign memory corruption safe.

## Execution domains

The default execution policy should keep shared, isolated and untrusted actor work on separately governed dispatch domains. Where available, OS processes, WASI sandboxes, Graal isolates, .NET runtime constraints and Linux primitives such as namespaces/seccomp/cgroups may strengthen the boundary. Any claim of hard isolation must identify the actual kernel/host enforcement mechanism and attack tests.

## Security and release tests

Compile-time rejection of unauthorized APIs; run-time deny and allow tests; TOCTOU and symlink swapping; DNS redirection/rebinding; bounded payload graphs; malicious message nesting; capability revocation; stale-actor and hot-generation replay; supervisor forgery; and cross-tenant memory tests are required.

Private compiler/source code must never be copied to a different CI organization merely because its Actions runners have available minutes. A governed cross-org mirror requires independent source-snapshot and destination approval under the existing private-CI release gates; this specification grants **no** such authorization.
