# 03 — Functions, Methods, Effects and Pipelines

**Status: DRAFT.**

A free function is declared with `fnc`; class and actor instance methods use an implicit `self` and canonically omit `fnc`. Callables have explicit or inferred return types where grammar permits. Each invocation returns **one value**; tuples/records are themselves one value.

## Signatures and visibility

```atto
pub fnc square(int x) -> int ::
  return x * x
end

define class Ledger as
  let int total: 0

  add(int amount) -> void ::
    self.total = self.total + amount
  end

  static fnc zero() -> int ::
    return 0
  end
end
```

The `-> T :: ... end` style is a documentation target; compatibility spellings remain backend-dependent until grammar parity is proved.

## Effect types

A callable can be annotated for potential `throws`, `raises`, `panics` or `suspends` effects. The compile-time effect set is an upper bound used for diagnostics and safe call admission; it is not a license to perform privileged operations. `trap` describes a non-throwing boundary for ordinary throw effects, but does not catch panics or cancellation. Precise declaration syntax and effect-polymorphic inference are still being reconciled.

`async`/`suspend` callables may yield a Future or a Task; the declared carrier type matters. Awaiting a value must not turn a borrowed stack address into a dangling alias or monopolize an OS thread.

## Purity and critical sections

`pure` functions have no externally observable mutation; source effects must obey their declared bound. `critical-read` and `critical-write` are explicit concurrency/lock admission modifiers or callback grants, not promises that the host has acquired a particular OS mutex. A critical write requires exclusive ownership of the protected region; read loans can coexist when no conflicting writer is active.

A critical loan **MUST NOT** leak through a returned pointer, task capture, suspension, actor turn, hot reload, or untrusted domain transition without a separately verified lifetime and capability proof. Await must not hold a blocking host mutex by default.

## Functional pipelines and actor pipelines

```atto
val normalized = raw
  |> trim
  |> parse_value
  |> validate
```

`|>` passes the previous value through a functional transformation. The target actor pipeline spelling is:

```atto
val graph = spawn Reader() pipe spawn Transformer() pipe spawn Writer()
```

`pipe` constructs an owned, typed connection graph. Only explicitly compatible actor pipeline roles may join it; supervisor/control messages cannot become data stages; cycle edges require separately bounded feedback channels. This is still a **source-lowering target**, not a claim that the pipeline expression executes on current LLVM/Java main.

The proposed first-class `Actor.pipe(...)` factory also accepts **nested, unstarted** pipe builders as sequential segments, with typed boundary ports, local capacity overrides and optional nested supervisor scopes. `Actor.pipe(...)` returns a deferred builder; only its outermost `.start()` attempts actor creation. The existing `pipe` keyword remains the immediate-spawn spelling, with the same observable graph semantics after startup. See [nested pipeline contract](14-nested-actor-pipelines.md).

## Macros and compile-time evaluation

`define macro` must expand or lower ahead of target runtime execution, be hygienic or explicitly expose controlled capture, produce source-mapped diagnostics, and be deterministic under a pinned toolchain. Macros cannot manufacture permissions or bypass import boundaries. Runtime reflection and runtime code evaluation are not implicit substitutes for macros. Cross-backend macro compilation and behavior require independent executable fixtures.
