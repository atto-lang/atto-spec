# 23 — Functors, Nested ADTs and Checked Return Types

**DRAFT TARGET / NOT VERIFIED across backends.** This chapter defines the
portable semantics intended for AttoLang. The Java compiler has pre-existing
`Option`/`Result` combinators; proposed symmetric `Result.transpose` and
`Result.flatten` are staged on an implementation branch, **not certified**.

## Scope and terminology

A **functor** here is a *type-constructor-preserving map operation*, not a
callable object, an OCaml-style module functor, or an implicit runtime typeclass.
For the initial, fully statically checkable surface, `Option<T>` and
`Result<T,E>` provide type-directed, monomorphizable methods. Each `map`
transforms **exactly one** outer container. There is no implicit map through an
inner container, automatic monadic bind, automatic error conversion or generic
dynamic dictionary search.

The generic `Functor<F>` / higher-kinded abstraction is **deferred** pending a
separate static coherence/associated-type design. This chapter does not require
higher-kinded syntax in source and does not introduce another keyword.

## Required typing equations

Let `f: A => B`, `g: E => F`, with valid, statically resolved callbacks.
These are schematic type signatures (not a new source grammar):

| Receiver | Operation | Return |
| --- | --- | --- |
| `Option<A>` | `map(f)` | `Option<B>` |
| `Result<A,E>` | `map(f)` | `Result<B,E>` |
| `Result<A,E>` | `map_err(g)` | `Result<A,F>` |
| `Option<A>` | `and_then(A => Option<B>)` | `Option<B>` |
| `Result<A,E>` | `and_then(A => Result<B,E>)` | `Result<B,E>` |
| `Option<Option<A>>` | `flatten()` | `Option<A>` |
| `Result<Result<A,E>,E>` | `flatten()` | `Result<A,E>` |
| `Option<Result<A,E>>` | `transpose()` | `Result<Option<A>,E>` |
| `Result<Option<A>,E>` | `transpose()` | `Option<Result<A,E>>` |

`Result.flatten()` MUST require **the same nominal error type `E` in both
layers**. `Result<Result<A,E1>,E2>` with `E1 != E2` MUST fail at compilation.
No implicit `map_err`, upcast or error-union construction repairs that
mismatch. `and_then` keeps the original `E`; `or_else` keeps the original
success `A`. Where the source type system intentionally supports a checked
subtype conversion, it must still retain the declared invariant generic slot
and cannot infer it from `Unknown`.

### Functors of functors

`Option<Result<A,E>>.map(Result<A,E> => Result<B,F>)` has type
`Option<Result<B,F>>`, **not** `Result<Option<B>,F>` and not `Option<B>`.

`Result<Option<A>,E>.map(Option<A> => Option<B>)` has type
`Result<Option<B>,E>`, **not** `Option<Result<B,E>>`.

To transform an inner layer, the callback MUST explicitly invoke that layer's
own method; to swap the two specific closed constructors, source MUST call
`transpose()`. Nested `Option` or `Result` types remain nested under
ordinary `map`, even when a callback returns a container.

No `traverse` or `sequence` universal extension is implicitly enabled by
this rule. Future collections, asynchronous tasks and effectful applicatives
need separate lowering, effects and ownership contracts.

## Tagged-ADT operational contracts

`Option<Result<A,E>>.transpose()`:

| Input | Output |
| --- | --- |
| `None` | `Ok(None)` |
| `Some(Ok(x))` | `Ok(Some(x))` |
| `Some(Err(e))` | `Err(e)` |

`Result<Option<A>,E>.transpose()`:

| Input | Output |
| --- | --- |
| `Err(e)` | `Some(Err(e))` |
| `Ok(None)` | `None` |
| `Ok(Some(x))` | `Some(Ok(x))` |

`Result<Result<A,E>,E>.flatten()`: `Err(e) -> Err(e)`,
`Ok(Err(e)) -> Err(e)`, `Ok(Ok(x)) -> Ok(x)`.
`Option<Option<A>>.flatten()` has the corresponding `None`/inner-`None`/
inner-`Some` rules. These are **explicit** ADT operations, never coercions.

The tags `None`, `Some(None)`, `Err(e)`, `Ok(None)` and `Some(Err(e))`
are observationally distinct, including in nested `match` exhaustiveness,
pattern binding and serialized/wire representations. No implementation may
use null, zero, false or `void` as evidence of absent variants.
`Option<void>` is meaningful: `Some(void)` and `None` differ.

## Type checking, AOT and return inference

1. Resolve the concrete receiver type and nominal ADT constructor, then
   check the method and its argument count. The callback is checked against
   precisely the one immediate payload type; its resolved result `B` is
   recursively validated and inserted into the correct generic slot.
2. A direct call may infer the callback result from a typed inline expression
   lambda or an explicitly typed callable. It MUST NOT invent `Unknown`,
   `Any`, an erased generic or an unconstrained error parameter to make a
   return type fit. An `Ok`-only or `Err`-only constructor needs a
   contextual error/success type witness if that slot would otherwise be
   unknown. Public ABI types must be fully resolved.
3. The checker MUST reject assignment of the resulting `Option<Result<B,E>>`
   to `Option<B>`, and rejection MUST happen before guest execution.
   Matching/pattern coverage retains nominal nested variant identity.
4. Mapping and transposition preserve evaluation order: evaluate the
   receiver once, evaluate the callback expression once, invoke that callback
   once **only on the active variant**. Inactive variants retain their exact
   tag and payload; no speculative callback invocation is permitted.
5. Check borrow/move/affine containment at every boundary. Transpose and
   flatten consume or copy *according to the verified receiver capability*:
   no ownership duplication, borrowed affine escape, hidden second move, or
   cross-isolate transfer.
6. In a full-AOT build, all callback targets, ADT layouts and return types
   must be statically resolvable (or fail closed under an explicit permitted
   static-dispatch strategy). Runtime reflection, dynamic `Any` fallback and
   implicit allocation are not required for this surface.
7. Synchronous `map`/bind callbacks must obey the existing checked
   effect policy. `await`/suspension cannot be smuggled through an inline
   callback; throw/raise/panic are effects, **not** `Err` values.
   The pure functor identity/composition laws apply to pure callbacks;
   effectful callbacks may have separately observable ordering.

## Required conformance gates

The versioned corpus must cover successful compile-and-guest-execute cases
for all three `transpose` variants, all three `Result.flatten` variants,
nested `Option<Result<...>>` and `Result<Option<...>>` mapping, dormant
callbacks and exact return type annotations. Negative compiler fixtures must
reject wrong error domains, wrong `transpose` input, implicit flattening,
wrong arity, unresolved generic holes, invalid callback arity, unsafe borrows
and invalid effect/suspension combinations.

Run identical source fixtures on Java/GraalVM, LLVM, Wasm, Forge, .NET Native
AOT, with Cranelift separately tracked where applicable. Evidence must include
immutable source/compiler/tree and fixture hashes, positive guest outputs,
negative diagnostic categories, compilation profile and AOT receipts. A
reference model or a passing Java-only JUnit assertion is **not** five-backend
parity. The initial Java implementation branch and source-free reference
model are **CANDIDATE / NOT CERTIFIED** until independently executed.
