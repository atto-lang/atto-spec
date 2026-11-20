# Actor creation effect: `spawns` (v1)

**Status:** proposed normative AttoLang contract (2026-11-19). **NOT compiler-verified or runtime-verified.** This contract changes the desired language rules; it does not certify any `atto-source.*` implementation.

## Decision

Any callable whose reachable body directly executes `spawn A(...)`, activates actors through a spawn-capable factory, or calls a callable declaring `spawns` MUST itself declare `spawns`. Actor creation remains available inside ordinary actor handlers, helper functions, callbacks, and `main`; it is not restricted to special supervisor classes.

`define actor Parent` is **not** marked `spawns`; the marker belongs to individual actor **methods**, including `receive`, that can spawn. A method may be marked `spawns` even if it currently does not spawn (an upper bound). Merely declaring, referring to, sending to, looking up, or constructing a non-activating virtual reference to an actor is not `spawns`.

`spawns` is a **static effect declaration, not a runtime permission grant**. A successful compile cannot bypass TenantVM/actor/tenant authorization or resource accounting.

## Syntax and canonical order

```ebnf
spawn_effect          = "spawns" ;
susp_effect           = "susp" | "suspends" ;
callable_modifiers    = [ "pub" ], [ "pure" ], [ susp_effect ], [ spawn_effect ] ;
named_callable        = callable_modifiers, ("fnc" | "routine"), identifier, signature, body ;
actor_receive         = [ "pub" ], [ susp_effect ], [ spawn_effect ], "receive", signature, body ;
member_callable       = [ "pub" ], [ "static" ], [ susp_effect ], [ spawn_effect ],
                        ("mtd" | "method" | "fnc"), identifier, signature, body
                      | [ "pub" ], [ susp_effect ], [ spawn_effect ],
                        identifier, signature, body ;
function_type         = [ susp_effect ], [ spawn_effect ], "fnc", "(", [types], ")", "->", type ;
lambda                = [ susp_effect ], [ spawn_effect ], "|", [params], "|",
                        [":", type], "->", body ;
```

Canonical formatter order is `pub susp spawns fnc`, `susp spawns receive`, or `spawns fnc` if no suspension is needed. A parser MAY admit `spawns susp` order and normalize it to `susp spawns`, but must reject duplicate markers. `suspends` remains the supported alias of `susp`. Whole-token recognition is required: `spawnster` is not `spawn`, and `spawns_extra` is not `spawns`.

`spawns` and `susp` are independent dimensions: a direct local `spawn` MAY complete without suspension, and a suspending method need not spawn. `pure spawns` is contradictory and MUST be rejected; `pure` never masks or authorizes actor creation. `spawns` is part of function/callback type identity, and MUST NOT be erased by higher-order calls, imports, dynamic dispatch, or AOT lowering. Do not choose overloads solely from effects.

## Example: supervisor -> parent -> child

```atto
define actor Child receives int as
  susp receive(ActorMail<int> mail): void { }
end

define actor Parent receives int as
  susp spawns receive(ActorMail<int> mail): void {
    val child = spawn Child();
    child.send(mail.value);
  }
end

pub susp spawns fnc main(): int {
  val parent = spawn Parent();
  parent.send(42);
  return 0;
}
```

The shape above is the **target syntax**, not a currently executable certified fixture. `Child.receive` does not spawn, so it does not need `spawns`. `Parent.receive` spawns a child, and `main` spawns a parent; both require `spawns`. There is **no transitive effect from a later mailbox delivery**: `main` does not need to inherit every effect that `Parent.receive` may execute later.

`send` is admission, **not processing/completion**; returning from `main` immediately after `send` does not prove the child processed `42`. A separately specified join/completion protocol is required for that guarantee.

## Static checking

