# Map<K,V> mutation and lookup — v1 candidate

**Status:** candidate portable language contract; no backend is declared executable or conformant by this document. This proposal extends [inline collection literals v1](inline-collection-literals-v1.md) (candidate PR #69) and follows the already accepted [local binding mutability v1](local-binding-mutability-v1.md). The spec is normative for both compiler and formatter; front-end parsing alone is not an execution claim.

## Canonical example

```atto
pub fnc main(): int {
    let mut Map<string, int> x = {
        "foo" => 5
    };
    x.set("foo", 6);      // upsert existing key
    x["foo"] = 3;         // exactly the same update as set
    x.add("foo" => 7);   // insert-if-absent; returns false, leaves 3 intact
    x.add("bar", 7);      // inserted, returns true
    return x.get("foo").unwrap_or(0);
}
// expected exit: 3
```

The `=>` spelling inside `add` is **contextual entry-argument sugar**, not a general expression operator or a structural Record. `x.add(key => value)` and `x.add(key, value)` must resolve to the same `Map<K,V>.add` operation with receiver, key and value each evaluated exactly once in source order. A compiler may not blindly rewrite every `=>` argument or capture a shadowed user-defined method. Explicit nominal `Entry<K,V>` values (e.g. `Entry.of(k,v)`) are separate, compatible future overloads; they are not synthesized by this sugar.

## Binding, type inference and constructors

- `let mut Map<K,V> m = {...};`: both name rebinding and owned referent mutation are permitted, subject to the borrow checker. `val mut Map<K,V>` permits mutation but not rebinding. `let Map<K,V>` permits rebinding but **not** mutation. `val Map<K,V>` permits neither. Neither `mut` nor `val` overrides actor sealed state or ownership.
- `let mut m = new Map<K,V>();`: constructor carries explicit type parameters.
- `let mut Map<K,V> m = new Map();`: the expected type provides the constructor's parameters; never guess the types from subsequent `set` calls.
- `let mut Map<K,V> m = {};`: contextually typed empty literal, equivalent to empty typed construction.
- Bare `let mut m = new Map();` and `let mut m = {};` without other unambiguous type context fail with `E_INFER`. A constructor may not silently create `Map<any,any>`.
- `Map` here denotes the compiler-resolved built-in type, not a raw host-language hash table, user-shadowed class or arbitrary imported type. Any intrinsic lowering must establish the resolved symbol identity first.

The following literal contract from inline-collection v1 remains in force: `{"foo" => 1, "foo" => 2}` rejects `E_DUPLICATE` at compile time; **dynamically equal keys** evaluated during construction replace earlier values with last-value-wins and safe cleanup. Neither rule changes the behavior of a later `set`.

## Operations and results

| Operation | Type-level behavior | Missing or existing key |
| --- | --- | --- |
| `m.get(k)` | `Option<V>` for copyable scalar `V` in the first executable profile | `None` on missing; `Some(v)` on present |
| `m.set(k, v)` | `Option<V>` for copyable scalar `V` in the first profile | Insert or replace; return prior `Some(old)`, or `None` |
| `m[k] = v` | Indexed write, equivalent to `m.set(k, v)` with result discarded | Insert or replace; not a checked record-field write |
| `m.add(k, v)` | `bool` | Atomic insert-if-absent; returns `true` only for new key, `false` and preserves old value for duplicate |
| `m.add(k => v)` | Exactly `m.add(k, v)` after type-directed resolution | Same as above |
| `m.contains_key(k)` | `bool` | Does not transfer ownership of value |

`m.get(k)` is never silently coerced to `V`, so `pub fnc main(): int { ... return m.get("foo"); }` must reject with `E_TYPE` even if the literal has that key. The caller may use `unwrap_or(default)`, explicit presence handling, or an explicit, effect-checked unwrap API. This v1 does not define a bare `m[k]` **read**: do not fabricate a default or silently read a Record field. Checked bracket-read semantics need a separate contract.

The first executable backend slice may support only hashable `int`, `bool` and `string` keys and scalar `int` values, provided the profile is explicitly documented and unsupported types fail closed. The **portable target** is any hashable/equatable key type with stable value equality. `Map<K,V>` key hash/equality must agree, stay stable in storage and handle collisions independently of hash equality. UTF-8 strings compare by the agreed value-equality contract, not pointer identity. Never assume collision-free hashing.

Non-Copy values require a separate, verified borrow/owned-value policy for `get`, `set`, and displaced entries; returning a raw handle, duplicating mutable aliases or leaking a borrowed value out of scope is forbidden. Until that profile is implemented, reject with a defined unsupported diagnostic rather than pretending scalar `Option<V>` semantics generalize to all owned objects.

## Safety, execution order and actor isolation

1. `m.set(k,v)`, `m.add(k,v)` and `m[k]=v` require mutable access to the owned map and an exclusive admissible borrow. `let` alone never grants that authority; `mut` alone cannot bypass active loans.
2. Evaluate receiver, key and value exactly once, in that order. Preserve side effects, integer checked operations and traps/raises. For `add`, evaluate both arguments even if the key already exists, but do not publish or leak the unused value; release any consumed value according to ownership on failed insertion.
3. Mutation is transactional from the guest's perspective: allocation, hashing, equality, conversion or quota failure must not leave a partial entry, invalid value, stale pointer, double-drop or corrupted map.
4. Every lookup/mutation has explicit budget accounting: bounded memory and quotas, collision-resistant degradation policies and no unchecked host object escapes. Reject mismatched key/value types before guest execution where statically provable.
5. No direct access to another actor's map. Transport via checked `take!` or `copy!!` and the separate Sendable/Serializable contracts; read-only shared state and isolated tenant heaps remain isolated. `val mut` is not a transport capability.
6. Reserve concurrent access/invalidation semantics until the map borrow/lifetime policy is implemented; a method call cannot silently pin a mutable entry across `await` or another actor boundary.
7. `Record` keeps static field identity. `record["foo"]` is **not** rewritten to a dynamic `Map` write, and `record.foo = ...` does not grant map mutability.

## Negative cases and formatter requirements

- Invalid: `return m.get("foo");` in an `int` function (`Option<int>` is not `int`).
- Invalid: `let Map<string,int> m = {}; m.set("foo",5);` or `val Map<string,int> m = {}; m["foo"] = 5;` (read-only referent).
- Invalid: `let mut m = new Map();` (insufficient `K,V` inference), `Map<int,int>` with string key, or statically duplicate keys inside a map literal.
- Valid: `x.add("foo" => 7)` after `foo` exists evaluates to `false`, **not** an overwrite or an exception; `x.set("foo",7)` and `x["foo"]=7` overwrite.
- Invalid: attempting to mutate a map after `take!` or through a live read-only loan; trying an unsupported indexed target must remain fail-closed.

The formatter must round-trip `let mut Map<string, int>`, brace map entries, contextual `=>` within `add`, method calls and `m[k] = v` with AST/semantic equivalence. It must never change `=>` into `:`, reinterpret a `Map` as a `Record`, change `add` into `set`, or drop `mut`. Canonical spelling for the built-in type is `Map`; ordinary identifiers retain case.

## Verification gates

A backend is conformant only if real compiler-produced guest code (not a host/reference model) exercises actual allocation, collision handling, replacement, add-if-absent, missing-key `Option`, indexing mutation, ownership and cleanup. Pin executed evidence to exact source commit/tree, tests, toolchain and nonzero-step CI run. Keep all independent backend cells **NOT_EXECUTED** unless their own compiled-guest evidence passes. A parser/type-only pass is distinct from executable runtime conformance.

Related work: [atto-source.rs #274](https://github.com/atto-lang/atto-source.rs/pull/274) (parser/type preflight), [atto-source.rs #278](https://github.com/atto-lang/atto-source.rs/pull/278) (flow), [atto-source.rs #284](https://github.com/atto-lang/atto-source.rs/pull/284) / [#287](https://github.com/atto-lang/atto-source.rs/pull/287) (closed Record guest reads, **not** Map), [atto-source.rs #102](https://github.com/atto-lang/atto-source.rs/pull/102) (binding mutability), and legacy Java map factory [#2735](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2735) and nominal Entry [#1668](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/1668), to be semantically reconciled before merging.
