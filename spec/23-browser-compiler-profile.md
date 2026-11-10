# 23 — Browser compiler integration and compatibility profile

**Status: experimental compatibility profile and observed execution, 2026-11-10. Full backend parity remains NOT VERIFIED.**

The browser target's canonical build source is `ores-truffle-oreslang/oreslang-source.rs/browser` ([integration PR #52](https://github.com/ores-truffle-oreslang/oreslang-source.rs/pull/52)). It was integrated from the existing AttoLang browser compiler. Root `oresc --wasm` and `--js` explicitly select its Wasm and ESM emitters. The JS transpiler's canonical-browser adapter, the Wasm backend's browser adapter and the playground consume the same digest-pinned compiler artifact. The compiler itself is import-free Wasm and runs on-device; compilation does not require a server, LLVM, Cranelift JIT or Wasmtime in the browser.

This establishes a shared parser/type checker for the **browser compatibility subset** and its two outputs. The native `.rs`, independent `.cranelift`, Java and LLVM frontends remain independent. Common repository ownership, matching fixture names, or a successful browser guest cannot certify their behavior.

## Compatibility syntax and current limits

The experimental browser profile accepts source-defined actors of this form:

```atto
define actor Counter as
  let int total = 0;
  receive(ActorMail<int> mail): void {
    self.total = self.total + mail.value;
    stdio.println(self.total);
    return;
  }
end

pub fnc main(): int {
  val counter = spawn Counter();
  counter.send(40);
  counter.send(2);
  return 0;
}
```

This is an executable compatibility fixture, not replacement syntax for the full actor target. The profile currently has int/bool mail, constant field initializers, FIFO delivery, checked signed-i64 arithmetic, bounded print capabilities and host-managed execution termination. It rejects actor-to-actor spawn/send, general shared ownership, suspension and unsupported types rather than interpreting them through host JavaScript.

In particular, direct `self.total` writes and serial mailbox processing in this profile do **not** satisfy the newer sealed-state callbacks and concurrent-default actor amendment in [chapter 22](22-concurrency-and-shared-ownership.md). Supervision, authenticated CONTROL, persistent restart, incarnation-safe authority, ownership transfer and full async/channel behavior retain their target requirements in chapters 05, 13, 18 and 22. Compatibility support must not be presented as implementation of those guarantees.

## Memory and tenant execution

**Target:** one disposable Web Worker per tenant, multiple actor instances inside it. Each actor owns a separate, non-shared wasm32 `WebAssembly.Memory`, or a private arena with independently verified access confinement. References remain checked 32-bit handles/offsets; a host pointer is never an actor reference.

The integrated Wasm and ESM emitters place actor int/bool fields into eight-byte state slots in fixed private linear memory. String data precedes aligned state slots and the object heap starts after them. Every instance has a distinct backing store; actor initialization restores its declared state. A factory that shares a memory between actor instances violates this profile's isolation requirement.

A real Chromium prototype executes compiler-emitted ESM with two source-defined actors inside one tenant Worker and verifies three private memories, including main. The playground's current Wasm host still uses one runner Worker and a dedicated child Worker for each actor; replacing that topology is separate runtime work. Both topologies need an independent parent deadline/cancellation path because an infinite synchronous guest loop cannot service its own termination message.

Linear-memory actor fields do not prove a bounded guest stack, aggregate tenant resource accounting, zero garbage collection, hard real time, native full AOT or OS-process isolation. JS temporaries and frames still use engine-managed storage; browser engines may JIT both Wasm and JavaScript. Web Workers are execution carriers, not cross-tenant OS security boundaries.

## Executed snapshot and open parity gaps

The immutable source snapshot `6c8c16975ab968da43266b21469a8ad7e0af9701`, root tree `412d55bb1565d4ad00e001514fb9ef436fc6b905`, was mirrored exactly into the verified-private `atto-lang/atto-source.rs` test branch at carrier commit `54f61853ff3f73191de45f14fd3d7647b02205bc`. [Carrier run 42920472681](https://github.com/atto-lang/atto-source.rs/actions/runs/42920472681) executed 13 job steps, 332 compiler/guest checks and real Chromium Wasm/ESM tests. The 274237-byte compiler SHA-256 was `1acd37c8f460aba821bfe791d268f37c5fa47599d152b2108cdacb90554ead9b`. These facts apply to that snapshot only. Carrier CI supplements origin checks; it does not bypass review or origin merge policy.

| Backend/path | Observed result | Remaining work |
| --- | --- | --- |
| Rust browser Wasm and ESM | Source actors, independent state and checked arithmetic execute | Full chapter 22 state/ownership/concurrency and runtime lifecycle contract |
| JS canonical-browser adapter | Same frontend emits ESM; distinct explicit profile | Converge legacy default scalar/program-v2 profiles and production Worker host |
| Wasm browser adapter | On-device canonical compiler emits browser v2 guest modules | Keep separate from LLVM/Clang bridge and its zero-import scalar host |
| Rust native Cranelift | Native tests execute; unchanged actor source rejects | Native nominal actors, receive, ownership and scheduler lowering |
| Independent Cranelift | Native scalar tests execute; actor fixture rejects with no IR/result | Native actors and portable target lowering |
| Java/GraalVM reference | Local differential run: 327 checks passed, five failed | Three eager-vs-short-circuit differences, actor shutdown/unordered-output race, one declaration admission difference |
| LLVM reference | LLVM19 compiler builds; same actor source rejects with zero IR | Reconcile native `pub on_message(int)` with `receive(ActorMail<int>)` source ABI |

The Java snapshot was head `6d8eb70048eafc9a84c5aebe9c1bb06104f16e76`; LLVM was head `0ee037ca3e5dd9ac6ac1e9cc3d40f19ee6326a9c`. The compiler integration's `browser/INTEGRATION_EVIDENCE.md` names the exact differing fixtures. No failed or unsupported positive case is a parity pass. Acceptance requires byte-identical `.atto` sources through each real compiler, matching values/output/failure behavior, negative admission checks, actual execution and immutable provenance as specified in chapter 11. A hosted job with no executed steps is NOT EXECUTED.
