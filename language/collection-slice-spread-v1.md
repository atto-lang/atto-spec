# AttoLang collection indexing, slicing, spread and iteration v1

Status: **candidate normative design; not an implementation or backend-parity claim** (2026-11-15).
Owner: atto-lang/atto-spec. Shared vectors: atto-lang/atto-platform-conformance/contracts/collection-slice-spread-v1.json.
This proposal complements local-binding-mutability-v1.md and lambda-return-types-v1.md.
Pre-existing compiler/browser subset behavior is not extended by this document alone.

## 1. Surface grammar

```ebnf
index_or_slice = primary_postfix, "[", (expression | slice_bounds), "]" ;
slice_bounds   = [expression], ":", [expression], [":", expression]
               | [expression], "::", expression ;
spread_item    = "...", unary_expression ;
array_elements = [array_item, {",", array_item}, [","]] ;
array_item     = expression | spread_item ;
call_arguments = [call_argument, {",", call_argument}, [","]] ;
call_argument  = expression | spread_item ;
```

The grammar notation above is illustrative: in a slice the colon separators terminate the bound expression; the existing ternary `? :` parser must not swallow a slice delimiter. Lex `...` atomically before `.` (longest-match). Lex `::` as two adjacent slice colons **only within brackets**; outside brackets preserve the language's existing namespace/type token semantics. The following all parse:

```atto
val a = [10, 20, 30, 40, 50];
val x = a[0];
val last = a[-1];
val mid = a[1:4];
val front = a[:3];
val tail = a[2:];
val all = a[:];
val evens = a[::2];
val backwards = a[::-1];
val reverse_section = a[4:0:-2];
val b = [0, ...a, 60];
val c = [...a.filter(|n| -> n > 20)];
```

Non-goals for v1: `<- ` assignment arrows, implicit splat in arbitrary expressions, positional spread into a fixed-arity call of unknown size, and implicit deep copying.

## 2. Precise index and slice semantics

* Indexes are signed integers. `a[i]` checks `-len <= i < len` and normalizes negative `i` to `len+i`. Indexing empty containers is an error. `a.get(i)` instead returns `Option<T>`.
* Slices use **half-open** indices: `a[start:end:step]`, with an optional start, end and step; omitted step is +1. `step == 0` is always an error; a literal zero must produce a compile-time diagnostic and runtime-computed zero a checked runtime error.
* For a positive step, default start=0 and end=len. For a negative step, default start=len-1 and end=-1 as an exclusive sentinel. **An omitted negative-step end differs from an explicit `-1`**, which normalizes to the last element. This makes `a[::-1]` reverse the collection correctly.
* Explicit negative slice bounds normalize relative to len. Valid explicit slice endpoints are in `[-len, len]` (the normalized result must be in `[0,len]`). The implicit reversed end sentinel -1 is internal and cannot be supplied by spelling `-1`. For reverse slices, an explicit start equal to len is also invalid because it is not an element index. Invalid explicit bounds trap with `E_SLICE_BOUNDS`; no Python-style silent clipping.
* Iterate indexes `i` from start while `i < end` for step>0, or `i > end` for step<0. Opposite-direction ranges yield an empty slice. Slicing an empty container yields an empty result for its valid default-bound forms.
* Checked arithmetic is required for bound normalization, length, and step advancement. Each indexable operand is evaluated once. The source order of side-effectful start, end and step expressions is left-to-right, each at most once.

Examples on `[10,20,30,40,50]`: `[1:4]` yields 20,30,40; `[::2]` yields 10,30,50; `[::-1]` yields 50,40,30,20,10; `[4:0:-2]` yields 50,30; `[4:-1:-1]` yields empty.

## 3. Capability-based collection typing

| Capability | Operations | Complexity requirement |
| --- | --- | --- |
| `Iterable<T>` | `iter()`, spread in a finite materialization context | No indexing guarantee |
| `Iterator<T>` | `next()`, `map`, `filter`, `flat_map`, `take`, `skip` | Single pass; lazy by default |
| `Indexable<T>` | `x[i]`, `get(i)` | Complexity is type-specific |
| `Sliceable<T>` | `x[start:end:step]`, `slice(...)` | View or typed view iterator, not implicit copy |
| `MutableIndexable<T>` | `x[i] = value` | Requires writable borrow / legal ownership |
| `Collection<T>` | `len()`, `iter()`, materializers | Finite, measurable |

`Array<T,N>`, resizable `List<T>` and `Slice<T>` are indexable and sliceable. A linked list may be sliceable via an iterator, but it must not claim constant-time access; a generic `Iterable<T>` has no `[]` until it provides a capability. Unbounded iterators/streams are not silently materialized. An explicitly bounded `.take(n)` may establish finiteness, whereas merely having a potentially-infinite producer cannot.

