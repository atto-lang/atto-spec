# Pair literals and name-derived bindings — v3

**Status:** user-approved syntax; portable target, NOT_EXECUTED. This correction supersedes the contextual Pair arrow interpretation in contextual-collection-and-entry-literals-v1.md and the ordinary named-call restriction in the v2 aggregate constructor contract. Other v2 constructor and ownership requirements remain unchanged.

## Nominal types and syntax

Pair<V> has a string key and a typed value. Entry<K,V> has an arbitrary typed key and a typed value. Tuple is positional, Record is identifier-field structural. Pair<string,V> is the v2 compatibility type spelling; other two-parameter Pair types reject. No implicit conversions between these kinds. Bare Pair in a heterogeneous collection or parameter denotes a checked existential value type, not unchecked Any; unsupported representation rejects.

```atto
const y := 5;
const Pair<int> p = "y" := 5;
const Pair<int> q = y := 5;
const Pair<int> explicit = Pair.of("y", 5);
const Entry<int,string> e = 5 => "444";
const Tuple t = (name := "Alice", age := 42, active := true);
const Record r = (name = "Alice", age = 42, active = true);
const Array<Pair> a = [age := 42, bop := "zzz", genr := true];
```

The four Pair declarations above produce key "y" and value 5. A bare identifier to the left of := is a literal lexical name, never a lookup, even if that identifier is bound. A quoted string key uses the ordinary decoded string value. Arbitrary computed string keys use Pair.of(key, value); arbitrary evaluated key expressions use => to construct Entry. The expected type never changes := into a Record or => into a Pair.

## Binding sugar

`const y := 5;` is exactly `const Pair<int> y = Pair.of("y", 5);` (with V inferred from the initializer). The same inferred-local binding sugar is supported for val and let, with their existing rebinding and referent permissions. The right operand is evaluated exactly once under the ordinary initializer scope, type inference, effects, constexpr and ownership rules. The binder is not introduced early by the sugar. A const initializer must be compile-time evaluable; val/let do not acquire a constexpr requirement. No new module-scope admission or implicit mut capability is introduced. The binding is a Pair, not its payload.

The name is fixed at construction, not a permanent key-refinement of the storage slot: a rebindable let may receive a different well-typed Pair, but cannot receive a scalar. Key/value projections are read-only; ordinary ownership and nested referent permissions apply. Permanent key-refined bindings and memory-address pinning are separate features, not implied by :=. Dataflow may retain a proven constant key when safe, but not after an unproved reassignment. No runtime variable-name reflection or required separate heap allocation.

## Grammar and ambiguity

```ebnf
pair_key = IDENT | STRING_LITERAL ;
pair_expr = pair_key, ":=", expression ;
named_pair_binding = ("const" | "val" | "let"), IDENT, ":=", expression, ";" ;
named_arg = IDENT, ("=" | ":"), expression ;
record_field = IDENT, "=", expression ;
```

The lexer emits a single adjacent := token, distinct from : and =. Pair construction is nonassociative, below ordinary arithmetic, comparison and postfix expressions; ungrouped repeated := or mixed :=/=> chains reject. Parentheses can explicitly group nested products. Lambda and match arrows retain existing grammar. Assignment statements use =; no assignment expression or declaration of a variable is introduced by a standalone Pair expression. Inferred binding sugar is recognized only in the declaration grammar; no quoted, member, index or destructuring binder is admitted by this production.

In standalone parentheses, a top-level IDENT followed by = denotes a Record field, never a Pair. A top-level := denotes an ordinary expression, so (x := 5) groups a Pair, (x := 5,) is a one-element Tuple, and (x := 5, y := true) is a Tuple of Pairs. (x = 5) is a one-field Record. Mixed Record fields and positional items reject. Quoted "=" keys reject; quoted ":=" keys are valid Pair expressions. Brace Record and Map classification stays unchanged. No expected-type reclassification or implicit Tuple-to-Record conversion.

In call parentheses, IDENT followed by = or : is a named argument, whereas IDENT followed by := is a positional Pair expression. Both named-argument spellings normalize to the same AST; formatter preserves or canonicalizes to = in the new profile, with : accepted for compatibility. Evaluate arguments once in written order, then associate by resolved parameter name; reject unknown or duplicate names and positional arguments after named ones. Existing intrinsic Record.of and Map.of input-kind rules remain in force.

