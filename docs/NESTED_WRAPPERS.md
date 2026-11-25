# Nested Option and Future — type semantics v1 (task #29)

**Normative contract; compiler/runtime proof: NOT_EXECUTED.**

`Future<Future<T>>` and `Option<Option<T>>` preserve both wrapper layers.
`await` removes **only one** outer Future. `unwrap` removes **only one**
outer Option. An explicit statically typed `flatten` removes exactly one
same-kind layer and never crosses `Future<Option<T>>` or
`Option<Future<T>>`. A `None` is observably different from `Some(None)`.

A source assignment cannot rely on host Task adoption, implicit coercion,
flattening, or generic erasure. The compiler must reject it without generating
a binary. In particular, `Future<Future<int>>` is **not** assignable to
`Future<int>` without an explicit permitted operation.

`contracts/v1/nested-wrapper-v1.json` and `src/nested-wrappers.mjs` implement
an executable **source-free abstract type oracle**. Its Node tests are
not evidence that any backend can compile generic wrappers, run futures,
perform typed matching or publish a guest artifact. The snippets are type
contracts, not validated guest syntax.

Next: reconcile Java #2193, .NET draft #258 and LLVM draft #1190 without
editing their PR heads, then add compiler-generated positive/negative guests
per backend with executed exact-head tests and no-artifact-on-rejection proof.
Do not promote any backend from model-only evidence.
