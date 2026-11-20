# Contextual collection literals and Pair/Entry arrows v1

**Status:** proposed normative AttoLang language contract (2026-11-19).
This describes portable TARGET semantics, not proof of compiler parity.

## Valid forms and binder requirements

The following forms are accepted when the binder is present and type parameters
have been properly introduced:

    val List<int> numbers = [];
    val Map<int,string> labels = {};
    val Tuple[int?,string?,bool?] defaults = (None,None,None);
    val Record r = (abc="foo", xyz=true, foo=5);
    val Pair<int,bool> pair = 5 => true;
    val Entry<int,bool> entry = 5 => true;

In generic code with a declared parameter T, the spelling
val List<T> numbers = []; is valid. Free, undeclared T is not Any.
Declarations that omit the variable name, e.g.
val Pair<int,bool> = 5 => true; are syntax errors. An explicit discard
pattern would require its own specification; no implicit hidden binder exists.

## Contextual empty constructors

An empty [] takes a known List<T> or Array<T> expected type. List and Array
remain different type constructors. Their item types cannot be inferred from
zero values without a contextual type argument or declared generic parameter.

An empty {} takes a known Map<K,V> expected type, or an unambiguous Record
context. Map and Record are not synonyms. Bare [] and {} with no expected
type fail inference, and Map with unknown K,V is not concrete enough.
Explicit Map.of<K,V>() and List.of<T>() are allowed by the portable target
when generic inference and instantiation are available in that backend.

Empty collections are real owned values, with zero logical elements and
proven memory/lifetime semantics. They are not null pointers, host language
maps or discarded source expressions. A runtime allocation is not magically
a compile-time constant merely because it is empty. Const rules apply as
normal. Type erasure, unbounded allocation and cross-tenant handle sharing
are forbidden.

## Optional tuple element types

Tuple[T0,T1,...] is accepted as the same type as Tuple<T0,T1,...>.
Formatters may canonicalize to the angle-bracket form. Each position retains
its own type, distinct from a homogeneous List or Array.

A postfix optional type T? means Option<T>. In particular,
Tuple[int?,string?,bool?] is a tuple of Option<int>, Option<string>,
and Option<bool> respectively.

None needs contextual Option<T> type. It is never an untyped null, zero,
empty string, or forged pointer; Some(0) differs from None.
Guest type/ownership representation must be tagged and validated. If the
backend has not implemented a particular Option<T> payload representation,
it must reject guest codegen without creating an artifact.

## Named-field parenthesized Record

(abc="foo", xyz=true, foo=5) is a closed Record constructor, equivalent
to Record.of(abc="foo", xyz=true, foo=5). This is neither a positional Tuple,
a function with keyword arguments, a Map, nor an assignment expression.
All values evaluate once in lexical source order, though structural shape
identity is independent of declared field order.

All elements must be named with identifier or quoted static UTF-8 label.
Duplicate labels, mixed named/positional values, dynamic keys and spreads
reject. (expr) is grouping, (a,b) is a positional Tuple, (label=value) is a
one-field Record, and () remains a zero-element Tuple.

## Typed Pair and Entry arrow shorthands

When explicitly targeting Pair<K,V>, k => v is exactly Pair.of(k,v).
When explicitly targeting Entry<K,V>, k => v is exactly Entry.of(k,v).
The key/left value evaluates once, before the right value. A Pair has
first/second projections; an Entry has key/value projections. Pair and
Entry are distinct nominal product constructors, even when their byte layout
looks identical. No implicit interchange, unchecked cast, serialization
identity collapse or Map conversion may occur.

The arrow inside Map.of(k => v) and inside Map literal braces preserves
Map's existing Entry-context meaning; it does not construct a Pair. Lambda,
match-arm and function arrows remain separate grammar. Bare k => v outside
a known Pair/Entry/Map context is ambiguous and must reject, not guess.
Both Pair.of and Entry.of are compiler-recognized factory names: source
shadowing must not bypass checked construction.

## Errors, conformance and tenant security

Missing declared binder: syntax diagnostic. Unresolved empty collection
element or Map K/V types: inference diagnostic. Mismatched Pair/Entry target,
mismatched concrete element type, or None without Option<T> context: type
diagnostic. Duplicate Record labels or constant Map keys: duplicate
diagnostic. Unsupported runtime allocations and Option<T> representations:
unsupported feature diagnostic with no guest artifact.

Compilers must preserve source-order evaluation, exact nominal/structural
identity, checked allocation bounds, ownership and move semantics, and
TenantVM isolation. Borrowed aggregate storage cannot be transferred across
tenants via unvalidated memory or ambient host capability. Independent
backends must pass the same positive/negative source contracts and prove
compiled guest execution, exact-SHA build provenance, and AOT or Wasm
representation before claiming parity.

This contract is separate from the prohibition on tilde-based constructors:
typed => and parenthesized named Record are explicit contextual literal forms,
not a revival of tilde factories.

Formatters atto-format and oreslang-format must agree with the specification
on parsing, canonical spelling and parse-equivalent round-trip behavior.
Formatter output does not define language semantics. Every conformance
backend starts at NOT_EXECUTED until exact-head execution evidence exists.

The Rust compiler has staged draft parser/static-type and bounded guest
lowering work; general generic functions, tagged Option<string>/Option<bool>
guest storage, full List/Map runtimes, cross-TenantVM transport and independent
compiler parity are NOT established by those drafts.
