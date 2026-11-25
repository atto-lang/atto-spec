# 28 — Explicit initialization and no implicit default values

**Status: PROPOSED / NOT EXECUTED.** This chapter defines a cross-cutting target for source-visible initialization. It is normative only when adopted; it does not certify any compiler backend. It complements [type-first constant bindings](27-implicit-const-and-const-mut.md), [class-field binding defaults](../language/class-field-binding-defaults-v2.md), [struct field initialization](../language/struct-field-equals-v1.md), and [constructor definite initialization](../language/out-of-line-receivers-constructors-and-state-v1.md).

## Decision

AttoLang has **no implicit default-value or zero-value initialization**.

A source program must explicitly provide every value. A binding, field, aggregate element, or collection slot does not acquire a value merely because storage exists, a type has a familiar zero value, a host runtime zeroes memory, or a constructor was omitted.

This rule is about values, not bytes. A backend may use zeroed or uninitialized physical memory internally, but that implementation detail must be unobservable: it must never satisfy a source-level initializer, authorize a read, escape through FFI, or publish a partially initialized object.

The rule is independent of type and backend. There are no primitive-type, reference-type, generic-type, platform, optimization-level, AOT/JIT, or debug/release exceptions.

## Local bindings

Every local variable declaration MUST contain an initializer expression at the declaration:

```atto
let int retries = 0;
val bool enabled = false;
let string name = "";
let Option<int> selected = None;

// Runtime initialization is explicit too.
let int configured_limit = read_limit();

// Type-first local shorthand is compile-time const under chapter 27.
int hard_limit = 42;
```

The following are invalid, even if a later statement would assign the variable before any read:

```atto
let int retries;
val bool enabled;
int hard_limit;
const int answer;
```

A declaration without an initializer MUST be rejected with the semantic category `missing_initializer`. Implementations must not silently insert zero, false, an empty string, `None`, `nil`, `null`, an empty collection, or a type-specific value.

This is deliberately stricter than definite-assignment-only languages: local storage is initialized as part of the declaration, not by a later assignment. Use an explicit initial value, an explicit `Option<T>`, or a helper that returns a fully formed value.

Binding keywords remain orthogonal:

- `let` permits rebinding; `val` prohibits rebinding.
- `const` requires the compile-time rules of chapter 27.
- `mut` requests referent-write authority; it does not initialize storage.
- `final` has the separately specified single-assignment lifecycle for fields.
- None of these modifiers supplies an omitted value.

The contextual `const` used by `if expression as const name`, destructuring, or iteration retains its own binding semantics. Its matched value still comes from an explicitly evaluated source expression; contextual syntax does not create a default.

## Class fields and constructors

Every required instance field MUST receive an explicit value before the instance can be read, returned, shared, passed to another actor, stored in a published container, or otherwise escape construction.

A field is initialized by exactly one of these explicit mechanisms:

1. A field initializer written in the declaration; or
2. An explicit constructor assignment that the compiler proves occurs exactly once on every successful construction path before any read or publication.

No implicit field initializer is synthesized. In particular, `int count;` does not mean `int count = 0;`, and a reference field does not silently become null.

A field without a declaration initializer is not automatically an error if the language's field lifecycle explicitly permits constructor initialization (for example, a supported `final` field). The constructor must prove complete initialization across all branches, loops, early returns and exceptional exits. A backend that cannot prove the obligation must reject construction; it must not guess a value or expose partially initialized `self`.

The implicit `val` class-field binding rule in [class-field-binding-defaults-v2](../language/class-field-binding-defaults-v2.md) controls whether the field binding can be replaced. It does **not** define an initializer or provide a default value.

A failed constructor must unwind only those subobjects that were successfully initialized, exactly once. An under-construction object and its uninitialized fields must never escape, including through callbacks, closures, actor messages, FFI, exceptions, or a published handle.

## Structs, records, tuples, enums and collections

