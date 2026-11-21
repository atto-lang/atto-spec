# Confidential computing and TenantVM boundaries v1 — editor's draft

**Status: TARGET / NOT HARDWARE VERIFIED.** This contract defines runtime
hosting semantics, not an AttoLang keyword. No backend is certified by this
document. The corresponding executable evidence belongs to
[atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance).

## 1. Distinct trust boundaries

1. **External infrastructure vs. protected workload:** a hardware Trusted
   Execution Environment (TEE) such as AMD SEV-SNP or Intel TDX may provide
   workload confidentiality and integrity against some privileged host threats,
   subject to that technology's published threat model.
2. **TenantVM A vs. TenantVM B in the same OS process:** must be enforced
   *independently* by the Atto runtime, trusted code producer and unavoidable
   memory/capability barriers. Whole-VM hardware attestation does not prove
   per-TenantVM separation.
3. **Actor A vs. actor B within a TenantVM:** sealed state, actor-owned
   memory, mailbox admission, resource quotas and typed control notices
   remain enforced as specified elsewhere.

An actor heap, JVM Context, Java classloader, `mmap` cage, Graal Native Image
or target-profile entry is NOT a hardware TEE. In-process untrusted native
code with unrestricted pointers cannot be admitted merely because the host
is inside a confidential VM.

## 2. Trusted host admission protocol

Confidential execution is a host/deployment **requirement**, never a guest
self-asserted capability. The host MUST reject a confidential request if
the implementation has no independently reviewed hardware attestor and
secret-release broker. An opt-in flag or untrusted `is_confidential` value
MUST NOT silently downgrade to trusted-only ordinary execution.

The confidential host is instantiated in an approved TEE before the host
may claim hardware protection; an individual TenantVM cannot retrofit
whole-VM memory encryption after the process starts.

The host-side attestation protocol MUST:

1. Generate a fresh unpredictable challenge from an OS CSPRNG, bind it to
   a deployment-scoped ephemeral public key and intended workload identity.
2. Verify the vendor-signed evidence and endorsement chain cryptographically,
   including trust roots, TCB/security version, firmware policy, revoked
   endorsements, debug configuration and technology-specific report format.
3. Verify freshness against the issued challenge and short bounded validity,
   and bind signed report data to the expected image/boot measurement and
   ephemeral key. Untrusted quote metadata alone cannot assert validity.
4. Fail closed before any sensitive provision/admission if any check fails,
   the TEE is unavailable, the quote is stale, the measurement changes, or
   the provider/TCB is unsupported. No fallback to unprotected execution.
5. Only after independent verification may the secret broker establish an
   authenticated encrypted channel bound to the measured workload and
   ephemeral key. Secrets are never supplied through guest-provided
   headers, logs, ambient environment or unsigned manifests.
6. Revoke tenant-scoped keys and capabilities on generation restart,
   quiescence, shutdown and provider policy withdrawal. Reject replayed
   evidence and stale key-release tickets. Keep I/O capability enforcement,
   tenant identity and budget checks orthogonal to the TEE verdict.

## 3. State and evidence classification

The portable preflight states are:

- `CREATED`
- `CHALLENGE_ISSUED`
- `UNVERIFIED_CLAIMS_MATCH` (untrusted metadata matches host policy;
  **NOT** vendor authenticated)
- `REJECTED`

A challenge is consumed on the first inspection, including failure.
`UNVERIFIED_CLAIMS_MATCH` MUST NOT authorize a TenantVM, bypass permissions,
create a verified label, or release a key. Future provider-specific
`VENDOR_VERIFIED` and `KEY_RELEASE_AUTHORIZED` states require distinct
non-forgeable trusted proofs and reviewed key-broker integration; neither
exists in this v1 preflight.

Backend reporting MUST distinguish `HOST_ONLY`,
`SOURCE_FREE_REFERENCE`, `NOT_EXECUTED`, `HARDWARE_ATTESTED` and
`UNSUPPORTED`. A host unit test is never `HARDWARE_ATTESTED`.
Hardware evidence must include code/artifact digest, exact compiler/runtime
SHA, TEE model, security/firmware version, attestation verifier details,
executed positive and negative cases, and CI provenance with nonzero steps.

## 4. Required adversarial vectors

Preflight rejects mismatched provider, nonce, image digest, low TCB,
debug-enabled mode, revoked evidence, empty/malformed quote, stale or
future timestamp, expired challenge, invalid entropy, and second use of
a consumed challenge. These tests are **not cryptographic quote verification**.

Hardware tests must additionally reject tampered vendor signatures,
untrusted chain roots, revoked certificates, stale signed report data,
wrong channel binding, key replay, and denial of tenant isolation;
one compromised tenant must not read a sibling's memory or socket.
Tests must run on actual supported hardware before claiming support.

## 5. Backend allocation

- **Java/GraalVM:** trusted Java host should verify TEE evidence via an
  approved verifier before any protected workload credential release.
  `TenantIsolateManager.open_confidential_tenant_vm` remains disabled until
  the provider and per-tenant security barriers are independently reviewed.
- **LLVM:** trusted native runtime validates hardware evidence outside
  hard-real-time actor turns. `VmSpec.require_confidential_compute` MUST
  fail closed without a reviewed provider. Appending a status code must not
  silently renumber existing ABI values. Native code cages and checked
  offsets alone do not implement hardware-TEE protection.

**Related drafts:** [Java #218](https://github.com/atto-lang/atto-source.java/pull/218)
and [LLVM #294](https://github.com/atto-lang/atto-source.llvm/pull/294).