```atto
fnc foo(Pair<int> x, int m) { }
foo(x = "x" := 5, m = 3);
foo(x = x := 5, m = 3);
foo(x := 5, 3);
const y := 5;
foo(x = y, m = 3);
foo(x: y, m: 3);
```

Record.of may consume Pairs with statically proven unique valid identifier keys, including name-derived bindings. Pair keys themselves need not be identifiers (e.g. "5" := 42 is valid); Record.of rejects invalid or unknown keys. Map.of may consume compatible string-keyed Pairs under v2. No implicit named-argument spread or Record conversion.

## Inferred Record literals and field capture (v3 extension)

No explicit Record type annotation is needed. Standalone (name = "Alice", age = 42) and an inferred binding const r = (name = "Alice", age = 42); produce the same closed structural Record as a typed declaration. Both quoted and bare identifier := forms inside a comma-separated tuple remain positional Pair values; quoted equals forms reject. A Record expected type cannot change a Tuple into a Record.

A Record field assignment is checked against the field's actual declared/inferred type. Given const name2 := "Alice Wong"; and let mut Record r = (name = "Alice", age = 42);, r.name = name2.value; and r["name"] = name2.value; are equivalent checked writes. Assigning name2 itself to the string field rejects; a Pair-typed field may accept a compatible Pair without unwrapping. A const or otherwise read-only Record cannot be mutated. Static bracket fields, shape preservation, ownership and effects follow the existing Record rules. No key matching, implicit payload extraction or field insertion is introduced by assignment.

### Explicit Record field-capture spelling (accepted)

```ebnf
record_capture = ":", IDENT ;
```

In expression-position brace Record items, {:request_id} is exactly {request_id: request_id}, a closed one-field Record, not a Pair, Map or nominal Struct. The field label uses the lexical identifier spelling; its value is obtained by ordinary scoped identifier resolution, evaluated once, with standard ownership and effect checking. No runtime reflection, name lookup by string, or implicit move. The capture must resolve an accessible value binding; unresolved names, member paths, arbitrary expressions and reserved labels reject. A capture may coexist with identifier-colon fields and other captures, e.g. {:request_id, :status, duration: elapsed_ms}; the same duplicate-field and delimiter rules apply. A capture makes the brace literal a Record; mixing with quoted or arrow Map items rejects regardless of expected type. Formatting preserves the capture form or expands it to an equivalent explicit field.

```atto
val request_id = generate_uuid();
const status = 200;
const elapsed_ms = 45;
logger.info("Request completed", {:request_id}, {:status}, {:elapsed_ms});
logger.info("Request completed", {:request_id, :status, :elapsed_ms});
```

These logging calls require a logger API that explicitly accepts structured Records; no implicit call argument expansion or logging API change is claimed here. Runtime UUID generation uses val rather than const unless constexpr is established. Pair-based logging likewise requires a compatible Pair overload. The capture syntax is accepted; it does not imply runtime reflection. Explicit Struct capture construction is specified below.

## Static call spread and positional apply (approved extension)

Call argument grammar adds a distinct spread node: `call_arg = named_arg | "...", expression | expression ;`. The adjacent ellipsis is recognized only in the existing call-argument context; this extension does not add general collection spread, variadic parameter declarations or reflection.

```atto
fnc foo(string name, int age, bool active) { }
const r = (name = "Alice", age = 42, active = true);
const t = (active := true, name := "Alice", age := 42);
foo(...r);
foo(...t);
foo(...("Alice", 42, true));
foo(...{:name, :age}, active = true); // with accessible name and age bindings
fnc bar(Pair<string> x, Pair<int> y) { }
const pairs = (name := "Alice", age := 42);
bar.apply(pairs);
```

Classification is based on the resolved operand shape, before overload selection, never on the target's willingness to accept a particular interpretation:
- Closed structural Record: named arguments, preserving its proven field names and types.
- Nonempty fixed Tuple consisting entirely of nominal Pair values: named arguments by compile-time-proven string keys, using payload values. Unknown, invalid, duplicate or reserved keys reject; there is no positional fallback for an all-Pair tuple.
- Empty Tuple, or a Tuple with at least one non-Pair element: positional arguments preserving every element, including any Pair elements. Empty Tuple contributes zero arguments.
- Open Record without a proven closed shape, dynamic Array/List (including arrays of Pair), Map, Entry, scalar, and unresolved shapes reject. A generic instantiation may qualify only after the relevant shape and key proofs succeed.

