# 27 — Typed enum messages and whole-variant pattern aliases

**Status: TARGET / NOT CERTIFIED.** The source examples and conformance fixtures define semantics; they do NOT establish that any compiler executes them.

## Canonical example

```atto
use namespace jobs;

define enum WorkerMsg {
    Run { job_id: u64, payload: Bytes },
    Cancel { job_id: u64 },
    Stop
}

declare actor Worker;

mtd (Worker self) receive(msg: WorkerMsg): void {
    do match msg over
        on Run { job_id, payload } as r -> {
            self.run_job(r.job_id, r.payload);
        }
        on Cancel { job_id } as c -> {
            self.cancel_job(c.job_id);
        }
        on Stop -> {
            self.stop();
        }
    end
}
```

`define` is mandatory for top-level enum definitions; `on` introduces each arm. `do match` executes statements and has no value; ordinary `match` is an expression with type-compatible arm results. An explicit `return` inside `do match` returns from the enclosing callable.

`Run`, `Cancel` and `Stop` are nominal enum variants, not fields or `#symbols`. The known scrutinee enum resolves bare variant names. No leading dot is required or canonical. Write `WorkerMsg.Run` when qualification is needed; out-of-context construction likewise needs qualification unless its expected enum type is unambiguous.

## Target grammar

```ebnf
enum_decl      = "define" ["pub"] "enum" IDENT "{" variant {"," variant} [","] "}" ;
variant        = IDENT ["{" field_decl {"," field_decl} [","] "}"] ;
stmt_match     = "do" "match" expression "over" { "on" variant_pattern [guard] "->" statement_block } "end" ;
value_match    = "match" expression "over" { "on" variant_pattern [guard] "->" value_block } "end" ;
variant_pattern = [enum_name "."] IDENT [named_fields] ["as" IDENT] ;
named_fields   = "{" field_name {"," field_name} [","] "}" ;
```

A payload variant can be matched as `on Run as r` without spelling its fields. `on Run { job_id, payload } as r` binds named fields **and** the full narrowed variant. Unit variants use `on Stop`; `on Stop as s` is also legal. Field-level renaming such as `job_id as j` is DEFERRED to a distinct feature, not implicitly interpreted as a cast. More general nested patterns are separately specified.

## Alias lifetime and safety

- `as r` is a scoped **immutable borrow/view of the exact matched message**, not a copy, move, new heap object or deserialized temporary. It has the refined static case type `WorkerMsg.Run` and can project `r.job_id` / `r.payload`.
- The view exists only inside the chosen arm, including any relevant guard as defined by guard evaluation rules. No alias or reference projected from it may escape via return, actor send, field/storage assignment, captured task, or suspension without a separately proven safe ownership transition.
- Pattern fields and whole alias must have distinct local names. Reject duplicate field names, duplicate bindings and collisions with alias names. Failed patterns do not publish bindings.
- Explicit `rt take` of an owned field must satisfy the borrow checker; a live whole-variant borrow conflicts with the move. No hidden copy of non-Copy `Bytes` is permitted. No implicit mutable access or sealed actor-state access is granted.
- Evaluate the match subject exactly once; match arms are ordered; unresolved and unknown variants and non-exhaustive closed-enum matches fail compile-time diagnostics. A same-named variant on a different nominal enum does not match.

## Actor transport, AOT and conformance

Typed actor mailboxes check nominal enum identity. Same-process DATA messages use ownership-safe transfer, borrowing rules, or immutable sharing; serialization is NOT automatic unless the transport crosses a boundary that requires it. A verified transport codec may decode before the receiver; raw external bytes require an explicit decode or a declared auto-codec boundary. Runtime CONTROL events are authenticated and cannot be forged through a user enum.

Full guest AOT must use compile-time-known discriminants, layouts and statically checked projections; no runtime reflection or separate tracing-GC pass is required for this feature. A formatter keeps `on`, `do match` versus expression `match`, and necessary qualification. Negative conformance requires wrong variant, duplicate aliases/fields, alias escape, borrow conflicting with `rt take`, and implicit cross-enum casts to be rejected before executable IR.

The corpus in `tests/fixtures/enum-pattern-alias-v1` contains positive and negative **TARGET** fixtures only. No Java, LLVM, Wasm, Forge, or .NET implementation is claimed by their presence. Actual compiler runs, AOT artifacts, and immutable execution evidence must be reported independently.
