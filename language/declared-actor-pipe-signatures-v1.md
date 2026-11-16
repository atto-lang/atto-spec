# Nominal `declare actor` signatures with receives/emits/sends (v1)

**Status:** accepted syntax direction, proposed namespace-linker contract; not proof of executable out-of-line actors or cross-backend parity.

This contract reconciles the earlier [Java namespace actor headers](https://github.com/ores-truffle-oreslang/oreslang-source.java/pull/2892), [namespace conformance](https://github.com/ores-truffle-oreslang/oreslang-platform-conformance/pull/709), and merged Rust frontend [#86](https://github.com/atto-lang/atto-source.rs/pull/86) / [#91](https://github.com/atto-lang/atto-source.rs/pull/91). It extends [actor pipe roles](actor-pipe-port-contracts-v1.md), not a separate actor kind.

## Canonical grammar

```ebnf
actor_decl =
    "declare", ["pub" | "private"], "actor", Ident,
    [ "implements", ContractName, { ",", ContractName } ],
    [ "receives", Type ],
    [ "emits", Type ],
    [ "sends", Type ],
    ";" ;

actor_definition =
    "define", "actor", Ident,
    [ "receives", Type ],
    [ "emits", Type ],
    [ "sends", Type ],
    "as", ActorMember*, "end" ;
```

The canonical formatter order is **`receives`, `emits`, `sends`**, preserving `receives` first. The parser may accept `receives T sends M emits O` and canonicalize it, but never duplicate a role or move `receives` after either output clause.

```atto
declare actor Foo;
declare actor Foo receives Input emits Output;
declare actor Foo receives Input sends Outbound emits Output;
declare pub actor PublicFoo receives Input emits Output sends Notification;
declare pub actor ExternalFoo implements ActorXYZ receives Input;

define actor Transformer receives Input emits Output as
    receive(ActorMail<Input> mail): void {
        emit(transform(mail.value));
    }
end
```

`declare pub actor` is the canonical exported nominal declaration, `declare actor` and `declare private actor` are private. **Reject** `pub declare actor`, `define actor Foo;`, duplicate nominal actor names, duplicate role clauses, and unverified inheritance/generic parameters. Preserve `define actor Foo as ... end` for actual inline implementations.

A declaration is a **nominal contract only**. It is *not* an empty actor, implicitly constructed receiver, public lifecycle method, `ActorRef`, supervisor, state instance, or permission to `spawn`. `implements ActorXYZ` is a contract reference only; implementing it requires an authenticated witness. `sends M` is a bounded ordinary outbound application-message effect, never an alias for `emits M`.

## Attached receiver methods are mandatory implementation witnesses

A body-free `declare actor` is a **nominal signature**, not a definition and not a complete `PipeSink`. Its application inbox is implemented by a separately attached, private, receiver-targeted `mtd`:

```atto
declare actor Foo receives Input emits Output;

mtd (Foo self) receive(ActorMail<Input> m): void {
    // Implementation: process input, optionally emit Output values.
}
```

This exact `mtd (Foo self) receive(ActorMail<Input> m)` spelling is valid. The compiler recognizes **the method's owner and sealed `receive` signature together** as a private runtime-only ingress witness. It is NOT an ordinary public `Foo.receive` call or a dynamically dispatchable `ActorRef.receive` method. The earlier Java prototype used `external mtd` as an explicit ingress marker: the intended language-level unmarked form above desugars to the same restricted, runtime-controlled semantic role. Java and other backends must reconcile that spelling before claiming parity. An explicit `external mtd` may remain as a migration spelling if supported, never as a public-facing callable API.

Rules:
- A declared `receives T` specifies what the linked private handler must accept; `mtd (Foo self) receive(ActorMail<U> m)` satisfies that inbox signature **only when `U` resolves exactly to `T`**, with no implicit coercion, duck typing or invented generic payload.
- Require **exactly one** private `receive(ActorMail<T>)` ingress per implemented actor, with `void` result, no public visibility and no writable/raw receiver loan. Reject a second inline `receive` and an attached `mtd receive` for the same actor. Ordinary methods cannot take `ActorMail<T>`. Reject direct calls `receive(m)`, `self.receive(m)`, `Foo.receive(m)` and `super.receive(m)`; only the authenticated actor runtime may enter this sealed handler.
- A declaration without an attached ingress or other authenticated matching implementation is still valid *forward-only metadata*, but it is **unfulfilled**: the linker must refuse to mark it executable/spawnable or admit it to a `pipe` graph. The typed linker tracks an `inbox_witnessed` bit only after a signature-compatible attached or inline handler is found. This is source-level static evidence, never runtime authorization; `emits_witnessed` remains false until independent effect proof.
- Multiple files may contribute the declaration and receiver mtd only through the authenticated same-package/namespace linker; never link by spelling alone.
- `emits U` additionally requires effect-checked `emit(U)` behavior (which may output zero, one or many values); an empty `receive` body does not prove emission capability. `sends M` similarly requires transitive ordinary-message effect checking. The three proof obligations are distinct.
- The parser/source-only linker may record the signature and private ingress without generating any guest code. Runtime admission also needs verified body effects, cancellation/backpressure, supervisor CONTROL separation, actor generation fencing and trusted mailbox dispatch.

## Namespace actor linking

A verified package/namespace may link one `declare actor Foo ...;` to a concrete `define actor Foo ... end` or checked out-of-line private `mtd (Foo f) receive(ActorMail<T> mail)` and, where necessary, trusted activation `init`. The target language adopts the plain `mtd` spelling for the attached receiver, with compiler-controlled sealed ingress semantics; the earlier explicit `external mtd` prototype must be updated or normalized to that contract. The linker must compare `receives`, `emits`, `sends` against actual message handlers, pipeline emission types and transitive send effects. It must reject mismatches and duplicate/ambiguous implementations.

```atto
use namespace workers;

declare actor Foo receives int emits bool;

define actor Foo receives int emits bool as
    receive(ActorMail<int> mail): void {
        emit(true);
    }
end
```

The Rust target namespace linker from merged compiler PR #91 can associate nominal headers and concrete definitions as **nonexecuting metadata**. An ordinary browser `define actor` program is a distinct execution path; do not silently redirect it to an untrusted namespace implementation. Linking by bare name across packages, unchecked symlinks, structural matches or forged `ActorRef` objects is prohibited.

A declaration with `receives X` alone does not prove that a matching receive handler exists. `emits Y` alone does not prove the effectful `emit(Y)` body, or that cancellation/backpressure have been implemented. `sends Z` alone does not prove a transitive effect witness. In particular, `declare actor Foo receives x emits y;` is valid **signature grammar** even when `x` and `y` are externally defined nominal types; type resolution and executable linking are independent additional gates.

## Browser compiler implementation split

- The historical `target_syntax` / `target_typed` Rust namespace/receiver frontend keeps `declare actor` nominal headers and does not generate guests. The main-based declaration integration PR extends that exact path with role metadata, public visibility and syntactically checked `implements` references; primitive-type declaration/definition mismatches are rejected with `E_SIGNATURE`.
- The separate mixed-pipeline compiler PR [#210](https://github.com/atto-lang/atto-source.rs/pull/210) checks typed actor source/sink ports. It must be rebased/reconciled with the main-based namespace work before declaring unified compiler support. No fully executable mixed actor/channel/stream transport exists.
- A standalone `define actor` with `receives T` may check its local `receive(ActorMail<T>)` handler on the existing executable path; `sends` and `emits` effects remain fail-closed until validated in the actual compiler/runtime profile.
- The formatter must recognize the semicolon-body-free header and canonicalize the three role clauses without inventing a body or relocating actor visibility. This is a future formatter integration gate, not a tested formatter claim.

## Conformance requirements

1. Positive parser AST: private/public headers, arbitrary nominal `x`/`y`, all three clauses in canonical and alternate order, `implements`, separate declarations, and matching inline definition.
2. Negative syntax: `pub declare`, `define actor Foo;`, missing `;`, duplicates and reordering, duplicate contracts, generic/inherited unchecked headers, and invalid visibility.
3. Linker: one declaration → one definition; mismatched `receives` / `emits` / `sends` fail, matched handlers remain non-executable pending verified namespace/ingress semantics.
4. Runtime security: no accidental actor construction or implicit source/sink capability, no supervisor CONTROL leakage, no unverified public actor methods or direct actor state access, no cross-package spoofing, and no guessed implementation.
5. Exact-source executed Rust/native + Wasm and browser tests, then Java/LLVM/.NET/Forge and formatter parity, with per-backend source SHAs and nonzero stepful CI; parser source tests alone are not guest execution.
