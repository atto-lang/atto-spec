# Typed task payloads, `sync` reservation and scoped ownership v1

**Status: normative TARGET proposal, NOT compiler/backend guest certification (2026-11-19).** This adds task-specific typing and spelling rules without weakening `susp`, implicit argument borrowing, ownership, `using` cleanup, or TenantVM isolation. An unimplemented compiler MUST reject before emitting a guest artifact.

## Grammar and type judgment

```ebnf
task_expr         = "task", [ "<", task_payload_type, ">" ], task_body ;
task_body         = "{", { statement }, "}" ;
joined_task_expr  = ( "await" | "sync" ), task_expr ;
discard_task_stmt = "do", [ "sync" ], task_expr, [ ";" ] ;
task_payload_type = type_ref ;  // includes void and Future<U>
```

`sync` is a **reserved whole-word keyword**. It is not a legal identifier, generic parameter, field, method, package alias or user-defined type, and must not match identifier prefixes like `synchronize`. It has **no bare sync-block, host-thread blocking, mutex, or implicit-I/O meaning**. The `task` word may remain contextual outside this grammar for migration compatibility, but any matching `task<...> { ... }` or `task { ... }` must parse as the task construct or fail closed, never silently become comparison expressions.

`task<T> { body }` declares **the payload T**. Its expression type is **`Future<T>`**, not T and not `Future<Future<T>>`. `task<Future<T>>` explicitly yields `Future<Future<T>>`: no auto-flattening. An inferred `task { body }` infers T from all reachable return paths; a contextual expected `Future<T>` can supply T without inventing coercions. For an unprovable or contradictory result, reject with `E_TASK_RETURN_INFER` / `E_TASK_RETURN_TYPE`. All non-void body paths must return T. `task<void>` may only return without a value. Task-body `return` exits its child task, not the parent callable.

```atto
pub susp fnc example(): int {
  val Future<int> pending = task<int> { return 42; };
  val int result = await pending;
  val int also = sync task<int> { return 0; };
  return result + also;
}
```

`await task<T> { body }` and `sync task<T> { body }` must lower to the **same typed join operation**, producing T. Both require an enclosing `susp` callable and are suspension sites, including if the result is already ready for effect checking. They MUST NOT block a scheduler/actor carrier or manufacture additional privileges. Whether an already-ready await forces a physical yield is a separate, versioned scheduler fairness policy; the two spellings must not diverge.

`do task<T> { body }` schedules a **supervised** child whose result is intentionally discarded by the parent expression; the statement itself has type void. `do sync task<T> { body }` is a contextual alias of exactly this form, **not** an await-and-discard: in a `do` task statement the optional `sync` is syntactic sugar removed before effect checking. Without the `do`, `sync task` always joins. A discarded Future does not detach from TaskScope or lose its exception/cancellation/physical-retirement obligations. A value-returning discarded task is permitted, but its result is not readable through that statement; diagnostics/lints may flag likely accidental discards.

The existing lexical `block { ... }` is NOT redefined to spawn work by this v1 change. Its prior proposal to alias `do task` conflicts with a current sequential block grammar and requires an explicit, separately reviewed migration. Ordinary `{ ... }` remains a lexical sequential block.

## Ownership, borrows and scoped lifetime

Every spelling maps to one canonical typed TaskSpawn + optional TaskJoin/TaskDiscard MIR path with identical borrow facts:

