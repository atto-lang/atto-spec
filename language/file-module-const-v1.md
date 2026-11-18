# File/module `define const` v1: constexpr and runtime-once environment bindings

Status: **Accepted user-directed syntax/semantic target; implementation and backend tests pending.** This proposal supersedes the earlier compile-time-only interpretation of file/module `define const` (including the earlier rejection of `os.read_env`). Existing *local* `const` rules in [compile-time-constants-v1.md](compile-time-constants-v1.md) remain compile-time-only until separately changed.

## Canonical syntax and two initialization classes

```ebnf
top_const_decl = "define", ["pub"], "const", type_ref, IDENT, ("=" | "as"), const_initializer, ";" ;
const_initializer = typed_constexpr | static_env_read ;
static_env_read = "os", ".", "read_env", "(", constant_nonempty_string_key, ")" ;
```

Both `=` and `as` are **exactly equivalent declaration-initializer separators**. A formatter may canonicalize them, but must not change semantics. `define const` is valid as an unconditional direct member of a source file or `define module` block. `define pub const` applies existing visibility rules; default visibility is private. It is not valid inside `if`, a loop, a handler, a function, or an actor's dynamically created scope.

```atto
define const int five = 5;                             // compile-time constant
define const int ten as five * 2;                      // folded at compile time
define const string host = os.read_env("APP_HOST");     // runtime-once static constant
define const string port_text as os.read_env("APP_PORT"); // same semantics

define module Settings as
  define const string api_key as os.read_env("API_KEY");
  // Methods in this module can use api_key, subject to visibility.
end
```

The **binding is static, single-assignment and immutable in both cases**. The distinction is *when its immutable value becomes available*. Ordinary pure, typed constexpr initializers are evaluated and folded at compile time. The admitted `os.read_env` initializer is evaluated **exactly once for the runtime program instance**, during deterministic startup/module initialization, not during compilation. It is not a periodically refreshed/dynamic binding, not a lazy re-read per function call, and not a mutable process-wide configuration slot.

The initial v1 runtime-initialized exception is deliberately narrow: **direct `os.read_env` with one compile-time-known, nonempty string key**, and type `string`. This allows the two exact user-requested spellings without enabling arbitrary top-level side effects. Any later expansion (e.g. direct parsing helpers, static initializer functions, interpolation, conditional env fallbacks) requires an explicit, separately verified effect/initialization contract. If the requested key is not a literal in source, it may be a proven compile-time string constant; it must never depend on a runtime variable.

## Runtime and type contract

1. `os.read_env("KEY")` in this declaration context returns a **required string**. The exact `string` annotation is valid; no `Option<string>` annotation is required here. If `KEY` is absent, inaccessible, invalid, or cannot be represented as a valid AttoLang string, startup fails with a typed environment-initialization error (e.g. `EnvMissingError`, `EnvPermissionError`, `EnvEncodingError`); no implicit empty string or default. A literal empty key `""` is invalid (`E_ENV_KEY`). Optional/defaulting API is a separate addition.
2. This initializer is an explicit **effectful static initialization exception**. It is not constexpr, even when the compiler's own process has the named environment variable. AOT builds **must never bake the build machine's environment value into the artifact** or expose the value during compilation.
3. Before the first user `main` or actor is scheduled, the runtime captures the allowed environment inputs into a consistent per-program-instance snapshot and initializes all reachable imported module constants exactly once, in deterministic dependency order. The same source key returns the same snapshot value across modules and actors. Program instances may have different values. Modules are not reinitialized on repeated imports or actor spawns. Initialization cannot be observed in a partially complete state; failure aborts startup without invoking user code.
4. Static `const` values are read-only and safe against rebinding. For strings, expose an immutable owned/frozen string value or an isolation-safe read-only representation. Cross-actor references must respect ownership/isolation; no writable aliasing or mutable global handles.
5. Module/file constant name resolution, duplicate definitions, import/export visibility, dependency cycles, unknown references, and declaration shadowing are checked statically. Reject cycles with `E_CONST_CYCLE`. A runtime initializer may depend on a prior constant key for its environment-name argument only if that key is proved compile-time; runtime env values must never feed new env key names in v1.
6. Compile-time numeric/boolean/string constants keep deterministic typed evaluation and existing compile-time arithmetic/overflow checks (`E_CONST_OVERFLOW`). A top-level runtime-only ordinary call, allocation, filesystem/network request, clock/random read, actor operation, mutable borrow, or runtime conditional initialization remains a compiler error (`E_CONST` or a more precise diagnostic). No silent fallback for unsupported initializers.
7. Environment access is subject to Deno-like runtime permissions on every platform. Denied access errors before user code begins. Host capability injection on browser/wasm must be explicit: **no implicit browser `process.env`** and no insecure fallback. A native AOT executable reads its *launch-time* environment or approved snapshot, never its build environment. New permissions cannot be obtained by importing another module.
8. Secrets from `os.read_env` must not be logged, embedded in compiler outputs or exposed by default introspection. Debugging, crash diagnostics and module exports must not print values automatically. Users decide which values are subsequently passed to actors/services.
9. Conformance requires genuine guest startup, not only parsing: execution with two different provided environments must produce two different immutable results from **the same compiled artifact**; test missing and denied env cases, duplicate keys/snapshots, one-time read, module imports, and no post-startup environment re-read.

## Examples and failures

```atto
define const string x as os.read_env("MY_VAR");   // valid, startup snapshot
define const string y = os.read_env("OTHER_VAR");  // valid, identical semantics

define const int number as os.read_env("PORT");    // E_CONST_TYPE: no implicit string to int
define const string empty_key = os.read_env("");  // E_ENV_KEY: key must be nonempty
define const string dynamic = dynamic_call();     // E_CONST: unsupported side effect
```

The error for a missing or denied runtime key occurs **at startup**, not compilation. A portable runtime may later provide explicit `os.read_env_optional`, `os.read_env_or`, or typed parsing APIs without changing this direct required-string contract.

## Cross-backend evidence requirement

The companion `atto-lang/atto-platform-conformance` registry is the source of portable positive/negative and runtime-startup fixtures. Separate statuses for Rust/browser, Java/GraalVM AOT, LLVM/native AOT, .NET, independent Wasm, Forge and other backends. A parser-only acceptance or spec update is **not** guest execution. Each backend must pin its compiler SHA/tree, artifact, runtime/toolchain, startup environment/capability map, actual result, missing/denied error and permission evidence. Until then mark NOT_EXECUTED, not PASS.

The earlier compile-time-only version of this proposal and its environment-read negative fixture are obsolete and must not be used as conformance criteria.
