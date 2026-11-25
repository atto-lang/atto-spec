# Map.of_entries and nominal Structs — portable contract v1

> **Proposed v2 constructor boundary (2026-11-25):** [Pair/Record and Entry/Map interoperability](entry-expression-and-record-literals-v1.md#parentheses-and-record-constructor-interoperability-v2-proposed) makes `Map.of` accept both Pair and Entry items (including mixed items with compatible K,V) in the new profile; `Map.of_entries` remains an explicit Entry-only spelling. Flat alternating positional `Map.of(k,v,k,v)` is historical compatibility only, not new-profile admission. Pin the source profile; never silently reinterpret legacy calls. `Pair` is string-keyed in v2, so any Map.of consuming Pair has K=string; arbitrary key types use Entry. `Pair` is not `Entry`; `Record.of` accepts static named fields or identifier-proven Pair values, not Entries.


**Status:** proposed normative AttoLang language contract, 2026-11-20.
This document extends contextual collection forms and the candidate
record-struct-layout-v1 contract. It specifies intended semantics,
NOT evidence of compiler implementation or cross-backend parity.

## 1. Entry-based Map construction

~~~atto
val Map<int,bool> m = Map.of_entries<int,bool>(
    5 => true,
    8 => false,
    9 => true,
);

// Also valid under the target language:
val Map<int,bool> n = Map.of_entries(
    Entry.of(5,true),
    Entry.of(8,false),
    Entry.of(9,true),
);
val inferred = Map.of_entries(5 => true, 8 => false);
~~~

The signature is semantically Map.of_entries<K,V>(Entry<K,V>... entries).
The expression k => v in this argument context constructs an Entry<K,V>,
not a Pair<K,V>, Tuple<K,V>, lambda or general key/value separator.
Entry.of(k,v) has the same Entry constructor semantics. These values
can be provided together. Pair.of(k,v) is not an Entry and MUST reject.

Map.of_entries takes complete Entry values only. It does NOT accept the
alternating positional spelling Map.of(k,v,k,v), and it MUST reject
Map.of_entries(5,true) instead of guessing the caller's intent.
Map.of still retains its existing alternating-pair and arrow-entry forms.

K,V are either explicitly supplied in angle brackets, inferred from
all Entry arguments, or taken from a uniquely known expected Map<K,V>
type. Explicit type arguments take precedence over inference but must
unify with any expected target and with EVERY entry. Neither a fabricated
Any, lossy numeric widening, unchecked cast, nor ambiguous empty Map is
permitted. Map.of_entries<K,V>() represents an empty concrete Map<K,V>.
Map.of_entries() without known K,V fails inference.

Each supplied Entry expression is evaluated once in source order. Each
inline Entry arrow evaluates its left/key expression before its right/value.
Caller-owned Entry values respect move/borrow contracts. Moving an owned
Entry that cannot be copied requires an explicit take! or equivalent
source-proven move; an ordinary implicit readonly borrow cannot silently
transfer a mutable owned payload into a Map. A backend must reject
variable Entry ingestion if it lacks a checked ownership-transfer ABI.
The bounded Rust guest profile initially supports inline arrow entries
and Entry.of literal calls, not variable Entry handles or arbitrary calls.

K must satisfy the language's validated hash and equality contract.
Static duplicate keys (including 0 and -0) reject E_DUPLICATE.
For computed keys, the existing Map rule applies: later equal key replaces
earlier value, with correct release of displaced ownership. No ambient
host hash map, weak equality, unconstrained hashing, or unverifiable
cross-TenantVM handle transfer is permitted. Memory allocations and
capacity are checked per tenant.

### const versus val

The requested syntax

~~~atto
const m = Map.of_entries<int,bool>(5 => true, 8 => false, 9 => true);
~~~

is a **target constant-expression feature**, not permission to weaken
const into val. Const admission requires fully compile-time evaluable,
immutable, deterministic Entry values and a *verified frozen Map ABI*,
such as read-only compiled storage with an authenticated lookup/equality
implementation. A runtime heap allocation, mutable Map, runtime hash seed
or runtime-only key comparison cannot be treated as a constant by
syntactic inspection. Until a backend proves this representation, it
MUST reject the const initializer (E_UNSUPPORTED), while the val form
can execute using checked guest allocation. If future frozen map storage
is shared, it cannot carry mutable data or tenant-local capabilities.

## 2. Struct is a nominal, fixed-schema value type

~~~atto
define struct Point as
    int x;
    int y;
end

val Point origin = Point{x: 0, y: 0};
val Point next = Point{y: 20, x: 10};

define struct Position as
    int x;
    int y;
end

val Position pos = Position{x: 10, y: 20};
~~~

Point and Position are DIFFERENT types despite identical field labels and
types. A Struct's nominal type identity is module-qualified declaration
identity (plus explicit generic arguments when supported), NOT structural
field-set equality. Its field slots and stable logical ABI order follow
the declaration order x then y. Initializers may be written in any order,
but expressions always execute exactly once in *source* order before
results are placed into the declaration-order slots. No implicit
field insertion, arbitrary quoted dynamic key, Map or open-Record view.

The canonical constructor is S{field: value, ...}; the separate explicit infer struct form requires a statically known nominal expected type. The restricted S(field=value) shorthand follows the named-generic layout target; ordinary calls still use colon labels. For now, bare braces
remain Map/Record-context expressions, not silently guessed Structs.
The source-level new keyword constructs class/actor heap objects, not
ordinary Struct values. Backends may internally allocate or box a
Struct to implement their bounded profile, but this must not redefine
the intended semantic distinction.

### Required, defaulted and mutable fields

Each required field is initialized exactly once. Missing fields,
extra fields, duplicate fields, wrong types and inaccessible fields
must fail before guest code generation. In the initial grammar,
fields use type-first declarations (int x;) and have no default.
Proposed future default initializers require explicit const/effect
rules and a deterministic evaluation order; no implicit zero defaults.

The distinction between binding mutability and field mutability applies:
val prevents rebinding a name; it does not magically copy a mutable
graph held by a value. Declared mutable Struct fields (independently checked
mut field syntax) may be written ONLY through an owned exclusive
borrow or a checked mutation operation. A shared borrow cannot mutate.
For an immutable Struct, field updates require constructing a new
value. Structs never expose unguarded actor state by virtue of being
inline values.

### Ownership, equality, representation

Struct is *value-oriented*, not implicitly a shared object identity.
Copy by value is allowed only when each field is Copy-compatible under
the language's explicit copy!/copy!! rules; noncopyable owned resources
are moved with take! or borrowed with borrow! as applicable. drop!
releases all owned fields exactly once, in an explicit specification-
defined order. Stable-address/pin! and suspension rules are enforced
by the borrow checker. A Struct containing an owned handle is NOT
automatically Sendable or Serializable.

A Struct does not automatically gain equality, hashing, ordering or
serialization simply because fields are declared; those capabilities
require the corresponding validated derives/implementations and
field-wise obligations. Equal field contents of two unrelated Struct
types do not imply assignment compatibility. A known Record shape is
structural and field-order-independent; Struct is nominal and
declaration-order-dependent. Conversion is explicit and checked:

~~~atto
val Point p = Point{x: 10, y: 20};
val Record r = (x=10, y=20);
// NOT an implicit assignment: val Point q = r;
// Target explicit checked construction from Record values:
val Point q = Point{x: r.x, y: r.y};
~~~

Methods and trait conformance may be supported on Structs, but
classes and Structs are NOT the same inheritance family.
Struct inheritance of fields, arbitrary virtual bases, implicit
class casts and hidden vtables are not part of the v1 contract.
Method receiver borrow/mutability is explicit and is checked just
like ordinary owned values. Generic Structs and destructuring
patterns require independent grammar, instantiation and compiler
admission receipts.

A logical field order is NOT an assertion of bytewise ABI across
backends: size, alignment, padding, unboxing and endianness depend
on a target profile. Cross-target and cross-TenantVM transfer uses a
versioned validated serialization/wire contract, never a raw memory
copy. A compiler must not invent static offsets for unresolved,
open-row or unsized fields.

## 3. Struct-versus-Record-versus-Map-versus-Class

| Family | Type identity | Constructor | Access/identity |
| --- | --- | --- | --- |
| Struct | Declared nominal | Point{x:1,y:2} | Typed declared fields; intended value semantics |
| Closed Record | Structural set of field names/types | (x=1,y=2), Record.of(...), {x:1,y:2} | Checked static named fields; shape order normalized |
| Open Record | Structural open supertype | Explicitly typed Record context | Presence/type proof before field access |
| Map<K,V> | Homogeneous generic keyed collection | Map.of, Map.of_entries, typed {...} | Validated K hash/equality; dynamic keys |
| Class | Nominal reference-like object | new Name(...) | Object identity, shared/borrowed references, inheritance where proved |

A Struct cannot implicitly become a Record (or vice versa); no
unchecked structural casts. An Entry is the two-field key/value
product; a Pair is a nominally distinct first/second product and
does not silently substitute for Entry or Struct.

## 4. Narrow implementation state and conformance gate

The existing Rust-to-Wasm compiler recognizes restricted
define struct Name as int x; ... end declarations, and source
Point{x:1,y:2} nominal construction in the shape_lower pass. It
rewrites these into checked nominal class construction for actual
guest execution. **This is not a native unboxed value-layout ABI**
or full Struct language support. Source-local scalar literals,
no defaults, bounded fields and static shapes are the current
restriction. The new Map.of_entries parser/type/guest work is
separately staged in a draft Rust branch and must not be called
passing without an executed exact-SHA CI receipt.

Required tests: unequal nominal Struct identities for otherwise
identical schemas; field permutation evaluation order; missing,
extra and duplicate fields; direct field reads; no Record/Struct
implicit cast; construction without host fallback; >budget
shapes; ownership and TenantVM isolation. For Map.of_entries:
typed/inferred K,V, 0–N entries, Entry.of and arrow entry syntax,
mismatched Entry/Pair, duplicate keys, const failure until
frozen ABI, checked bounds and dynamic Entry rejection.

All backend statuses begin NOT_EXECUTED. A backend earns PASS
only after exact-head parser, type and ownership tests, actual
native/browser/AOT compiled guest execution where applicable,
negative/no-artifact evidence, formatter round trips, and
multi-tenant security checks. atto-format and oreslang-format
must agree with the spec, not redefine this grammar.
