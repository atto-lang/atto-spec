# Named aggregate type inference v1

Status: draft language contract; compiler execution and parity are not yet verified.

```atto
const Record<infer T1> r = (a=true, b="xyz", c=5);
const Tuple<infer T2> t = (true, "xyz", 5);
const struct<infer T3> s = {a:true, b:"xyz", c:5};

const Record<T1> r2 = (a=false, b="abc", c=10);
const Tuple<T2> t2 = (false, "abc", 10);
const struct<T3> s2 = {a:false, b:"abc", c:10};
```

## Grammar and resolution

In v1, a type-first const declaration for Record, Tuple or struct admits
one contextual type argument `infer Identifier`, with a mandatory initializer.
This is a declaration in the lexical **type** namespace, not an expression
operator, a generic parameter declaration or an inference hole.
The unadorned aggregate annotation continues its existing anonymous inference
behavior; it introduces no type name. `<infer>` is invalid. A plain
`<Identifier>` must resolve an existing compatible aggregate shape binding
(or follow the existing explicit generic grammar); unknown types never declare
themselves. This change does not remove existing initializer-infer productions.

Type-check the initializer using ordinary aggregate inference, including normal
literal widening and ownership/layout rules, before publishing its complete
static shape. In v1, references through the corresponding wrapper are permitted
in later declarations, parameters and return annotations wherever the existing
type grammar permits them. Do not make a new generic parameter or runtime type
object. The binding is visible only after successful declaration in its enclosing
lexical type scope, including nested scopes; it is not visible in its own
initializer, earlier statements, sibling blocks or outside the declaring scope.
Reject same-scope duplicate type names, including preexisting declared types
and generic parameters; ordinary lexical shadowing policy applies in child scopes.
Failed declarations publish no type. Module-level names remain private unless
an existing explicit export mechanism permits them.

Record shape is closed and structural: names and static types determine
identity, field order does not. Tuple identity includes ordered element types and
arity. An inferred struct is a fresh concrete nominal layout per declaration site;
reusing its wrapper selects that exact nominal layout. A contextual literal
constructs that layout but a value of a different nominal struct is not implicitly
converted. Record, Tuple and struct bindings are not interchangeable. Missing,
extra, duplicate or wrongly typed fields and incorrect tuple arity/types reject.
Normal contextual conversions are permitted only where already specified; no Any,
Map, open row, runtime introspection or shape erasure fallback. Initializers run
once in source order; naming a type adds no runtime evaluation or allocation.

A formatter preserves the binder, including the required space between infer
and the identifier, and cannot erase it or rewrite it into an initializer infer.
Unresolved/empty/cyclic ambiguous shapes reject, rather than inventing a type.
General generic containers, fields with unresolved inference dependencies and
new export syntax are outside this first draft.

Related existing work: record-struct-layout-v1, anonymous-structural-shapes-v1,
atto-source.llvm#514/#510, atto-source.rs#274/#321, atto-source.java#1155.
These are distinct initializer/layout proposals, not proof of named type binding.