`fnc.apply(tuple)` remains strictly positional, even for an all-Pair tuple. It passes actual Pair objects without key inspection or payload extraction. `.call(...)` and ordinary invocation use the resolved callable's normal argument rules; apply is not a route around ownership, effect, arity or visibility checks. Function values must retain trustworthy parameter names to admit named spread; otherwise reject rather than invent names.

Resolve all static spread slots, explicit labels, duplicates, unknown names, missing required parameters and type compatibility using ordinary call rules, including defaulted parameters and overload ambiguity. Positional arguments/spreads may precede named ones, not follow them; a zero-element spread contributes no slots and does not reset the phase. Duplicate slot assignment from any source rejects (including positional followed by named targeting that slot). A named spread can be followed by another named spread or explicit named argument. No last-wins behavior. Defaults follow the existing call semantics; spread introduces no extra evaluation of defaults.

Lower to an ordered argument evaluation plan, then to the resolved ABI slot order. Evaluate the receiver/callable and each written argument or spread operand once, in lexical order. Evaluate a Record initializer or Tuple element expression once in its original construction order; projecting an already-materialized aggregate never reruns those expressions. Canonical Record layout order is not evaluation order. Materialize temporaries or proven equivalent SSA values; map payload/field projections to parameter slots without reevaluation. A failing evaluation prevents later operands and callee execution and cleans already-owned temporaries. Reject illegal partial moves, repeated consumption, loan escapes, conflicting borrows and any spread that would need implicit copy/transfer beyond normal call rules. Do not invent an allocation or drop order observable to the program.

Key proof for a Tuple of Pairs uses authenticated Pair identity, compile-time name provenance and ordinary flow analysis; a string-typed key alone is insufficient. A mutable rebind, unknown function result, divergent key at a join or unverified generic cannot establish a name. Do not execute user code to discover shape. The callee receives only payloads for named Pair spreading, not the Pair metadata; a mixed positional tuple or apply passes Pair values as-is. Bound aggregate arity and recursion by existing resource limits. Unsupported lowering must fail without guest artifacts. Formatter must retain the distinction between ... and .apply(), and preserve parenthesis/tuple/Record classification.

### Conformance and implementation order

First implement a shared call-planning contract, typed operand classification and diagnostic negatives; then actual parser + typed IR, ordered lowering and compiled guests for each backend. Cover nonliteral argument effects in reverse parameter order, prebuilt tuples and Records, empty and mixed tuples, explicit/default/duplicate slots, dynamic keys, unknown names, generic instantiations, .apply preservation, and no-artifact ownership failures. Host/reference checks are not evidence of guest execution.

## Intrinsic read-only key and value projections (accepted)

The canonical property names are `key` and `value` for both nominal association types. For a resolved Pair<V>, .key has type string and .value has type V; for a resolved Entry<K,V>, .key has type K and .value has type V. The compiler must resolve the authenticated nominal receiver before lowering the projection; unrelated user-defined members follow ordinary member rules. This supersedes the old Pair first/second terminology in the contextual arrow contract. Neither get_key() nor get_value() is a required intrinsic; legacy APIs, if any, are separate compatibility work. The formatter must not rewrite properties into method calls.

```atto
const x := 5;
const int n = x.value;
const string label = x.key;
const e = 5 => "hello";
const int k = e.key;
const string s = e.value;
const foo = |int x| -> stdio.println(x);
foo(x.value); // valid
// foo(x);    // E_TYPE: Pair<int> is not int
```

The projection evaluates the receiver exactly once, preserves checked effects, and denotes a read-only component place with normal static ownership and lifetime information. Copy-safe payload reads may produce a copy; non-Copy payload reads do not implicitly clone, move, extend loans or acquire mutable access. Explicit transfer/borrowing is subject to existing component-place rules; if unsupported, reject before guest emission. No direct assignment, compound assignment or mutable loan replacing either slot, even through a mut binding. Rebinding an eligible let to a new Pair remains distinct. Read-only slots do not imply deep freezing of nested referents; applicable ownership and referent permissions govern nested access. An erased existential Pair has an existential payload, not an implicitly inferred concrete V; require checked narrowing under the existing type system.

