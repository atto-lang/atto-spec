# core, alloc and std libraries: imports, layering and platforms (v1)

**Status: NORMATIVE (finalized 2026-11-22).** This document settles how the
compiler-owned libraries are named, imported and layered. It supersedes the
competing library-selector addenda in `unified-static-imports-v1.md`
(dotted `"std.fs"`, bare `import http from ...`, `pkg` for builtins). The
general import grammar in that document still applies.

## 1. Three layers, like Rust

| Layer   | Requires                                   | May import          | Typical units |
| ------- | ------------------------------------------ | ------------------- | ------------- |
| `core`  | nothing: no heap, OS, scheduler or host    | `core`              | `num`, `cmp`, `option`, `result`, `mem` |
| `alloc` | `core` plus an explicit allocator provider | `core`, `alloc`     | `arena`, `vec` |
| `std`   | a hosted target (operating system/runtime) | `core`, `alloc`, `std` | `io`, `path` |

* `core` must compile for bare-metal and freestanding targets
  (`thumbv7m-none-eabi`, `wasm32-unknown-unknown`).
* `alloc` units declare the allocator provider they need. A freestanding
  build admits them only when it names a provider (for example LLVM
  `--allocator-provider=bounded-arena`). There is no hidden global heap and no
  tracing GC: arenas, actor heaps and owned buffers release deterministically.
  On the JVM and .NET the library allocates from compiler-managed arenas so the
  host garbage collector has almost nothing to collect.
* `std` is rejected on freestanding targets with a compile-time diagnostic.
* A library unit importing a higher layer is a compile-time error (for example
  a `core` unit importing `alloc/*` or `std/*`).

`Option`, `Result`, `Some`, `None`, `Ok` and `Err` stay compiler-provided
prelude nominals. `core/option` and `core/result` add helper functions; they do
not redefine the types.

## 2. Selectors

The canonical selector for a library unit is

```
"<layer>/<unit>"      e.g. "core/num", "alloc/arena", "std/path"
```

* `<layer>` is `core`, `alloc` or `std`; `<unit>` is one lowercase identifier
  (`[a-z][a-z0-9_]*`, at most 64 bytes). Units are flat: no nesting, dots,
  `..`, `.` or uppercase.
* Equivalent spellings, all naming the same unit identity:
  `"atto.<layer>/<unit>"` (long form) and an optional `.atto` suffix.
  Formatters print the canonical short form.
* Migration aliases: `"ores.core/<unit>"`, `"ores.std/<unit>"` and the legacy
  `"std/<unit>.ores"` forms remain accepted where a compiler already accepted
  them. New code must not use them.
* The roots `core/`, `alloc/` and `std/` are **reserved**. They never fall
  through to the filesystem, `ATTOLANG_PATH`, `+/` project roots or packages.
  An unknown unit is a compile-time error (`unknown compiler-owned <layer>
  module '<selector>'`). To import a project file in a folder called `core`,
  write `"./core/x.atto"`.
* Dotted strings such as `"std.fs"` are **not** library selectors. Dotted
  identities name third-party packages and need `pkg` (`from pkg "acme.json"`).
* `./`, `../` and `+/` keep their file and project-root meanings.

## 3. Import forms

Namespaces and modules are both used, at different levels:

* the **layer** (`core`, `alloc`, `std`) is the namespace. It is implied by the
  selector root; library unit files carry no `use namespace` header.
* each **unit** is a module: the unit file defines exactly one
  `define module <unit> as ... end` with `pub` exports.

Every compiler must accept the module form:

```atto
import module num from "core/num";
import module arena from "alloc/arena";
import module path from "std/path";

pub fnc main(): int {
  return num.clamp(arena.remaining(16, 64), 0, 42);
}
```

Compilers that implement namespace aliases and selective imports (Java today)
also accept:

```atto
import * as num from "core/num";          // alias of the unit's public exports
import fnc checked_add, saturating_add from "core/num";
```

All forms bind statically declared `pub` exports only. A private function is
an `unknown function` error at the call site.

## 4. Platform-variant units

A unit can have OS-specific sources. The import spelling never changes; the
compiler picks the source for the target OS family:

| Unit       | POSIX (Linux, macOS, BSD) | Windows |
| ---------- | ------------------------- | ------- |
| `std/path` | separator `/` (47), list separator `:` (58) | separator `\` (92), list separator `;` (59); `/` also accepted as a separator |

Native compilers default to the host OS and take an explicit override
(LLVM: `--target-os=linux|macos|freebsd|posix|windows`). JVM and .NET compilers
may implement `std/path` over the host runtime's path API, but must expose the
same function names and results.

## 5. v1 unit catalog

Every compiler that ships a unit must provide these exported functions with
these results. Types are `int` (signed 64-bit), `bool`, `string`,
`Option<int>` and `Result<int,int>`. Plain `+`, `-` and `*` on `int` are
checked and trap on overflow; the helpers below report overflow as values.

* `core/num`: `max_value()`, `min_value()`, `abs(x)`, `signum(x)`,
  `min(a,b)`, `max(a,b)`, `clamp(v,lo,hi)`, `checked_add(a,b): Option<int>`,
  `checked_sub(a,b): Option<int>`, `saturating_add(a,b)`,
  `saturating_sub(a,b)`, `pow(base,exp)` (traps on overflow).
* `core/cmp`: `compare(a,b)` → -1/0/1, `between(v,lo,hi): bool`,
  `min3(a,b,c)`, `max3(a,b,c)`.
* `core/option`: `is_some(o)`, `is_none(o)`, `unwrap_or(o,d)`, `or(a,b)`,
  `from_bool(present,v)`, `ok_or(o,err): Result<int,int>`.
* `core/result`: `is_ok(r)`, `is_err(r)`, `unwrap_or(r,d)`,
  `ok(r): Option<int>`, `or(a,b)`.
* `core/mem`: `is_power_of_two(x)`, `log2_floor(x)`,
  `align_down(v,align): Option<int>`, `align_up(v,align): Option<int>`,
  `is_aligned(v,align)`. Invalid alignment or negative values give `None`.
* `alloc/arena`: bump placement over an explicit `(used, capacity)` cursor:
  `place(used,cap,size,align): Option<int>`, `advance(used,cap,size,align)`,
  `remaining(used,cap)`, `reset()`.
* `alloc/vec`: owned `Array<int>` buffers: `sum_range(start,count)`
  (count clamped to 0..8 in v1), `replace_middle(a,b,c,replacement)`.
* `std/io`: `write_int(v)`, `write_str(s)`, `write_line(s)`.
* `std/path`: `separator_code()`, `list_separator_code()`,
  `is_separator_code(c)`, `is_windows()`, `join(parent, child): string`.

Backends may implement a unit in different source (each `atto-source.*`
repository owns its own `.atto` files, written in the subset that backend
lowers), but public names, types and results are the parity boundary.

## 6. Conformance

The shared guest corpus lives in
`atto-platform-conformance/libraries/v1/` (one program per case, with
`// expect-exit:`, `// expect-stdout-json:`, `// expect-error:` and `// flags:`
headers). A backend claims a unit only after it compiles, links and runs the
positive guests and rejects the negative ones. Required negatives: unknown
unit, traversal (`core/../x`), nested unit (`alloc/x/y`), private export,
`std/*` on a freestanding target, and a layer violation inside a library unit.
