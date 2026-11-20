# AttoLang hosted permission policy v1 (Deno-style CLI, stricter TenantVM enforcement)

**Status: normative TARGET, NOT IMPLEMENTED/NOT CERTIFIED across `atto-source.*`.** This document defines the intended security contract, not evidence that the current `atto` CLI, any compiler, or a compiled guest enforces it. See [hosted asynchronous HTTP/FS](https://github.com/atto-lang/atto-spec/pull/117), [conformance fixtures](https://github.com/atto-lang/atto-platform-conformance/pull/101), and [legacy Oreslang security tracker](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/issues/32). Migrate reviewed behavior and tests; do not infer Atto parity from the legacy name.

## Invocation and syntax

```sh
atto run --allow-net=example.com --allow-read=./data --allow-write=./out main.atto
# Explicit narrow exclusion overrides broader access:
atto run --allow-net --deny-net=*.example.com:443 main.atto
```

`--allow-{read,write,net,env,run,sys,ffi,import}[=SCOPE[,SCOPE...]]` and matching `--deny-*`, `--allow-all`, `--no-prompt`, and `--permission-check=runtime|compile` are the proposed compatible CLI surface. A **bare** `--allow-read` requests unrestricted read in *that category*, not the following positional filename; a scoped form **requires `=`**. Bare `--deny-read` denies all read. Unknown, malformed, duplicate-conflicting, empty CSV components (`a,,b`, `a,`), invalid UTF-8, malformed IPv6, NULs and invalid ports fail closed. `--` separates runtime CLI arguments from guest arguments; guest arguments never become permissions. Default `--no-prompt` for services/untrusted code; no programmatic self-grant.

**Single parser authority:** `github.com/flags-2-env`'s audited/bundled structured parser and one version-pinned `.cli-flags.toml` schema must govern Atto public CLI and backend front doors. Use its structured `command`, `extras`, `provided_flags`, `errors` and `unknown_options` outputs, not shell `eval`, custom re-parsing, or a second Clap/argparse policy parser. Do not read `.env` to create privileges; `[env] load=false`. Only authenticated operator-supplied launch flags may request new grants. `ATTO_*` environment variables or inherited guest process arguments cannot elevate permissions.

## Authorization authority and lifecycle

All guest I/O is **DENIED unless explicitly and effectively granted**. The trusted host/toolchain's ability to read `.atto` source and write compiled output is separate from guest read/write authority.

The effective permission to perform operation `op` on resource `r` is:

```text
ALLOW iff host/OS ceiling
      AND verified executable artifact ceiling
      AND explicit runtime launch grant
      AND TenantVM ceiling
      AND current actor/isolate capability
      AND delegated child/group ceiling (where applicable)
      AND no matching explicit deny at ANY layer
```

Every layer is an immutable, generation-identified policy snapshot; missing or malformed mandatory authority, an unknown manifest schema, missing artifact descriptor, or an unsupported enforcement primitive is **DENY/REJECT**, not `allow-all`. Explicit denies at any layer override grants at every layer. `--allow-all` is only a request within the existing ceilings and never bypasses a deny. A child, ActorGroup, hot-loaded actor, spawned subprocess, worker or proxy may only inherit the *intersection* of its delegator's effective permissions and its own requested ceiling. Untrusted TenantVMs cannot share policy builders, raw host handles, socket FDs, object pointers, native symbols or privileged callbacks.

`atto build/check` policy sets an **artifact maximum authority**; it does not grant guest startup capabilities. The artifact has a versioned, independently integrity-verified descriptor including explicit deny-all presence, canonical allows/denies, effect-summary digest and trusted artifact identity. Checksums stored alongside mutable data do not authenticate it: use a trusted signed container or secure loader mapping. A compiled executable without its verified descriptor must not execute privileged I/O. At startup, intersect the descriptor with an explicit runtime request and every host/tenant/actor ceiling. `--permission-check=compile` may statically reject transitive forbidden effects; `runtime` defers only resource decisions, **never** the trusted runtime authorization check. Unknown imported or dynamic effects are not pure.

Revocation takes effect before **new admissions**. Pre-existing handles and in-flight operations must be tracked by tenant/actor incarnation, capability generation and resource lease; cancellation, close and late-completion disposal rules must be tested before claiming revocation of existing OS handles. A stale actor/ticket/worker generation cannot revive I/O authority.

## Scoped filesystem and network checks

- **Filesystem:** anchor relative paths to a frozen tenant-authorized root, not a mutable cwd; check authorization immediately before read/open, create, truncate, rename and other side effects. Use descriptor-relative confinement (Linux `openat2` or equivalent, with appropriate resolve restrictions), not a `realpath`-then-open race. Symlink traversal/alias, `..`, absolute paths, rename/swap, hard links, platform path semantics, magic links and mount boundaries require explicit treatment. If the platform cannot securely enforce a particular scope, reject that operation. Writes to `./out` do not imply reads from it or access to its parents beyond necessary metadata operations.
- **Network:** validate scheme, hostname, optional port, concrete destination IP, and operation class (DNS, connect, bind/listen, redirect). Canonicalize DNS case/final dot and bracketed IPv6. A host allowlist alone is insufficient: recheck the resolved destination address, every redirect and each attempted connection; deny wildcard-host-plus-port combinations correctly. Prevent SSRF via loopback, metadata services and private networks unless the host/tenant policy explicitly permits them. Enforce separately for incoming listeners and outgoing connections.
- **Others:** enforce `env` by key (the total `os.read_env` API deliberately returns `""` on denial as specified in `file-module-const-v1.md`); enforce `sys` by observation, `run` by resolved executable identity and bounded child environment/argv, `ffi` by trusted loader/OS sandbox, `import` for network/dynamic imports including hot reload. `--allow-run` or `--allow-ffi` must never become unrestricted ambient syscall access inside an untrusted TenantVM.

**Security boundary:** Java/Graal, Wasm and native adapters must enforce admission in the trusted host I/O broker. A generic native AOT binary capable of arbitrary syscalls is *not* sandboxed by a cooperative permissions library. For hostile guests require verified process/OS sandboxing, hardware-enforced memory isolation, a sealed instruction/syscall environment, or a strictly mediated executable profile; otherwise fail closed. A shared OS process with mutually untrusted tenants is not certified merely because the language has borrow checking.

## Guest program and failure semantics

```atto
import * as fs from pkg "std.fs";

pub susp fnc main(): int {
  val content = await fs.read_text("./data/input.txt");
  await fs.write_text("./out/copy.txt", content);
  return 0;
}
```

For this invocation `atto run --allow-net=example.com --allow-read=./data --allow-write=./out main.atto`, the **successful expected behavior** is a byte-equivalent UTF-8 copy. `--allow-net` is unused by this program. A read outside `./data`, write outside `./out`, or any network call other than the authorized destination must fail before its privileged side effect. Hosted I/O must raise the ordinary typed permission error according to `hosted-async-http-fs-v1` and `trap-result-v1`; it must not panic, silently succeed, truncate a denied output, log secrets, or emit a fake guest success. In `os.read_env`, preserve the separately specified total-empty-string result on denial.

Explicit package imports are required for `fs` and `http`; the abbreviated user preview without an import is not yet canonical syntax. Unsupported freestanding targets must issue a deterministic no-artifact diagnostic rather than accepting a flag or silently implementing a no-op.

## Security conformance and release gate

The portable conformance registry must cover default denial; scoped allow; denies overriding `--allow-all`; explicit deny-all serialization; malformed argv and manifest; non-escalating compilation/startup; actor/child/tenant delegation; symlink and rename race; host/IP/port/redirect/DNS rebinding; environment leaks; subprocess/FFI bypass; cancellation/revocation; stale actor/ticket; cross-tenant isolation. Include both allowed and denied **real compiled Atto guests**, exact artifact and source blob SHAs, target and toolchain, nonzero executed CI steps, file/network side-effect observations, and negative error diagnostics. Host-only reference models and source-only fixture validation are useful but **NOT guest execution**. Mark each backend PASSED, FAILED, UNSUPPORTED (with runtime rejection evidence), or NOT_EXECUTED. Do not assert multi-backend parity until actual cross-backend guests run.

Migration/overlap: legacy `oreslang-cli#3/#8`, Java `#249/#702/#1027/#1041`, LLVM `#509` and the 44→52-case scoped policy vectors are related prior art; verify exact sources/reviews and do not copy restricted private code to a different repository or CI destination without authorization.
