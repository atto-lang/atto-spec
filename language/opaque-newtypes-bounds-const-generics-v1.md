# Opaque newtypes, bounded values and const generics v1

**Status: TARGET / NOT EXECUTED.** This is a new AttoLang language contract, not a claim that any compiler accepts or executes these examples. The initial implementable slice is exact integer newtypes, interval constraints and nonnegative compile-time integer dimensions. It extends [compile-time constants](compile-time-constants-v1.md) and [ownership vocabulary](ownership-vocabulary-v1.md).

## Motivation and canonical examples

~~~atto
define newtype UserId(i64);
define newtype OrderId(i64);
define newtype Port(i64)
  where value gte 1 and value lte 65535;
end

fnc make_port(i64 raw) -> Result<Port, RangeError> {
  return Port.try_from(raw);
}

fnc send_to(Port port) -> void {
  // Reading a Port does not create an i64-typed argument.
}

define struct Matrix<T, const usize R, const usize C> as
  data: Array<T, R * C>;
end

fnc identity(Matrix<f32, 4, 4> matrix) -> Matrix<f32, 4, 4> {
  return matrix;
}
~~~

These are representative **target** programs. Existing preflight parsers or backends MUST NOT treat accepting this syntax as proof of executable semantics. Portable v1 requires an explicit supported numeric base; wider, unsigned and floating bases may remain unsupported until each backend proves its representation and validator. The shown Matrix layout also requires fixed-size Array support on the target.

## Declaration, scope, identity and visibility

* Canonical spelling is `define newtype Name(Base);` or `define newtype Name(Base) where predicate; end`. Public visibility uses the existing `define pub newtype` convention. `newtype` itself grants opacity; no additional `opaque` keyword is required in v1.
* A newtype is **nominal**, not a transparent alias. The identity key is (canonical package/module origin, declared symbol), never its underlying representation, unqualified source spelling, or hash alone. Two newtypes of i64, including identical bounds, are distinct. Imported references must resolve to their defining identity, not re-create it.
* Newtypes are sealed as single-representation wrappers, not subclassable classes, structural records, or enum cases. Their representation is private outside the defining module. Inside the defining module, representation access may be privileged but may not bypass a declared invariant when creating or mutating a value.
* `type Alias = i64` remains a transparent alias. A newtype cannot be implicitly converted to or from its base, another newtype, or a transparent alias. Overload resolution, pattern matching and generic specialization use nominal identity. No implicit numeral-to-newtype promotion. A generic `T` is not the base type merely because its layout is compatible.
* V1 newtypes have one fixed-size, statically laid-out base or a separately proven immutable scalar handle. Reference-dependent, recursive, unsized, dynamically allocated, generic-unknown and resource-owning representations require further contracts. Newtype copying, borrowing, taking and sharing obey the **base's** ownership traits, not assumed Copy semantics.

## Checked constructors and invariants

* `Name.try_from(base_value)` yields `Result<Name, RangeError>` (or a more specific declared validation Error). An unchecked successful constructor is not publicly available. `Name.from_const(literal)` is admissible only after full compile-time proof; otherwise fails compilation.
* Validate using the exact typed integer domain, not binary64 coercion; intervals are closed and use `gte/lte` (the `>=/<=` aliases are equivalent). Nonempty intervals with optional finite exclusions are normalized at declaration time. Reject an empty domain, out-of-base representable bounds, malformed values and unproved arbitrary `where` predicates. Do not confuse Unicode scalar length with byte length in later string refinements.
* Constant-known successful values may be statically constructed and require **zero runtime validation**. Runtime-unknown values require a checked constructor and a real failure edge; if a backend cannot lower the check, it must fail compilation.
* Checked arithmetic on bounded values is never assumed closed under the range. The result is a base-type scalar unless an operator is explicitly and independently proved to preserve the newtype invariant. Overflow, wraparound, narrowing and range holes must fail closed; integer min/max evaluation is exact.
* When a parameter is a `Port`, its checked invariant is already established. An explicit `as` conversion is **not** an unsafe constructor or a way to defeat nominal identity. Unwrapping to the base is an explicit, visibility-controlled operation; an unsafe FFI/deserialize path is not a `try_from` substitute.
* Flow-sensitive refinement is valid only if an immutable proof witness dominates every use and remains true after mutations, exceptions, async suspension, actor publication and aliasing. V1 does not infer unproven arbitrary predicates or silently insert validations into previously unchecked expressions.

## Const value generics and layout

