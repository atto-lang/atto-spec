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

## Verification

Each backend and formatter must implement the distinct PairExpr, EntryExpr, named-argument and Record nodes; name-derived declaration lowers to ordinary typed binding and Pair construction, preserving source spans. Test exact-key equivalence, lexical shadowing, once-only RHS evaluation, const rejection of non-constexpr values, type mismatch, immutable binding rejection, let rebind and key dataflow, nested groups, constructor shape, mixed syntax, wrong arity, formatter round trips and compiled guest execution. Preserve existing allocation, ownership, cleanup, actor isolation and no-artifact-on-rejection rules. Heterogeneous Pair representation and runtime support are independently gated; no parser or host model is executable parity evidence.
