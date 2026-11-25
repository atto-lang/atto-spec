# Class field binding defaults v1 — implicit `let`

**Status: accepted AttoLang target design (2026-11-18); backend conformance not yet proven.** This rule covers **ordinary class fields**. Do not generalize it to local variables, file/module declarations, structural records, structs or sealed actor state without their own scoped contracts. A parser accepting a declaration is not sufficient evidence of mutation, ownership or codegen semantics.

## Normative default

For a type-first ordinary class field, omitting a binding modifier is **exactly `let`**. The rule is independent of the field's primitive/nonprimitive type and must be fixed at declaration resolution, not chosen again during generic specialization:

```atto
define class Foo as
  pub int value = 1;                    // equivalent to pub let int value = 1;
  pub string name = "hello";           // equivalent to pub let string name = "hello";
  pub Bar child = new Bar();           // equivalent to pub let Bar child = new Bar();

  pub val int id = 42;                 // one binding, no rebinding
  pub val mut Bar manager = new Bar(); // cannot replace manager, may mutate referent with permission
  pub final int initial_seed = 7;      // single assignment; see definite-assignment restriction
  pub const int limit = 1000;          // constexpr required in class field scope
end
```

`pub T field = expression;` and `pub let T field = expression;` have identical binding/referent permissions, initialization and effect rules, visibility, and field layout. Type-first declarations with `:` initializers that the legacy syntax permits must also not silently gain an unrelated constant or immutable mode solely because the separator changes. No implicit `mut` is added.

**Generic invariant:** `define class Box<T> as pub T value = initial; end` has the same **rebindability** regardless of whether `T` is `int`, `string`, `Foo`, an aggregate or a user-defined generic substitution. Type-dependent `let`/ `val` switching is forbidden.

## Four independent questions

1. **Binding rebinding:** `let` allows replacing the stored value/reference; `val` disallows replacement after initialization.
2. **Referent write permission:** `mut` grants requested write access through that binding **only if ownership, active borrows, field visibility, receiver capabilities and actor isolation allow it**. `mut` never makes the binding reassignable.
3. **Evaluation time:** `const` requires compile-time evaluability for ordinary class fields and local bindings. A `const` declaration never allows reassignment. The narrowly scoped *file/module* `define const string x = os.read_env("KEY");` exception is runtime-once and does **not** apply to class fields.
4. **Definite assignment:** `final` permits exactly one assignment, including a possible deferred constructor assignment in the **target language** only where a compiler proves every construction path initializes it once before observation/publication. This is distinct from `val`, which must be initialized in its declaration/initialization phase. If a backend cannot prove deferred initialization, it must reject it; existing browser backend only supports initialized `final` fields.

| Class field declaration | Replace binding after construction? | Mutate referenced object through binding? | Initializer requirement |
| --- | --- | --- | --- |
| `T x = e` / `let T x = e` | Yes, given authorized mutable receiver | No, unless `mut` | Runtime permitted |
| `let mut T x = e` / `mut T x = e` | Yes, given authorized mutable receiver | Yes, subject to ownership and inner field rules | Runtime permitted |
| `val T x = e` | No | No | Runtime permitted |
| `val mut T x = e` | No | Yes, subject to ownership and inner field rules | Runtime permitted |
| `final T x = e` | No | No, absent independently specified write authority | Once, at declaration or checked constructor phase |
| `const T x = e` | No | No | Compile-time evaluable |

`const mut` is **not** permission to mutate a compile-time constant, shared frozen graph or constant declaration. Where existing Atto rules allow a separately materialized mutable runtime referent, it must be proved independent and writable; other cases fail closed. No implicit `mut` for any class field.

## Scopes deliberately differ

```atto
define class Counter as
  pub int count = 0;  // implicit let (CLASS FIELD ONLY)
end

fnc demo(): int {
  int bound = 5;      // existing type-first LOCAL shorthand: const int bound = 5
  let int changing = os.some_runtime_int(); // runtime local; explicit let
  return bound + changing;
}

define const string key = os.read_env("API_KEY"); // separate file/module startup-once rule
```

The compiler must classify the declaration context before selecting the default. **Never rewrite type-first locals** to `let`, and never copy the file/module environment exception into class `const`. A class initializer that invokes runtime I/O remains legal for `let` or `val` only under normal effects, permissions and construction rules.

## Safety and compatibility

- Mutating a field in an ordinary class additionally requires an appropriately mutable `self` or instance loan. A default-`let` field is **not** an implicit backdoor around a read-only method receiver. A compiler without verified mutable-instance methods must reject those writes instead of faking successful execution.
- `val mut Foo x` means a stable binding to a potentially writable object, not a deeply frozen object; `val Foo x` provides no implicit referent mutation, though separately authorized aliases may still exist.
- Borrowing, `take!`, `share!`, `copy!` and `copy!!` remain independently checked; rebinding must drop/transfer old storage safely, may not invalidate active borrows, and must not leak aliases.
- Actor state is sealed: `handle_state(critical-read |s| -> ...)` and `handle_state(critical-write |s| -> ...)` remain the only authorized access path. No ordinary class default changes actor scheduling or state protection.
- No primitive-vs-object special cases; no silent change in field semantics after generic instantiation; no change in visibility, layout, initialization order, class inheritance or ABI.
- Legacy `name: T = e` class field forms and class constructor/field initialization are a separate migration and should not be opportunistically reformatted to `let` if their existing semantics differ. Rewriting needs per-form semantic equivalence tests.
- `final` and `val` are not synonyms in the target spec. A compiler that only represents both as `FieldMode::Final` has **partial** enforcement, not full conformance.

## Required conformance

The companion registry `atto-platform-conformance/contracts/class-field-binding-defaults-v1.json` defines positive and negative cases. Each backend must prove:
- Identical typed field modes and emitted guest behavior for bare `T x=e` and explicit `let T x=e`, across scalar, string, class and generic types.
- `let`/ `let mut` rebindability and `val`/ `val mut` rejection of rebinding, *separately* from referent-write permissions.
- Read-only receiver rejection, exclusive mutable borrow admission, `final` exactly-once assignment (and invalid reinitialization), `const` runtime-init rejection, and existing local shorthand `const` retention.
- Unauthorized actor access/aliasing fails before artifact emission.
- Both positive **executed guest** and negative **compile-time** receipts pinned to exact source/backend/runtime SHAs. Mark unsupported or not executed honestly. Parser-only tests cannot satisfy this gate.

As of this design, the Rust/browser subset parses the implicit `let` form as `FieldMode::Constructor`, and explicit `val`/`final`/`const` are largely collapsed into `FieldMode::Final`; class method self is read-only. This is **not** complete `mut`, `val`, `const` or cross-backend implementation. The contract requires distinct future typed-IR representation rather than claiming equivalence.