* Value-generic parameters are declared `const usize N` and used alongside type parameters, e.g. `Matrix<T, const usize R, const usize C>`. `usize` is a nonnegative compile-time integer in the target's admitted range; it is not a runtime argument. Numeric dimension actuals are compile-time expressions evaluated with checked integer arithmetic.
* Generic specialization keys contain both nominal type IDs and the **evaluated typed const values**. `Matrix<f32,4,4>` and `Matrix<f32,2,8>` are not assignable or layout-equivalent at the type level even when byte counts match. Const parameter names and shadowed lexical bindings cannot alter identity.
* Dimensions may appear in fixed-array lengths and layout expressions, such as `Array<T,R*C>`. Multiplication and byte-size multiplication must use checked target-width arithmetic, with positive/zero-size rules enforced by the containing type. V1 permits literals, other const parameters, and pure typed arithmetic which the compiler can fully evaluate. Unresolved symbolic equality (e.g. `R+1 == S` for arbitrary R,S), runtime values, side effects, environment reads and unbounded recursive constexpr are rejected until a separate solver/const-eval contract exists.
* A backend must reject overflowing or resource-exhausting dimensions **before** allocation or codegen, using deterministic bounded evaluation/monomorphization budgets and a target-profile maximum layout size. No silent truncation, wrapping, VLA fallback, dynamically sized heap replacement, or failed-zero-size exemption.
* A `Matrix` indexed with a provably in-bounds compile-time index can omit runtime checks; unknown indices need real bounds checking. Fixed arrays are inline where the target profile promises inline storage; shape alone does not guarantee stack placement.

## Representation and boundaries

For an eligible newtype, `size_of<Name>() == size_of<Base>()` and `align_of<Name>() == align_of<Base>()` in the same target profile, with no per-instance tag, heap box, GC header or dynamic check **after** a successful construction. This is a **layout goal with a mandatory backend ABI proof**, not authorization to erase nominal type identity in typed IR, optimizer checks, debug diagnostics, serialization schemas, actor-message contracts or hot-reload descriptors.

Cross-module, FFI, actor and serialization admission must preserve (or independently validate) the fully qualified nominal type and invariant. Deserialization validates before publication; direct raw memory reinterpretation is not a trusted constructor. ABI exposure must be explicitly declared, and compatibility must be versioned across recompiled modules and hot reload. Runtime provenance or capability checks may exist at boundaries without adding per-value storage overhead to local scalar newtypes.

Const generics likewise cannot hide layout differences at ABI boundaries: the complete evaluated argument list participates in type identity, serialization shape and binary layout fingerprint. Never materialize a value of a different shape by byte reinterpretation.

## Required diagnostics and negative cases

| Code | Example of prohibited operation |
| --- | --- |
| `E_NEWTYPE_MISMATCH` | Passing `OrderId` where `UserId` is required |
| `E_NEWTYPE_CONSTRUCTION` | Raw assignment/cast/deserialize used as unchecked nominal construction |
| `E_RANGE_INVALID` | Out-of-bounds constant or contradictory/empty range |
| `E_RANGE_UNPROVEN` | Arbitrary predicate or unsafe narrowing without a proof/check |
| `E_CONST_GENERIC_ARG` | Runtime value, negative dimension or unsupported const expression |
| `E_CONST_OVERFLOW` | Integer operation or layout product overflows |
| `E_CONST_LAYOUT_BUDGET` | Finite evaluation or target storage budget exceeded |
| `E_CONST_SHAPE_MISMATCH` | Passing `Matrix<T,2,8>` for `Matrix<T,4,4>` |
| `E_NEWTYPE_ABI` | FFI, actor, hot reload or wire protocol loses nominal identity |

These diagnostic names are target stable families; exact compiler emissions need backend evidence. Error messages must never leak an uninitialized value, fabricate a successful `Result`, or emit a runnable guest when the type rules reject the program.

## Relationship to prior work

