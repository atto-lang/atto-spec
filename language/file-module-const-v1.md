# File/module `define const` v1: constexpr and non-throwing environment-backed constants

Status: **User-approved target semantics; backend implementation and executed conformance pending.** Supersedes the old file/module compile-time-only `define const` interpretation. Local function-scope `const` still requires compile-time evaluation; this extension is deliberately scoped to file and module declarations.

## Syntax and constant classes

```ebnf
top_const_decl = "define", ["pub"], "const", type_ref, IDENT, ("=" | "as"), const_initializer, ";" ;
const_initializer = typed_constexpr | static_env_read ;
static_env_read = ("std", ".", "env", ".", "read_env" | "os", ".", "read_env"),
                  "(", compile_time_string_key, ")" ;
```

Both `=` and `as` are equivalent and must produce the same typed static binding. A `define const` declaration appears unconditionally directly inside a source file or module, not within control flow, actor handlers, functions, dynamically created blocks or recursive initialization. `define pub const` exports through normal module visibility; otherwise the constant is private. The formatter may normalize the initializer separator without changing its meaning.

```atto
define const int five = 5;
define const int ten as five * 2;

define const string api_host = std.env.read_env("API_HOST");
define pub const string status_valid = std.env.read_env("status_valid");
define const string token as os.read_env("TOKEN");
define const string empty_name = os.read_env(""); // legal; returns ""

define module Settings as
  define const string region = os.read_env("REGION");
end
```

Two kinds of **static immutable `const`** exist under the *same* declaration syntax:

- **Known-at-compile-time constant:** deterministic typed constexpr is folded into a literal/static value, with no runtime initializer.
- **Runtime-initialized static constant:** a direct `std.env.read_env(...)` (or legacy `os.read_env(...)`) reads the *launch-time environment* once during process/module initialization, before user `main` or actor dispatch, then stores an immutable value. It is **not** compile-time evaluation, mutable global state, a lazy re-read, nor conditional/dynamic binding. The build environment must never be baked into an AOT artifact.

The initial supported runtime initializer shape is deliberately narrow: **direct `std.env.read_env` or legacy `os.read_env`, each with exactly one compile-time-known string key and a `string` result**. Key expressions may be a literal (including `""`) or an already proven constexpr string; a runtime-derived key is forbidden. Broader runtime-init expressions require separate effect and initialization admission rather than automatic arbitrary side effects.

## Importing static constants and prohibiting top-level variables

A file or namespace exports an eligible `define pub const` through a typed
`import const name, other as alias from "std.http";` or
`import const name from "./file.atto";`. This is **static symbol selection**,
not copying mutable global storage or a call to a property getter. See
[typed constant imports](constant-imports-v1.md) for visibility, alias,
kind-checking, dotted package selectors and conformance requirements.

At file/namespace scope, bindings must use the unconditional `define const`
form. Top-level `let`, `val`, `var` and `const mut` declarations are
invalid, including inside a namespace. Runtime-local `val` and `let`
continue to exist inside callables. The permitted startup environment read
does not relax the global immutability rule.

## `std.env.read_env` and `os.read_env` API contract

The canonical standard-library spelling is `std.env.read_env(key)`. In the
standard-library profile, the fully qualified `std.env` root resolves as a
**known static standard namespace** even without an explicit import in the
source file. The older `os.read_env(key)` spelling remains accepted for
backward compatibility. Both names resolve to the same capability-checked
runtime environment accessor **by symbol identity**, not because arbitrary
user-defined functions happen to share the text `read_env`.

An explicit `import * as env from "std.env";` may create an alias and allow
`env.read_env(...)` as a static initializer **only once the alias is proven
by the package resolver to refer to that same standard-library symbol**.
User packages that declare an `env` namespace or another `read_env` function
must not be admitted as a privileged initializer. On a profile without the
`std.env` capability/provider, linking must fail closed rather than compile
an arbitrary runtime call or synthesize a build-time value.

A `define pub const string status_valid = std.env.read_env("status_valid");`
is importable as an immutable string. Publishing an environment-backed
constant can expose the value to packages authorized to import it; authors
should not mark secret-backed constants `pub` without intending that
visibility. An import never grants an environment capability to an otherwise
denied accessor, and a successful imported read does not perform a new host
lookup.

`os.read_env(key: string): string` is a **total, non-throwing, non-raising** environment accessor for the supported host profile. It cannot propagate `throw` or `raise`, and does not return `Result`, `Option` or a nullable value. An ordinary permitted call always produces a valid AttoLang `string`. The static initializer does **not** have to catch or recover a missing variable.