- A struct or closed record literal must supply every required field, unless that specific declaration explicitly defines a supported field initializer. Omitted fields are errors; no zero-value fields are synthesized.
- A tuple construction must supply exactly the declared number of elements. It is never padded with zero, null, or an empty value.
- An enum/ADT value must name a valid variant and explicitly provide that variant's required payload. Omitted payload values are not synthesized.
- A collection allocation must initialize every observable element before returning the collection. A length-only allocation that exposes uninitialized elements is not admitted. An explicit fill value, initializer function, or list of values is acceptable only where its evaluation and ownership rules are specified.
- Optional values are explicit: write `None` or `Some(value)`. A missing optional binding is not shorthand for `None`.
- A type's `Default`, `zero`, or equivalent capability is never invoked implicitly. If a type provides a default factory or zero-argument constructor, the program must call it explicitly. The called operation must itself return a fully initialized value.

The existing [struct-field initializer contract](../language/struct-field-equals-v1.md) remains responsible for exact nominal field resolution and source-order evaluation. This chapter supplies the global prohibition against omitted-value synthesis; it does not broaden struct-literal syntax.

## Evaluation, storage and unsafe boundaries

1. Evaluate each initializer exactly once, in the source order required by the applicable declaration or aggregate contract.
2. Do not reorder effectful expressions to match field layout or physical storage order.
3. Reject reads, borrows, moves, serialization, hashing, comparison, drop hooks that inspect fields, and publication of any value before all of its required storage is initialized.
4. FFI, raw memory, deserialization, arenas and allocator APIs must establish and validate initialization before a value enters ordinary AttoLang code. An unsafe boundary cannot turn arbitrary bytes into a valid initialized value.
5. A failed initializer or constructor must not leave a partially valid object observable. Cleanup runs exactly once for the successfully initialized portion.
6. An optimizer may elide or combine explicit initialization only when it preserves the same value, identity, effects, ownership, drop behavior and observable initialization order.

## Scope boundaries

- File/module `define const` retains its separately specified compile-time or startup-once initializer rules. Those are explicit initializers; the environment-read exception is not a default-value mechanism.
- Actor state and attached class state retain their own lifecycle and guard rules. Every state slot must have a declaration initializer or an explicitly proven lifecycle assignment before the first state read or actor publication.
- This chapter does not require a particular memory allocator, object layout, stack/heap placement, or byte pattern.
- This chapter does not prohibit explicit literal values such as `0`, `false`, `""`, or `None`; it prohibits inserting them without source intent.
- A constructor or factory may deliberately return a zero-valued object, but the call must be explicit and its implementation must initialize every required field.

## Required diagnostics and conformance

The portable contract must include at least these cases:

| Case | Required outcome |
| --- | --- |
| Explicit scalar zero, false and empty-string initializers | Accept |
| Explicit `None` and `Some(value)` | Accept |
| Local declaration without an initializer, followed by later assignment | Reject: `missing_initializer` |
| Type-first local without an initializer | Reject: `missing_initializer` |
| Class field omitted from both initializer and constructor assignment | Reject: `missing_field_initializer` |
| Constructor fails to initialize a required field on every successful path | Reject: `incomplete_initialization` |
| Struct/record literal omits a required field | Reject: `missing_field_initializer` |
| Tuple omits or pads an element | Reject |
| Collection exposes an uninitialized element | Reject |
| Implicit `Default`/zero-value synthesis | Reject |
| Explicit constructor/factory that fully initializes a value | Accept |

Negative cases must fail before executable artifact emission. Diagnostics must identify the declaration or missing field, not report an incidental parser error as proof of this contract. Each backend must run positive guests and negative compiler diagnostics against exact source/compiler/runtime commits; fixture-integrity tests alone are not execution evidence.

The companion contract is [explicit-initialization-v1](../contracts/explicit-initialization-v1/contract.json). All cases begin as `AUTHORED_NOT_EXECUTED`; backend status may change only after the evidence rules are met.