Java [atto-source.java PR #792](https://github.com/atto-lang/atto-source.java/pull/792) stages refinement/newtype parsing, bounded interval and nominal proof logic, with an intentional fail-closed TypeChecker gate. [atto-source.java PR #1092](https://github.com/atto-lang/atto-source.java/pull/1092) hardens descriptor identities and interval metrics. Integrate those mechanisms and resolve overlaps rather than copying an unsafe runtime into another compiler. The earlier refinement work does **not** establish executable checked construction, const-generic layout or native parity. All language backends must be treated as **NOT VERIFIED** for this combined v1 contract until independently executed.

Rust's value const-generics and Scala's opaque aliases inform the design, but AttoLang keeps its own `const` meaning, `define newtype` grammar, `try_from` discipline, `take!`/`borrow!` ownership rules, and actor isolation model.

## First executed source-local newtype profile (Rust/browser, November 22, 2026)

The Rust/browser compiler now has a **narrow executable subset**, not complete v1 support:

~~~atto
define newtype Port(i64)
  where value gte 1 and value lte 65535;
end
fnc identity(Port value): Port { return value; }
fnc as_integer(Port value): int { return value.to_base(); }
pub fnc main(): int {
  val Port port = Port.from_const(42);
  return as_integer(identity(port));
}
~~~

* File-private newtypes only; explicitly checked `from_const` literal construction, immutable local values and source-local nominally type-checked helper calls. `to_base()` is an explicit **same-module** representation read for this Copy-scalar subset, not a public cast or blanket generic conversion.
* Before scalar code generation, the source is parsed through a bounded nominal checker, with every admitted local declaration, constructor, parameter, call and return validated. Positional const dimensions never intercept existing named AoS/SoA/AoSoA generic-layout arguments; full library regression tests proved their established checker and diagnostics remain intact. The generated code uses the **production** typed scalar checker and Wasm emitter. Each live newtype value occupies an i64 stack/register slot, with no guest object, per-instance tag or heap allocation.
* The **static-only profile** still rejects dynamic `try_from`. A separately checked, source-local runtime-result subset is described below; public nominal ABI, checked mutable ownership, cross-file/module imports, wire formats, actors, FFI, runtime layout reflection and generic Array/Matrix allocation **still reject**. A declaration-only unused newtype does not authorize executable guest code.
* Exact Rust source head `ffcb86945c380b8e177408b1fc196c14b55df3bc` passed [alternate Actions 44970145702](https://github.com/zed-pkg-test/zed-pkg-e2e/actions/runs/44970145702): **78/78 Git source blobs verified**, actual production Rust browser compilation, **8/8 preflight integration**, **5/5 newtype guest integration**, **66/66 library** tests (79/79 total), plus **3/3 compiled Wasm guest executions** and **3/3 negative compiler/no-Wasm cases**. Guest module inspection confirmed **no host imports and no guest heap** in those three scalar programs. Carrier tests cover the complete executable compiler crate, new source test files and updated source CI workflow, not a claim of whole-repository or cross-backend parity. The source CI workflow now includes real compiled-newtype guest execution, but source-org runs remain zero-step runner failures; an authorized private carrier provided stepful evidence.
* All other backend statuses and the combined v1 contract remain **NOT VERIFIED**, even though this focused Rust/browser subprofile has real guest execution. Never conflate scalar inline representation with general FFI/actor ABI certification.

## First executed runtime-checked Result newtype profile (Rust/browser, November 22, 2026)

A second, deliberately bounded compiler profile admits a **private** Result success type that is nominally distinct from the signed-i64 representation:

~~~atto
define newtype Port(i64) where value gte 1 and value lte 65535; end

fnc create_port(int value): Result<Port,RangeError> {
  return Port.try_from(value);
}

pub fnc main(): int {
  val int input = 8080;
  val Result<Port,RangeError> checked = create_port(input);
  match checked over
    on Ok(port) -> { return port.to_base(); }
    on Err(reason) -> { return 0; }
  end
}
~~~

The success and failure path execute in **real compiled Wasm**, with signed 64-bit comparisons, single evaluation of the input and recoverable `Err` on out-of-range values. A closed nominal typing stage retains `I64`, `Nominal(name)`, and `Checked(name)` identities for source-local constructor arguments, typed helper results, bindings, `Ok` payloads, and explicit `to_base()` before any representation lowering. It refuses raw-to-newtype implicit conversions, `Result<Port,RangeError>` versus `Result<Other,RangeError>`, non-exhaustive or malformed matches, and public/cross-module interfaces.

**Representation boundary:** This is **not yet** general `Result<Port,RangeError>` or `RangeError extends Error` support in the production AST. Inside this restricted *inaccessible, non-public* ABI, the checked nominal `Result` lowers to the already implemented guest `Result<int,string>` tagged-ADT representation, using a private stable `"RangeError"` marker for failed range checks. The source cannot inspect the marker, expose the Result through public functions, treat it as an Error object, perform FFI, serialize it, or use arbitrary Result methods. A Result record currently uses the existing guest ADT allocation; the successful Port scalar itself remains an unboxed i64. Full first-class Error identity, shared general typed IR, and public Result ABI **remain outstanding**.

**Verified receipt:** Exact source head `ab108dc996f5a781e3ddb24923c0fecf01efb89a` passed [alternate private Actions run 44973367883](https://github.com/zed-pkg-test/zed-pkg-e2e/actions/runs/44973367883), after **81/81 exact compiler-crate/test/source-workflow Git blob SHA matches**. Actual Rust tests passed: **66/66 complete library**, **8/8 admission integration**, **5/5 static guest integration**, **11/11 runtime guest integration** (90/90). Native `attoc` compiled and executed **3 static + 10 runtime** Wasm guests, including valid 1/42/65535, out-of-range Err, direct `try_from`, and signed i64 extremes on an unbounded newtype; **3+4 invalid/no-artifact cases** passed. Runtime guests used zero host imports and returned no panic. New Rust source and test passed rustfmt, and **strict Clippy passed on the source CI's pinned Rust 1.85.1**. The source repository run [44973351794](https://github.com/atto-lang/atto-source.rs/actions/runs/44973351794) failed with **zero executed steps** and is an infrastructure failure, never a compiler test result. The complete repository fixture corpus and other backends remain **NOT VERIFIED**.

**Still gated:** General expression-form `return match` for checked Result, arbitrary borrowing and escaping of checked Results, real `RangeError` class values, public exports, actor/FFI/wire interfaces, const-generic Array/Matrix physical storage, and independent compiler parity. Do not promote full v1 conformance from this source-local proof.

## Canonical semantic Result graph + return-match guest parity (Rust/browser, November 22, 2026)

A **new bounded executable advancement** on source head \`f55af346231eb2bcfb766aa18d2f8f59cbfcb664\` introduces \`src/newtype_typed_ir.rs\`: a parameterized semantic \`Result<Ok,Err>\` graph with distinct \`Nominal(name)\`, \`I64\`, \`Error\` and \`RangeError\` types, a statically declared \`RangeError extends Error\` relationship, and explicit private nominal declaration identities that include their module owner. \`Result<Port,RangeError>\` is invariant and distinct from \`Result<Port,Error>\` and \`Result<UserId,RangeError>\`; sharing an i64 representation is not sufficient for type identity.

The existing **private** runtime guest checker now consumes the structured parameterized semantic types instead of the earlier \`Checked(name)\` pseudo-type, and admits a restricted, exhaustively checked \`return match\` expression with \`Ok(port) -> port.to_base()\` and \`Err(_) -> 0\`. Matching checks both variants, enforces comma separation between expression arms and refuses opaque implicit return values, public nominal exports or arbitrary error substitutions. This is an actual compiled guest behavior but **not yet full integration with the production general-purpose AST/checker**: after complete private semantic verification, its existing backend lowering still emits a \`Result<int,string>\` tagged ADT with an inaccessible \`"RangeError"\` marker. The semantic Error subclass is not a runtime Error object, and the Result record is guest-allocated. General-purpose \`Result<T,E>\`, Error object identity/ownership, full typed HIR, cross-module public ABI, ownership, actor/FFI and Array/Matrix physical const-generic layouts remain **NOT IMPLEMENTED** and fail closed.

**Exact native and browser evidence:** [Authorized private Actions run 44979314229](https://github.com/zed-pkg-test/zed-pkg-e2e/actions/runs/44979314229) succeeded on carrier \`1a82089499ee4648591f0f9012eeb7b2eb6ce3b7\`. An independent Git-tree audit verified 84/84 executable Rust source/test/workflow blobs and 14/14 shared conformance fixture/registry/test blobs (98/98 exact matches). **101/101 Rust tests** passed (70 library, 8 admission, 5 static newtype, 11 runtime Result, 7 semantic Result/return-match), along with **17 compiled native attoc guest executions** (3 static, 14 runtime), **ten negative/no-artifact cases**, pinned Rust 1.85.1 strict Clippy and rustfmt. The actual **wasm32-unknown-unknown browser compiler** produced **6 byte-for-byte identical** Wasm guest programs compared with native \`attoc\`, executed them with zero host imports/panics, and rejected **8 negative cases** with matching native/browser diagnostic families and no output artifacts. Two host-only registry assertions passed; the broad twelve target fixtures and independent non-Rust compilers remain NOT_VERIFIED. The source-org Actions [44979253910](https://github.com/atto-lang/atto-source.rs/actions/runs/44979253910) failed with **zero executed steps**, an infrastructure admission failure, not proof against the implementation.

## Required implementation sequence and evidence

1. Shared canonical grammar, type/const AST, nominal identity and integer interval normalization (the shared spec/conformance target).
2. Compiler frontend: fail-closed static mismatch diagnostics, checked construction, const-evaluator and layout arithmetic; preserve nominal shape metadata through typed IR.
3. Real guest execution: positive range boundaries and matrix storage/indexing, negative compile diagnostics, runtime-unknown invalid input, and cross-module/actor/FFI/serialization spoofing tests.
4. Exact-head parity receipts per Java, LLVM, .NET, Wasm, Forge, Rust, JS, Cranelift, HDL and other target profiles. Each must name source commit + tree/blob SHAs, executed compiler and compiled guest, environment, accepted/rejected cases and performance/layout verification. A parser-only pass, host model, smoke fixture or zero-step CI is **NOT EXECUTED** for guest parity.

See the companion machine-readable contract `contracts/opaque-newtypes-bounds-const-generics-v1.json` and shared fixtures in `atto-platform-conformance`. The initial test harness is host-only and is not a substitute for executing the AttoLang compiler.