- **Present and readable key:** return its string value, including `""` when the variable was explicitly set to empty.
- **Unset key:** return `""`, not a missing-variable exception, panic, or failed initialization.
- **Empty key `""` or a host-invalid key:** return `""`, not a compile-time rejection merely because of the name.
- **Environment access denied by the active permission capability:** return `""` without revealing any prohibited value; no exception is thrown/raised by `os.read_env`. The runtime may generate a sanitized permission-audit event, but the accessor must not print a value or implicitly elevate a capability. This makes denied, missing and empty indistinguishable through this simple accessor **by design**. A distinct opt-in strict API or startup permission preflight can report failures if desired.
- **Host value cannot be represented as valid AttoLang string:** implementations must use a documented deterministic conversion to a valid UTF-8 string (e.g. lossy replacement of invalid sequences), never leak raw invalid bytes or throw/raise. Backends must agree on the conversion in a separate platform-profile contract.

`os.read_env` is **impure/effectful** (it observes host process state), despite being total and non-throwing. The file/module static initializer is a specific exception to compile-time constant evaluation, *not* permission to call any function marked non-throwing at top level. For stricter configuration validation, a separately defined `os.require_env` or `os.read_env_optional` may distinguish missing/permission-denied from empty, but these are **not** the `read_env` API contract.

A declaration `define const int port = std.env.read_env("PORT");` (and the legacy `os.read_env` spelling) remains a **compile-time type error** (`E_CONST_TYPE`), since a string is not implicitly converted to an integer. Typed environment parsing is a separate explicit operation/API.

## Initialization, lifecycle and ownership

1. Capture permitted startup environment key values through the runtime capability provider before the first user `main`, actor message or module method. A given key is read from the host **at most once per program instance**, and reused for each `define const` depending on that key. Module initialization is deterministic, dependency-ordered, single-assignment and once per program instance (or once per explicitly isolated deployment unit), never once per actor spawn.
2. The startup snapshot remains stable even if the host environment subsequently changes. Running the **same compiled binary** with different startup environments produces different constants. No module startup code may observe partially initialized values or leak a mutable alias to their storage.
3. Immutable strings are accessible across actor domains only through a provably safe immutable/frozen representation or compliant ownership transfer. This facility does not grant mutable shared-state access or bypass actor sealed state.
4. Resolve constant identifiers and imports by binding identity, enforce visibility, reject duplicate declarations and dependency cycles (`E_DUPLICATE`, `E_CONST_CYCLE`) and reject unknown/unresolved keys. Module/private visibility remains enforced; no import may gain environment permissions.
5. Keep deterministic compile-time type checking, constexpr folding and overflow diagnostics (`E_CONST_OVERFLOW`) for pure initializers. The non-throwing guarantee of an *ordinary* runtime call does not make it constexpr or statically admissible. Top-level function calls, random/clock reads, filesystem/network I/O, actor actions, mutable borrows, allocations and conditional runtime initializers still fail closed (`E_CONST`).
6. The runtime environment provider must have explicit permissions in browser/worker/Wasm. A denied key must never leak through a fallback host provider. A native AOT executable reads its launch-time environment rather than values from the machine compiling it.
7. Do not automatically log, stringify, embed in diagnostics, or serialize environment-backed secrets. A private const is not automatically exported to foreign host code.

## Examples and edge conditions

```atto
define const string a as os.read_env("MY_VAR");  // valid
define const string b = std.env.read_env("OTHER_VAR"); // valid
define const string c = os.read_env("");          // valid; ""

define const string name as "MY_VAR";             // compile-time constant
define const string d = os.read_env(name);        // valid; compile-time-known key

define const int port = std.env.read_env("PORT"); // E_CONST_TYPE
define const string bad = dynamic_call();        // E_CONST
```

Missing/denied/invalid keys are not errors from `os.read_env`; they return `""`. Empty variables also return `""`. Users who need to distinguish those states should opt into a different explicit API rather than relying on this total string-returning accessor.

## Verification

The conformance suite must also exercise fully qualified `std.env.read_env`
in a `use namespace std.http;` file, its `define pub const` export through
`import const`, a second launch of the *same* AOT image under another
environment, legacy spelling equivalence, denied access and a spoofed
user-defined `read_env` callee rejection.

The companion [atto-platform-conformance](https://github.com/atto-lang/atto-platform-conformance) registry must check both separators; file and module scopes; compile-time folding; runtime-only snapshot; absent, explicitly empty, invalid-name and denied keys returning `""`; no throw/raise; permissions; startup exactly-once; same AOT artifact with two environments; duplicate/cycle/type mismatch and unsupported dynamic initializer rejections. Mark a backend PASS only after executing actual guest results pinned to source/compiler SHA and declared runtime capabilities. Host-only tests or syntax acceptance do not establish Java/LLVM/.NET/independent Wasm/Forge parity.