1. The direct `spawn` expression has a required `spawns` effect. A reachable direct spawn in a callable without the declaration fails `E_SPAWNS_REQUIRED`; a reachable call to another `spawns` callable has the same requirement. Effect propagation follows reachable synchronous and suspending call edges (and effect-bearing callback invocations), not message delivery to an actor whose handler happens to spawn.
2. All static call variants (method, trait/interface dispatch, generics, imports, factory methods, closures, callable values) retain effect identity. Dynamic or unknown targets require a checked upper bound including `spawns` or fail closed. No ambient `spawns` may be inferred from actor membership.
3. A helper that can spawn has `spawns` in its signature. The caller must also declare it; the callable remains allowed to delegate through helpers rather than being forced to put `spawn` inline in `receive`.
4. Duplicate `spawns` fails `E_SPAWNS_DUPLICATE`; `pure spawns` fails `E_PURE_SPAWNS`; erasing a `spawns` callback into a non-spawning callable type fails `E_SPAWNS_EFFECT_MISMATCH`. The parser must not silently accept an annotation and lower it as a no-op.
5. Where `spawns` cannot be lowered safely, a compiler MUST report a typed unsupported-feature diagnostic; it MUST NOT emit a guest that performs unchecked actor activation.
6. Existing `susp`, explicit failures (`throw`/`raise`/`panic`), ownership, tenant scopes, critical sections, and sealed actor state have separate rules. `spawn` inside a critical read/write callback MUST be rejected unless an independently verified non-reentrant admission mechanism is specified: default diagnostic `E_SPAWN_IN_CRITICAL`. Do not let user code execute while an actor state lock is held during activation.

## Spawn authorization and runtime invariants

- Child creation is **atomic with respect to authorization, budget reservation, actor ID/generation allocation and parent/supervisor registration**. On failure rollback every reservation; no live orphan, leaked actor ID authority, or partially published ActorRef.
- Default child ownership/lineage: the currently executing **actor incarnation** (or `main`'s root supervisor scope) is the child's logical creator/parent. Supervisory failure policy is explicit and tied to the authorized supervisor; the child is never silently detached or adopted by a process-global singleton. On a helper call, current execution context decides parent, not the helper definition site.
- By default the child stays in the **same TenantVM and security domain**. Cross-tenant creation is not implied by `spawns` and requires separate privileged, authenticated brokerage, explicit target-tenant consent and a narrowly scoped delegation token. No raw cross-tenant mutable sharing or implicit host I/O access.
- A spawn-capable actor still needs runtime permission. Validate tenant generation, allowed actor type/constructor, max live actors, total memory, CPU allocation, mailbox slots, actor depth, spawn rate/burst, and parent lifecycle state. An untrusted actor receives only explicitly delegated capabilities; it cannot elevate itself by spawning.
- Stop/restart/timeout/cancellation must fence parent generations and outstanding spawn operations. A late child may not appear after the parent was retired unless an explicit authorized reparenting policy commits before retirement. Supervisor restart strategy and orphan handling must be deterministic and observable.
- A failed authorized attempt yields a typed, catchable `SpawnError` (or an explicit checked `Result` API once standardized), **never** a fabricated live reference, silent success, process termination, or an uncatchable actor `panic`. `trap spawn Child()` should follow the independent `trap`-to-`Result` contract; the precise emitted error ABI remains a parity gate. Distinguish `PermissionDenied`, `QuotaExceeded`, `ParentRetired`, `Cancelled` and `Unsupported` in the error domain without leaking other-tenant existence.
- A successful child ref does not grant sealed-state access, arbitrary socket access, permission delegation, or an implicit cross-process route. `ActorRef` generation and mailbox admission continue to be checked on every send.

## Required conformance and migration

The accompanying source-expected-case registry is `contracts/actor-spawns-effect-v1.json`; it records **target** acceptance/diagnostics only. Test parser/formatter normalization, AST+typed MIR effect sets, direct and indirect calls, suspending vs non-suspending code, actor `receive`, callable values/generics, duplicate/pure annotations, critical-section rejection, guest runtime spawn/rollback, quotas, parent retirement races, tenant isolation and actual child receive execution on **each** backend.

This is a breaking requirement for previously accepted `spawn` callables without `spawns` (including current sample fixture `atto-source.rs/tests/fixtures/pass/67-actor-two-instances.atto` and other backends). Stage a fixture/compiler migration with exact-head positive **and negative** diagnostics; do not label legacy accepted code as a conforming v1 program. Record backend status as `NOT_EXECUTED` until actual compiled .atto guest verification. Do not equate a host-side simulation, source-free schema test, compiler parse success, or an Actions job with zero steps to execution.

Related existing proposals: `language/susp-effect-shorthand-v1.md`, `language/actor-registry-v1.md`, `language/trap-result-v1.md`; coordinate with `atto-source.rs` typed actor receiver and failure-effect PRs, `atto-platform-conformance` actor tenant contracts and `atto-format`.
