use std::collections::HashSet;

const REGISTRY: &str = include_str!("../conformance/full-aot-feature-inventory-v1.tsv");
const HEADER: [&str; 11] = [
    "feature_id", "family", "aot_policy", "aot_lowering", "required_negative_rule",
    "rs_wasm", "java_native", "llvm_native", "net_native", "forge_native", "wasm_precompiled",
];

fn parse_registry(input: &str) -> Result<Vec<Vec<&str>>, String> {
    if input.contains('\r') {
        return Err("CR line endings are not canonical".into());
    }
    let mut lines = input.lines().filter(|s| !s.starts_with('#') && !s.trim().is_empty());
    let header = lines.next().ok_or("registry header missing")?;
    let observed: Vec<&str> = header.split('\t').collect();
    if observed != HEADER {
        return Err("unexpected header or AOT backend profile columns".into());
    }
    let mut features = Vec::new();
    let mut ids = HashSet::new();
    for (ix, line) in lines.enumerate() {
        let fields: Vec<&str> = line.split('\t').collect();
        if fields.len() != HEADER.len() || fields.iter().any(|s| s.is_empty()) {
            return Err(format!("row {}: blank or malformed fields", ix + 1));
        }
        let id = fields[0];
        if !id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
            || id.starts_with('-') || id.ends_with('-')
        {
            return Err(format!("invalid feature id: {id}"));
        }
        if !ids.insert(id) {
            return Err(format!("duplicate feature: {id}"));
        }
        let family = fields[1];
        if !["types", "control", "concurrency", "actors", "memory", "meta",
              "interop", "security", "tooling", "performance"].contains(&family)
        {
            return Err(format!("unknown family: {family}"));
        }
        let policy = fields[2];
        if !["static", "compile_time", "bounded_runtime", "reject"].contains(&policy) {
            return Err(format!("unknown AOT policy for {id}: {policy}"));
        }
        let lowering = fields[3];
        if !["monomorphize", "static-witness", "erase-to-static-type",
              "tagged-union", "typed-desugar", "decision-tree", "control-flow",
              "closure-conversion", "state-machine", "static-mailbox", "static-lock",
              "capability-table", "bounded-arena", "borrow-check", "checked-intrinsic",
              "constant-fold", "macro-expand", "annotation-elaborate", "static-type-table",
              "symbol-table", "versioned-aot-abi", "fixed-ffi-abi", "static-module-graph",
              "schema-specialize", "target-intrinsic", "layout-specialize",
              "erase-hints", "none"].contains(&lowering)
        {
            return Err(format!("unapproved or dynamic lowering for {id}: {lowering}"));
        }
        if (policy == "reject") != (lowering == "none") {
            return Err(format!("rejected feature must have no lowering (and vice versa): {id}"));
        }
        if !["reject-unresolved", "reject-unsupported", "reject-ambiguous",
              "reject-type-mismatch", "reject-nonexhaustive", "reject-unbounded",
              "reject-unknown-effect", "reject-unsafe-borrow", "reject-double-reply",
              "reject-abi-mismatch", "reject-overflow", "reject-runtime-codegen",
              "reject-reflection"].contains(&fields[4])
        {
            return Err(format!("missing known negative acceptance rule for {id}"));
        }
        // The registry is a plan. Claims of 'passed' need independently checked receipts
        // in a distinct evidence artifact, never just an edit to this source table.
        for (profile, status) in HEADER[5..].iter().zip(fields[5..].iter()) {
            if *status != "not_executed" {
                return Err(format!("{id}: {profile} cannot self-certify from a source registry"));
            }
        }
        features.push(fields);
    }
    if features.len() < 50 {
        return Err("candidate inventory unexpectedly shrank below 50 topics".into());
    }
    Ok(features)
}

#[test]
fn source_registry_is_well_formed_and_not_certifying() {
    let rows = parse_registry(REGISTRY).expect("full AOT feature inventory");
    assert!(rows.len() >= 50);
    let ids: HashSet<&str> = rows.iter().map(|r| r[0]).collect();
    for id in [
        "generic-specialization", "trait-interface-dispatch", "option-result-adt",
        "pattern-matching", "closures-and-llambdas", "async-await-and-tasks",
        "generator-yield-delegation", "typed-actor-messages",
        "actor-supervision-priority-control", "actor-owned-heaps-and-stacks",
        "ownership-move-copy-share", "borrow-mut-and-suspend-safety",
        "runtime-eval-source-compilation", "unrestricted-runtime-code-loading",
        "precompiled-hot-module-loading", "foreign-function-interface",
        "compile-time-macros", "optional-jit-tracing-hints",
        "zero-gc-low-gc-profiles", "aos-soa-inverted-classes",
    ] {
        assert!(ids.contains(id), "missing important design topic: {id}");
    }
}

fn mutate_one(from: &str, to: &str) -> String {
    let result = REGISTRY.replacen(from, to, 1);
    assert_ne!(result, REGISTRY, "fixture to mutate must exist");
    result
}

#[test]
fn rejects_forged_parity_claims() {
    let bad = mutate_one("not_executed", "passed");
    assert!(parse_registry(&bad).unwrap_err().contains("cannot self-certify"));
}

#[test]
fn rejects_dynamic_fallback_and_rejected_codegen() {
    let bad = mutate_one("static\tmonomorphize", "static\truntime-eval");
    assert!(parse_registry(&bad).unwrap_err().contains("dynamic lowering"));
    let bad = mutate_one("reject\tnone", "reject\tstate-machine");
    assert!(parse_registry(&bad).unwrap_err().contains("no lowering"));
}

#[test]
fn rejects_duplicate_entries_and_lost_backend_columns() {
    let first = REGISTRY.lines().find(|s| s.starts_with("generic-specialization\t")).unwrap();
    let bad = format!("{REGISTRY}{first}\n");
    assert!(parse_registry(&bad).unwrap_err().contains("duplicate feature"));
    let bad = mutate_one("wasm_precompiled", "wasm_runtime_jit");
    assert!(parse_registry(&bad).unwrap_err().contains("backend profile"));
}

#[test]
fn rejects_missing_negative_gate_and_unsafe_policy() {
    let bad = mutate_one("reject-unresolved", "skip");
    assert!(parse_registry(&bad).unwrap_err().contains("negative acceptance rule"));
    let bad = mutate_one("static\tmonomorphize", "dynamic\tmonomorphize");
    assert!(parse_registry(&bad).unwrap_err().contains("AOT policy"));
}
