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
    x.try_add("foo" => 7); // insert-only; false, leaves 3 intact
    x.try_add("bar" => 7); // insert-only; true
    return x.get("foo").unwrap_or(0);
}
// expected exit: 3
```

The `=>` token inside a brace Map literal denotes a map pair. In ordinary expression position, `key => value` constructs a first-class, immutable `Entry<K,V>` value, with `K` and `V` inferred when unambiguous or selected by an expected type. `x.add(key => value)` therefore uses the checked `add(Entry<K,V>)` overload (equivalent in effect to `x.set(key,value)`). Resolve the nominal Map/Entry symbols and method overloads first; never rewrite an unrelated user-defined `=>` form, a lambda or a shadowed `add` method. The same key/value/receiver single-evaluation and source-order rules apply.

## First-class `Entry<K,V>` values and explicit type ascription

The built-in `Entry<K,V>` is a nominal, immutable key/value pair; it is **not** a one-element Map, Record, Tuple or arbitrary lambda. An entry expression has the grammar `entry := key_expression '=>' value_expression`. Its key and value are evaluated exactly once, left to right. The result has an exact `Entry<K,V>` type after contextual checking or unambiguous inference. In a Map brace literal the same token delimits its map entries, rather than nesting an Entry object in the map. The grammar must not consume `=>` belonging to an existing lambda or pattern arm.

These are equivalent and must both be accepted:

```atto
let entry1 = ("foo" => 5) as Entry<string, int>;
let entry2 = "foo" => 5 (as Entry<string, int>);
```

- `(entry_expression) as Entry<K,V>` is a checked **whole-Entry type ascription** (not a general unchecked `x as T` cast); it checks the **whole** entry, not just the value.
- `entry_expression (as Entry<K,V>)` is a special trailing parenthesized type-ascription spelling, also applying to the **whole** entry. The sequence `(as` is reserved for this suffix in entry context, not a function call or an ascription of just the right operand.
- Both normalize to the **same typed AST**: `EntryExpr(key, value, expected_type=Entry<K,V>)`. An implementation may retain the source spelling separately for diagnostics and formatter round-trip. The formatter canonical spelling is `(key => value) as Entry<K,V>`; the alternative must still parse correctly.
- Generic arity must be exactly two; key and value must each be assignable to their corresponding generic parameters. A typed `Entry` may be held in a variable, passed to methods, returned or transferred under normal Atto ownership checks. An unrelated `as Map<K,V>` cast may never reinterpret an Entry.
- An untyped `key => value` expression is legal only when inference supplies non-ambiguous `K,V` or there is an expected `Entry<K,V>`; no implicit `any`/host value fallback. No Entry expression may bypass hashing/equality constraints when eventually inserted into a Map.
- File-scope entries require the existing unconditional typed `define const` declaration and a proven pure frozen constexpr initializer; ordinary top-level `let` remains invalid. A backend that cannot fold the Entry must reject it. Local `let` retains its existing rebinding semantics.

`Map<K,V>.add(entry: Entry<K,V>): Option<V>` performs the same checked **insert-or-replace** as `set(k,v)`; a duplicate key replaces the value, returning the previous value when copyable. `try_add(entry): bool` is the distinct insert-if-absent operation: it returns `false` and preserves the old value when a key already exists. In the initial copyable-scalar profile the call borrows a reusable Entry and copies its immutable key/value into owned Map storage. For non-copyable resources, require a proven ownership transfer/clone protocol (`take!` or `copy!!` when appropriate); storing a reference to a caller's temporary or active borrow is forbidden. `Entry` is not itself evidence of Sendable or Serializable conformance.

### Complete requested program (target contract, not yet a guest pass)

```atto
pub fnc main(): int {
    let entry1 = ("foo" => 5) as Entry<string, int>;
    let entry2 = "foo" => 5 (as Entry<string, int>);
    let mut Map<string, int> x = {
        "foo" => 5
    };
    x.set("foo", 6);
    x["foo"] = 3;
    x.add(entry1); // replaces 3 with 5
    x.add(entry2); // replaces 5 with 5
    return x.get("foo").unwrap();
}
// expected exit: 5
```

`get` returns `Option<V>`; `unwrap()` produces `V` on Some and signals the language's checked missing-value error on None. An unwrap is **not** an implicit conversion from `Option<V>` to `V`. In this particular example, the literal and sequential mutations establish the key exists. The actual guest implementation must still handle missing keys safely.

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
| `m.add(k, v)` | `Option<V>` in scalar profile | Insert-or-replace; alias of `m.set(k,v)` with the same ownership and previous-value contract |
| `m.add(k => v)` | Pass an inferred or contextually typed `Entry<K,V>` to `add(Entry<K,V>)`; `Option<V>` | Insert-or-replace, same as `set` |
| `m.add(entry)` | `Option<V>` in scalar profile; checked `Entry<K,V>` | Atomic insert-or-replace, including when the Entry is reusable |
| `m.try_add(entry)` | `bool` | Atomic insert-only; returns `false` for duplicate keys without replacement |
| `m.contains_key(k)` | `bool` | Does not transfer ownership of value |

`m.get(k)` is never silently coerced to `V`, so `pub fnc main(): int { ... return m.get("foo"); }` must reject with `E_TYPE` even if the literal has that key. The caller may use `unwrap_or(default)`, explicit presence handling, or an explicit, effect-checked unwrap API. This v1 does not define a bare `m[k]` **read**: do not fabricate a default or silently read a Record field. Checked bracket-read semantics need a separate contract.

The first executable backend slice may support only hashable `int`, `bool` and `string` keys and scalar `int` values, provided the profile is explicitly documented and unsupported types fail closed. The **portable target** is any hashable/equatable key type with stable value equality. `Map<K,V>` key hash/equality must agree, stay stable in storage and handle collisions independently of hash equality. UTF-8 strings compare by the agreed value-equality contract, not pointer identity. Never assume collision-free hashing.

Non-Copy values require a separate, verified borrow/owned-value policy for `get`, `set`, and displaced entries; returning a raw handle, duplicating mutable aliases or leaking a borrowed value out of scope is forbidden. Until that profile is implemented, reject with a defined unsupported diagnostic rather than pretending scalar `Option<V>` semantics generalize to all owned objects.

## Safety, execution order and actor isolation

1. `m.set(k,v)`, `m.add(k,v)` and `m[k]=v` require mutable access to the owned map and an exclusive admissible borrow. `let` alone never grants that authority; `mut` alone cannot bypass active loans.
2. Evaluate receiver, key and value exactly once, in that order. Preserve side effects, integer checked operations and traps/raises. For `try_add`, evaluate the Entry even if the key already exists, but do not publish or leak the unused value; release any consumed value according to ownership on failed insertion. For `add`, cleanup of the displaced old value follows `set`.
3. Mutation is transactional from the guest's perspective: allocation, hashing, equality, conversion or quota failure must not leave a partial entry, invalid value, stale pointer, double-drop or corrupted map.
4. Every lookup/mutation has explicit budget accounting: bounded memory and quotas, collision-resistant degradation policies and no unchecked host object escapes. Reject mismatched key/value types before guest execution where statically provable.
5. No direct access to another actor's map. Transport via checked `take!` or `copy!!` and the separate Sendable/Serializable contracts; read-only shared state and isolated tenant heaps remain isolated. `val mut` is not a transport capability.
6. Reserve concurrent access/invalidation semantics until the map borrow/lifetime policy is implemented; a method call cannot silently pin a mutable entry across `await` or another actor boundary.
7. `Record` keeps static field identity. `record["foo"]` is **not** rewritten to a dynamic `Map` write, and `record.foo = ...` does not grant map mutability.

## Negative cases and formatter requirements

- Valid: both `(\"foo\" => 5) as Entry<string, int>` and `\"foo\" => 5 (as Entry<string, int>)` yield the same typed Entry; both `x.add(entry)` calls in the program above replace the previous map value, with final result `5`.
- Invalid: wrong generic arity, mismatched Entry key/value types, `as Map<K,V>` for an Entry, malformed `(as Type)` suffix, or an Entry passed to a Map whose `K,V` are incompatible.
- A formatter must preserve Entry value identity, cast target, and evaluation order when canonicalizing the trailing parenthesized suffix; the canonical result is `(key => value) as Entry<K,V>`.

- Invalid: `return m.get("foo");` in an `int` function (`Option<int>` is not `int`).
- Invalid: `let Map<string,int> m = {}; m.set("foo",5);` or `val Map<string,int> m = {}; m["foo"] = 5;` (read-only referent).
- Invalid: `let mut m = new Map();` (insufficient `K,V` inference), `Map<int,int>` with string key, or statically duplicate keys inside a map literal.
- Valid: `x.try_add("foo" => 7)` after `foo` exists evaluates to `false` without overwrite; `x.add("foo" => 7)`, `x.set("foo",7)` and `x["foo"]=7` all overwrite.
- Invalid: attempting to mutate a map after `take!` or through a live read-only loan; trying an unsupported indexed target must remain fail-closed.

The formatter must round-trip `let mut Map<string, int>`, brace map entries, contextual `=>` within `add`, method calls and `m[k] = v` with AST/semantic equivalence. It must never change `=>` into `:`, reinterpret a `Map` as a `Record`, change `add` into `set`, or drop `mut`. Canonical spelling for the built-in type is `Map`; ordinary identifiers retain case.

## Verification gates

Entry-specific gates: both typed ascription spellings (including independently proven file-scope `define const` bindings), AST equivalence, generic arity/type negatives, `add(Entry)` upsert and distinct `try_add(Entry)` no-overwrite execution, exactly-once key/value evaluation, reusable Entry storage ownership, missing-key `unwrap()` failure behavior, and parse-format-parse/idempotence. Both compiler and formatter must retain entry-versus-Map-brace-vs-lambda distinctions. Runtime and security evidence must be collected for each target independently.

A backend is conformant only if real compiler-produced guest code (not a host/reference model) exercises actual allocation, collision handling, replacement, try_add insert-only, missing-key `Option`, indexing mutation, ownership and cleanup. Pin executed evidence to exact source commit/tree, tests, toolchain and nonzero-step CI run. Keep all independent backend cells **NOT_EXECUTED** unless their own compiled-guest evidence passes. A parser/type-only pass is distinct from executable runtime conformance.

Related work: [atto-source.rs #274](https://github.com/atto-lang/atto-source.rs/pull/274) (parser/type preflight), [atto-source.rs #278](https://github.com/atto-lang/atto-source.rs/pull/278) (flow), [atto-source.rs #284](https://github.com/atto-lang/atto-source.rs/pull/284) / [#287](https://github.com/atto-lang/atto-source.rs/pull/287) (closed Record guest reads, **not** Map), [atto-source.rs #102](https://github.com/atto-lang/atto-source.rs/pull/102) (binding mutability), and legacy Java map factory [#2735](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2735) and nominal Entry [#1668](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/1668), to be semantically reconciled before merging.