1. Evaluate task capture expressions exactly once at submission, in source order. A child task has its own continuation/stack and a verified task scope. A captured independent owned value requires explicit `take!` and a transitive, compiler-proven `Send` witness; a value copied into the child requires `Copy + Send` and a distinct valid owned child slot. No implicit move, clone, sharing, or capability grant is inferred from task syntax.
2. `borrow!` or implicit argument borrowing never becomes an owned `Send` task capture. A scoped, immutable borrowed capture may be admitted ONLY with an exact compiler-bound TaskScope region and runtime-guaranteed physical descendant quiescence before the lender can be moved/dropped; lacking that proof, reject `E_TASK_BORROW_ESCAPE`. Mutable task captures, overlapping exclusive loans and returning a borrowed captured object beyond the owner lifetime are rejected unless a separately certified exclusivity/lifetime profile proves them.
3. At `await` / `sync task`, live ordinary loans must have a proven suspension-safe continuation lifetime and pinning/layout policy or be rejected with `E_SUSPEND_WITH_LIVE_LOAN`; synchronous critical lock/state leases may not span suspension. `do task` does not evade these checks for its child and does not retain unsupervised stack references.
4. A `Future<T>` handle has linear/affine ownership and verified result-observation semantics as defined by the runtime contract; observing it may not implicitly transfer T twice. Awaiting exactly one future layer preserves an inner Future. Discard cannot bypass supervisor error reporting.
5. Parent scope return, throw, raise, cancellation, timeout, actor teardown and TenantVM termination must cancel/join or otherwise physically retire all task descendants before recycling borrowed storage. Failed admission must roll back ownership transfer, without losing an owner or double-dropping it. Cleanup is exactly once where the termination model permits it.
6. Actor-owned tasks remain in their own tenant's authorized scheduler/TenantVM. No ambient I/O/socket, actor-heap alias, cross-tenant capability or supervisor CONTROL queue access is obtained by task creation or `sync`. An untrusted guest cannot forge an owned Future, continuation, runtime schedule ticket or proof marker. Fail closed on unknown IR facts, non-Send graphs, pin-domain uncertainty, FFI, missing tenant grants, or unknown lifecycle fences.

## Formatter rules

The formatter MAY normalize `do sync task<T> { B }` to `do task<T> { B }` only when the matched syntax is proven, preserving comments, literals, nested generics, task body and source maps. It MUST NOT rewrite stand-alone `sync task` to `do task`, change `task<T>` into `task<Future<T>>`, rewrite `block` into `do task`, or drop an `await`. Normalization must be idempotent and parse-/effect-equivalent; release-level equivalence additionally needs real compiler guest comparisons.

## Positive and negative matrix (target)

| Source form | Expected |
| --- | --- |
| `val Future<int> x = task<int> { return 42; };` | Future<int> |
| `val int x = await task<int> { return 42; };` | int, susp context |
| `val int x = sync task<int> { return 42; };` | same as await, susp context |
| `do task<int> { return 42; };` | supervised spawn, void statement |
| `do sync task<int> { return 42; };` | identical supervised spawn and supervision |
| `val Future<Future<int>> x = task<Future<int>> { return task<int> { return 42; }; };` | nested Future preserved |
| `val int x = task<int> { return 42; };` | E_TASK_RETURN_TYPE |
| `val Future<int> x = await task<int> { return 42; };` | E_TASK_RETURN_TYPE |
| `task<int> { return "wrong"; }` | E_TASK_RETURN_TYPE |
| `task<int> { return; }` | E_TASK_RETURN_TYPE |
| `sync task<int> { return 42; }` in non-susp fnc | E_EFFECT |
| `val sync = 1;` | E_RESERVED |
| child moves borrowed parent owner or holds ordinary loan across await | E_BORROW_CONFLICT / E_TASK_BORROW_ESCAPE / E_SUSPEND_WITH_LIVE_LOAN |
| child crosses tenant boundary without an authorized channel/capability | E_TENANT_BOUNDARY |

Verification: check tokens, parser AST equivalence, effects, typed MIR, ownership path, formatter round-trip and negative no-artifact diagnostics. Then run actual .atto guest fixtures on each backend, with exact source SHA/tree, toolchain and meaningful successful steps. Host-only Rust/Node model tests do not certify a compiler. Status for every backend begins NOT_EXECUTED until independent evidence proves otherwise.

## Dependencies / compatibility

This contract refines `susp-effect-shorthand-v1`, `implicit-argument-borrow-v1`, `ownership-vocabulary-v1`, `scoped-resource-timeout-v1` and the explicit nested Future rule. Inspect the existing Rust async source integration, Java Task implementation and candidate Mutex #125 before claiming readiness. Do not merge divergent TaskScope/capture implementations without ownership and effect reconciliation.