No implicit extraction of .key or .value during assignment, return, arithmetic, comparison with a scalar, normal argument passing, generic inference, overload resolution, or positional .apply(). A function accepting Pair<int> receives the Pair intact. A Record field of Pair type likewise stores the whole Pair; a scalar field requires the explicit compatible projection. Named calls such as foo(x = p) do not extract a payload. Explicit named aggregate spread is the specified separate operation that projects Pair payloads by proved names. Record.of and Map.of consume association components only through their own checked explicit constructor contracts. No extra allocation or runtime reflection is required for ordinary projections.

Test literal, factory, name-derived binding and already-materialized receiver equivalence; concrete static key/value types, both nominal kinds, receiver effects once, immutable slot negatives, explicit scalar argument versus direct Pair mismatch, preservation of Pair arguments, .apply versus named spread, shadowed nominal types, moved and borrowed receivers, and constexpr projections. No backend may claim support without actual typed checking and executed guest cases.

## Record and Struct lexical capture constructors (accepted extension)

```atto
const name = "Alice";
const age = 42;
const z = {:name, :age};
const s = struct{:name, :age};
```

z is a closed structural Record with fields name:string and age:int, equivalent to {name:name, age:age} and (name=name, age=age). s is an explicitly requested anonymous Struct value with the same fields and fixed declaration-order layout, not a Record or Map. The explicit struct prefix selects anonymous Struct construction even without an expected type. For the initial profile, each anonymous Struct construction site has a stable compiler-generated nominal identity within its enclosing module/generic instantiation, reused on repeated execution, never selected by shape or expected nominal type. This identity choice is a proposed implementation detail, not a claim of an existing ABI. Named Structs retain their declared nominal identity. No implicit Record/Struct conversion, name lookup by runtime string, or dynamic type creation.

```atto
define struct Person as
    string name;
    int age;
end
const name = "Alice";
const age = 42;
const Person p = Person{:name, :age};
const s = struct{:name, age: age};
```

An explicit nominal constructor T{...} may use capture items subject to its declared required fields, visibility, defaults, types and ownership checks. Capture syntax expands to the corresponding ordinary named initializer before type checking; it does not relax nominal initialization. Existing infer struct{...} retains its separate contextual nominal-constructor semantics; it may also use capture items where that constructor is supported. Do not silently select a visible nominal type for bare struct{...}. Dot access is permitted for admitted fields; existing Struct prohibition on string bracket indexing remains. A closed Record retains its existing static literal indexing rule.

Capture items use only a lexical identifier after colon, preserve the original span, read the accessible binding exactly once in source order, and preserve type and normal Copy/borrow/move rules. No implicit deep copy or move. Mix explicit identifier-colon fields and captures; duplicate labels, unresolved names, inaccessible or reserved names, member paths and computed keys reject. Map entries are invalid in Struct initializers. Const still requires compile-time evaluability; use val for runtime reads. Unsupported anonymous fixed-layout representation must reject without guest artifacts, not fall back to Record or class.

### Structured logging acceptance target

```atto
val request_id = generate_uuid();
const status = 200;
const elapsed_ms = 45;
logger.info("Request completed", {:request_id}, {:status}, {:elapsed_ms});
logger.info("Request completed", {:request_id, :status, :elapsed_ms});
```

The structured logger API should admit one or more explicit Record field bundles, preserving their typed field names and values, and retain existing Pair-based overloads. Passing a bundle is not named-call spread; the logger receives actual Record values. For a deterministic logging profile, reject duplicate field names across bundles rather than silently overwriting; test the decoded event, not just successful compilation or formatted text. Do not implicitly stringify structured values or invoke arbitrary getters to derive field names. Runtime UUID must be evaluated only once. Tests may use a deterministic UUID provider and capturing sink to prove names, values, types and event count; actual backend logging support must be independently verified. Struct logging, if supported, requires explicit API admission and is not an implicit Struct-to-Record conversion.

## Verification

Each backend and formatter must implement the distinct PairExpr, EntryExpr, named-argument and Record nodes; name-derived declaration lowers to ordinary typed binding and Pair construction, preserving source spans. Test exact-key equivalence, lexical shadowing, once-only RHS evaluation, const rejection of non-constexpr values, type mismatch, immutable binding rejection, let rebind and key dataflow, nested groups, constructor shape, mixed syntax, wrong arity, formatter round trips and compiled guest execution. Preserve existing allocation, ownership, cleanup, actor isolation and no-artifact-on-rejection rules. Heterogeneous Pair representation and runtime support are independently gated; no parser or host model is executable parity evidence.
