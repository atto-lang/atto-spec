# Structural member witnesses for ~ / `structural` (candidate v1)

**Status: NORMATIVE TARGET, NOT BACKEND PARITY.** This refines the contextual structural alias of [structural-tilde-v1.md](structural-tilde-v1.md) and the open-readonly shape rules in [anonymous-structural-shapes-v1.md](anonymous-structural-shapes-v1.md). Only explicitly verified limited Rust/Wasm class-field subsets currently execute. Interface/trait method dispatch and cross-kind aggregate projection are **not** claimed to execute.

## One operator, one structural witness

In type and `is`-test positions, `~T`, `~ T` and `structural T` request the **same** structural witness, with the same typed AST, source provenance, type environment and diagnostic class. Whitespace/comments may separate sigil and operand. `T` without a modifier retains its own nominal/exact identity.

A witness proves **every** required externally accessible instance member in the requested declaration. It is conjunction, never “any member matches,” name-only duck typing, implicit cast, reflection, inheritance, a pointer reinterpretation, or a newly granted capability. Additional actual members are allowed for a **read-only** structural view. Member satisfaction is not proof that host representation, ABI, vtable or ownership layouts are interchangeable.

| Referenced kind | Structural requirements of `~T` | Special restriction |
| --- | --- | --- |
| Interface | Every exported required instance method with a compatible callable contract; no instance data assumed | A default/inherited implementation counts only if safely callable and visible |
| Trait | Every exported required instance method **and** declared readable state/property requirement; concrete trait defaults count only with validated dispatch | No assumption that a trait owns storage |
| Class | Every externally visible required instance data field/property **and** instance method, including public inherited obligations | Private/protected fields, static methods, constructors and sealed actor state are not projected |
| Struct | Every required externally readable data field and public instance method | Preserve value identity, layout and ownership; no cross-layout pointer cast |
| Record | Each statically named required field with its type, plus explicitly declared instance methods if any | A read-only structural projection admits extra fields; a non-structural closed Record type retains its exact row |
| Tuple | Positional element types **and exact required arity** | Do not silently truncate/extend tuples or equate them with arrays/lists |
| Map | Key/value type obligations and validated instance mapping operations | `Map<K,V>` alone proves **no particular key exists**; a named-key shape requires explicit safe key-presence evidence |

A concrete implementation of `~Interface` may use unrelated nominal declarations. `~Class` intentionally requires more than `~Interface` if the class exposes additional public fields or methods. “All data” means **all members in the exported instance contract**, never private internals or actor state.

## Member compatibility and checked method dispatch

Each required instance method must resolve to an unambiguous accessible implementation with compatible receiver mode, overload/arity, parameter labels and order, generic-parameter constraints, argument passing/ownership, return type and returned ownership, async/suspension behavior, declared throws/raise/panic effects, and capability requirements. Exact type equality is a conservative sufficient proof; variance is permitted **only** where the canonical type and ownership system proves argument contravariance and result covariance. An implementation cannot require *additional* effects, permissions, stronger preconditions or lifetime constraints than the requested contract. Mutating receivers cannot satisfy a read-only callable requirement; read-only receivers cannot be silently promoted to mutable. No dynamic method name lookup, reflection, or arbitrary `Any` fallback is authorized.

A required readable field needs a proven accessible slot/property with compatible read type; for a read-only view, safe covariance may apply. A writable field needs a separate invariant/exclusive loan proof and matching write type. Methods do **not** count as fields and a getter cannot count as an ordinary field if it has observable effects, throws, suspends, captures capabilities or changes state. Zero/default fields and method defaults are not runtime evidence of singleton types or ownership. Structural matching must not bypass checked borrowing, `Sendable`, tenant capability boundaries or actor state access rules.

A shape witness is compiler-owned data: target kind, field slots, method dispatch plan, generic instantiations, visibility, effects, source lifetime, readonly/exclusive mode, and (where relevant) snapshot/key proofs. Cache per relevant type/environment/tenant and invalidate after hot-loading. If a backend cannot represent the proven witness in its guest ABI, it **MUST fail closed before code emission** rather than pass the original source object as a different nominal pointer or synthesize a method table.

## Aggregates, open rows and maps

- `~{foo: int}` / `structural {foo: int}` denotes an open read-only required-field shape. `Record<{foo:int}>` without `~` remains the distinct closed row syntax established by the Record contract. Field order does not change structural shape identity, but initializer evaluation order remains unchanged.
- `~Tuple<int,string>` requires position 0 to have a compatible `int`, position 1 `string`, and the tuple arity exactly 2. A generic `List` or `Array` is not automatically a Tuple witness.
- `~Map<string,int>` is a *mapping protocol* obligation, not a compile-time assertion that key `"foo"` exists. A `Map<string,int>` must not satisfy `~{foo:int}` based solely on the generic key type; use an immutable snapshot/atomic checked lookup with a genuine key-presence proof and type validation. An absent key is different from a present null-like value. Dynamic-map structural adapters stay unsupported without that implementation.
- Generic collections have distinct APIs and identity: Record, Struct, Map, Tuple, Array and List are not automatically interchangeable just because their element types overlap. If nominal type metadata or callable adapters are missing, report unsupported.
- Struct/Class/Record nominal or concrete storage may satisfy a compatible read-only field view, but shape projection must use the **actual** field offsets and verified method dispatch, never the requested type's offsets. Mutable width subtyping is rejected unless separately specified and proved.

## Safe examples — semantic target only

The following are **declaration-independent pseudo-fixtures** until interface/trait grammar and dispatch are compiler-verified:

- Required interface methods `read(int): string` + `close(): void`: an unrelated class with **both** public compatible methods satisfies `~Interface`; one missing `close` does not.
- Required trait method `read(): string` + state `id:int`: a class with just `read`, or just `id`, fails `~Trait`.
- Required class `Point` public `x:int`, `y:int` and `distance(): int`: a structurally compatible struct may satisfy the read-only view without class inheritance, **only** with a checked field + method witness.
- Named `{foo:int}`: a Record with `foo` and extra `bar` can match; an arbitrary `Map<string,int>` cannot claim `foo` exists.
- Requested `Tuple<int,string>`: `Tuple<int,string,bool>` fails because arity differs, even though two leading elements match.

## Syntax, diagnostics, verification

Keep separate AST discriminants for `on is ~T` type tests and `on ~value` field-value matching. The old `~map(...)`/`~tuple(...)` constructors are forbidden; use `Map.of(...)`/`Tuple.of(...)`. A formatter must preserve structural context and must not insert/remove `is`, erase effects, or reinterpret method contracts.

Use precise failure categories: missing/inaccessible field, missing/ambiguous/incompatible method, tuple arity, unproven map key, forbidden effect/ownership, unsupported witness ABI. Diagnostics must refer to the full required contract and actual candidate. Do not report a compiler PASS for schema-only checks.

The companion [structural-member-witness-v1.json](../conformance/structural-member-witness-v1.json) and reference tests provide **source-free host-model** examples, including negative cases. They neither execute Atto programs nor prove a backend. Every Atto compiler, the shared conformance registries, `atto-format` and `oreslang-format` must independently demonstrate parser + checked IR + guest behavior, effect/ownership negatives, exact commit SHA, and fail-closed ABI before claiming support. Unsupported kinds stay explicitly rejected.