## 4. Views, allocation, ownership and actors

* A contiguous array/list slice yields an immutable borrowed `Slice<T>` view. A strided or reversed slice yields an immutable `StridedSlice<T>` view. No silent element cloning, heap allocation, or aliasing mutable references.
* `slice_mut(start,end)` requires a unique mutable borrow and returns a lifetime-bound mutable contiguous slice. Assigning to `list[i]` requires a writable referent, independently of `let` versus `val` rebinding. Never make `a[1:3] = ...` an implicit resize operation; expose `replace_range` for resizable lists.
* Borrowed views cannot outlive their source or cross suspension / actor transfer boundaries unless borrow checker guarantees allow it. The `critical-read` actor boundary prohibits mutation; `critical-write` can grant an exclusive, scoped mutable view, never a leaked one.
* `[...source]` constructs a new collection. `Copy` elements can be copied; owned elements must be moved through explicit ownership transfer, or cloned/shared with an explicit permitted operation. No implicit deep clone of user class values. The source expression is evaluated once; elements are yielded in order, and partial construction cleans up owned elements upon failure.
* Spread is permitted in array/list literals and in typed variadic/tuple-aware call positions. A dynamic spread into fixed-arity arguments is rejected unless arity can be proven at compile time. Spread outside a designated context is a syntax error. Implicitly unbounded materialization is rejected.
* `map`, `filter`, `flat_map`, `zip`, `enumerate`, `take`, `skip`, `window` and `chunk` are lazy iterators where supported; `to_list`, `to_array`, `join`, `sorted`, `group_by`, `fold` and `collect` are explicit terminal/eager operations. An API's effects and allocation must be documented. Closures honor the existing `|args| : T -> body` grammar and actor isolation.

## 5. UTF-8 strings: semantic indexing, not byte offsets

* `String` is immutable UTF-8. `str[i]` indexes **Unicode scalar values**, returning `char`, not the i-th byte or UTF-16 code unit. `str[start:end]` uses Unicode scalar offsets and returns a borrowed contiguous `StringView`; it must not divide a UTF-8 scalar. String indexing is O(n) in general unless an implementation stores indexes.
* `str[::step]` with step != 1 returns a scalar `CharStrideView`, not a secretly copied `String`. Call `.collect_string()` (or `.join("")`) to materialize text. Spreading `...str` yields Unicode scalar `char` items.
* `str.bytes()` exposes explicit UTF-8 byte iteration; `str.graphemes()` exposes extended grapheme clusters via a versioned Unicode standard and may have different indexing boundaries. Neither silently changes ordinary scalar-index semantics.
* Index normalization counts the chosen elements, not bytes. For `"héllo"`, `s[1]` is `'é'`; `s[:2]` is `"hé"`. A family-emoji grapheme can span multiple scalars; `graphemes()` is the appropriate user-perceived-character API.
* Compiler const evaluation and runtime must agree on scalar/UTF-8 semantics; existing string comparison or const-folding rules are separate and not implicitly redefined here.

## 6. Diagnostics and portability

Stable diagnostic categories: `E_SLICE_SYNTAX` (empty brackets, missing stride, extra colon), `E_SLICE_STEP_ZERO`, `E_SLICE_BOUNDS`, `E_INDEX_BOUNDS`, `E_NOT_INDEXABLE`, `E_NOT_SLICEABLE`, `E_SPREAD_CONTEXT`, `E_SPREAD_ELEMENT`, `E_UNBOUNDED_SPREAD`, `E_BORROW`, and `E_ISOLATION`. Compiler subset implementations may return `E_UNSUPPORTED` after a valid parse; no such result counts as executable collection support.

All backends must use identical checked normalization, evaluation order, UTF-8 policy, ownership behavior and diagnostics. Tests must include negative-step defaults, explicit negative end, empty containers, empty ranges, invalid step, bounds overflow, Unicode scalars vs graphemes, spread evaluation order, non-Copy ownership, borrowed-slice invalidation and actor-state isolation. Separate parse-only / type-checked / guest-executed statuses. A host-side parser test never constitutes a guest-execution pass.

## 7. Compatibility and staged implementation

1. Lexer/parser + AST in `atto-source.rs`, fail closed at checker with `E_UNSUPPORTED` until lowering exists.
2. `Array<int>` and fixed-size borrowed slice execution, using the existing draft array work where applicable; add immutable list and string scalar views.
3. Explicit spread materialization with copy/move/effect rules, then lazy iterator API and variadic spread.
4. Cross-backend executable conformance, formatter canonical round-trip, optimizations and actor-safe borrow instrumentation.

In-flight `atto-source.rs` array PRs #111 and #112 are independent draft implementation work; they must be reconciled with this contract before an executable-support claim. The full language does not gain runtime slicing merely because the browser subset parses this syntax.
