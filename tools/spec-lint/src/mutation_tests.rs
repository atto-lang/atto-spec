//! Adversarial invariants for the chapter 15/20 resolution and S-41..57 ledger.
//! The mutations are in-memory fixtures, never edits to real source files.
use super::*;

fn docs() -> BTreeMap<String, String> {
    let mut d = BTreeMap::new();
    d.insert("README.md".into(), concat!(
        "| Chapter | Subject |\n| --- | --- |\n",
        "| [12](spec/12-open-questions.md) | Decisions |\n",
        "| [15](spec/15-nested-actor-pipelines.md) | Nested pipelines |\n",
        "| [20](spec/20-guard.md) | Guard |\n",
    ).into());
    let mut ledger = String::from("# 12 — Open Questions\n\n**Status: DRAFT.**\n\n");
    for id in 41..=57 {
        ledger.push_str(&format!("| S-{id} | Audit {id} | **PROPOSED** — awaiting review |\n"));
    }
    d.insert("spec/12-open-questions.md".into(), ledger);
    d.insert("spec/15-nested-actor-pipelines.md".into(),
        "# 15 — Nested actor pipelines\n\n**Status: DRAFT.**\n".into());
    d.insert("spec/20-guard.md".into(),
        "# 20 — Guard\n\n**Status: TARGET.**\n".into());
    d
}
fn has(found: &[Finding], rule: &str) -> bool {
    found.iter().any(|f| f.rule == rule)
}
fn guard_workflow() -> &'static str {
    "on:\n  pull_request:\n    paths:\n      - 'spec/20-guard.md'\n  push:\n    branches: [main]\n    paths:\n      - 'spec/20-guard.md'\n"
}
#[test]
fn baseline_structure_is_clean() {
    let d = docs();
    let mut f = Vec::new();
    check_chapters(&d, &mut f);
    check_readme_index(&d, &mut f);
    check_open_question_ids(&d, &mut f);
    check_decision_statuses(&d, &mut f);
    assert!(f.is_empty(), "{f:?}");
}
#[test]
fn mutation_duplicate_chapter_fifteen() {
    let mut d = docs();
    d.insert("spec/15-guard.md".into(), "# 15 — Guard\n\n**Status: TARGET.**\n".into());
    let mut f = Vec::new();
    check_chapters(&d, &mut f);
    assert!(has(&f, "chapter"), "{f:?}");
}
#[test]
fn mutation_wrong_chapter_heading() {
    let mut d = docs();
    d.insert("spec/20-guard.md".into(), "# 15 — Guard\n\n**Status: TARGET.**\n".into());
    let mut f = Vec::new();
    check_chapters(&d, &mut f);
    assert!(has(&f, "chapter"), "{f:?}");
}
#[test]
fn mutation_missing_chapter_status() {
    let mut d = docs();
    d.insert("spec/20-guard.md".into(), "# 20 — Guard\n\nNo status.\n".into());
    let mut f = Vec::new();
    check_chapters(&d, &mut f);
    assert!(has(&f, "status"), "{f:?}");
}
#[test]
fn mutation_missing_readme_chapter() {
    let mut d = docs();
    let r = d.get_mut("README.md").unwrap();
    *r = r.replace("| [20](spec/20-guard.md) | Guard |\n", "");
    let mut f = Vec::new();
    check_readme_index(&d, &mut f);
    assert!(has(&f, "index"), "{f:?}");
}
#[test]
fn mutation_duplicate_readme_chapter() {
    let mut d = docs();
    d.get_mut("README.md").unwrap().push_str("| [20](spec/20-guard.md) | Guard |\n");
    let mut f = Vec::new();
    check_readme_index(&d, &mut f);
    assert!(has(&f, "index"), "{f:?}");
}
#[test]
fn mutation_broken_relative_link() {
    let mut f = Vec::new();
    check_links(Path::new("__spec_lint_nonexistent_fixture_root__"),
        "spec/20-guard.md", "[deleted](99-deleted.md)",
        &BTreeMap::new(), &mut f);
    assert!(has(&f, "link"), "{f:?}");
}
#[test]
fn mutation_broken_anchor() {
    let mut f = Vec::new();
    let mut anchors = BTreeMap::new();
    anchors.insert("spec/20-guard.md", heading_anchors("# 20 — Guard\n## Live\n"));
    check_links(Path::new("."), "spec/20-guard.md", "[old](#deleted)",
        &anchors, &mut f);
    assert!(has(&f, "anchor"), "{f:?}");
}
#[test]
fn mutation_stale_workflow_chapter_path() {
    let mut f = Vec::new();
    check_workflow_spec_refs(".github/workflows/guard-model.yml",
        "paths:\n  - 'spec/15-guard.md'\n", &docs(), &mut f);
    assert!(has(&f, "workflow-path"), "{f:?}");
}
#[test]
fn current_workflow_chapter_path_is_valid() {
    let mut f = Vec::new();
    check_workflow_spec_refs(".github/workflows/guard-model.yml",
        "paths:\n  - 'spec/20-guard.md'\n  - 'tests/guard-*'\n",
        &docs(), &mut f);
    assert!(f.is_empty(), "{f:?}");
}
#[test]
fn baseline_guard_triggers_both_events() {
    let mut f = Vec::new();
    check_guard_trigger_paths("guard-model.yml", guard_workflow(), &mut f);
    assert!(f.is_empty(), "{f:?}");
}
#[test]
fn mutation_missing_guard_pr_trigger() {
    let source = guard_workflow().replacen("      - 'spec/20-guard.md'\n", "", 1);
    let mut f = Vec::new();
    check_guard_trigger_paths("guard-model.yml", &source, &mut f);
    assert!(f.iter().any(|x| x.rule == "guard-trigger" && x.message.contains("pull_request")), "{f:?}");
}
#[test]
fn mutation_missing_guard_push_trigger() {
    let source = guard_workflow().replace(
        "  push:\n    branches: [main]\n    paths:\n      - 'spec/20-guard.md'\n",
        "  push:\n    branches: [main]\n    paths:\n");
    let mut f = Vec::new();
    check_guard_trigger_paths("guard-model.yml", &source, &mut f);
    assert!(f.iter().any(|x| x.rule == "guard-trigger" && x.message.contains("push")), "{f:?}");
}
#[test]
fn mutation_job_names_cannot_spoof_guard_triggers() {
    let fake = "on:\n  workflow_dispatch:\n\njobs:\n  pull_request:\n    paths:\n      - 'spec/20-guard.md'\n  push:\n    paths:\n      - 'spec/20-guard.md'\n";
    let mut f = Vec::new();
    check_guard_trigger_paths("guard-model.yml", fake, &mut f);
    for event in ["push", "pull_request"] {
        assert!(f.iter().any(|x| x.rule == "guard-trigger" && x.message.contains(event)), "{f:?}");
    }
}
#[test]
fn mutation_duplicate_top_level_guard_on_blocks() {
    let doubled = format!("{}\non:\n  workflow_dispatch:\n", guard_workflow());
    let mut f = Vec::new();
    check_guard_trigger_paths("guard-model.yml", &doubled, &mut f);
    assert!(f.iter().any(|x| x.rule == "guard-trigger" && x.message.contains("exactly one")), "{f:?}");
}
#[test]
fn mutation_duplicate_question_id() {
    let mut d = docs();
    d.get_mut("spec/12-open-questions.md").unwrap().push_str(
        "| S-41 | Duplicate | **PROPOSED** — also open |\n");
    let mut f = Vec::new();
    check_open_question_ids(&d, &mut f);
    assert!(has(&f, "question-id"), "{f:?}");
}
#[test]
fn mutation_unknown_question_reference() {
    let mut d = docs();
    d.get_mut("spec/20-guard.md").unwrap().push_str("\nReference S-99 is absent.\n");
    let mut f = Vec::new();
    check_open_question_ids(&d, &mut f);
    assert!(has(&f, "question-id"), "{f:?}");
}
#[test]
fn mutation_deleted_audited_question_row() {
    let mut d = docs();
    let ledger = d.get_mut("spec/12-open-questions.md").unwrap();
    *ledger = ledger.replace("| S-57 | Audit 57 | **PROPOSED** — awaiting review |\n", "");
    let mut f = Vec::new();
    check_decision_statuses(&d, &mut f);
    assert!(f.iter().any(|x| x.rule == "decision-status" && x.message.contains("S-57 is missing")), "{f:?}");
}
#[test]
fn mutation_question_lacks_maturity() {
    let mut d = docs();
    let ledger = d.get_mut("spec/12-open-questions.md").unwrap();
    *ledger = ledger.replacen("**PROPOSED**", "pending", 1);
    let mut f = Vec::new();
    check_decision_statuses(&d, &mut f);
    assert!(has(&f, "decision-status"), "{f:?}");
}
#[test]
fn mutation_question_has_conflicting_maturities() {
    let mut d = docs();
    let ledger = d.get_mut("spec/12-open-questions.md").unwrap();
    *ledger = ledger.replacen("**PROPOSED**", "**TARGET** **PROPOSED**", 1);
    let mut f = Vec::new();
    check_decision_statuses(&d, &mut f);
    assert!(has(&f, "decision-status"), "{f:?}");
}
#[test]
fn mutation_unreviewed_promotion_to_decided() {
    let mut d = docs();
    let ledger = d.get_mut("spec/12-open-questions.md").unwrap();
    *ledger = ledger.replacen("**PROPOSED**", "**DECIDED**", 1);
    let mut f = Vec::new();
    check_decision_statuses(&d, &mut f);
    assert!(f.iter().any(|x| x.rule == "decision-status" && x.message.contains("Reviewed-by")), "{f:?}");
}
#[test]
fn decision_review_link_is_only_a_structural_check() {
    let mut d = docs();
    let ledger = d.get_mut("spec/12-open-questions.md").unwrap();
    *ledger = ledger.replacen("**PROPOSED**",
        "**DECIDED** Reviewed-by: https://github.com/example/spec/pull/1", 1);
    let mut f = Vec::new();
    check_decision_statuses(&d, &mut f);
    assert!(f.is_empty(), "{f:?}");
    // The lint gate cannot independently verify that GitHub approval exists.
}
#[test]
fn mutation_unclosed_fence() {
    let mut f = Vec::new();
    check_fences("spec/20-guard.md", "# Guard\n\n~~~atto\nreturn 1\n", &mut f);
    assert!(has(&f, "fence"), "{f:?}");
}
#[test]
fn mutation_invalid_atto_examples() {
    let block = CodeBlock { start_line: 1, lines: vec![
        "val g = Actor.pipe(Transformer(batch_size=256))".into(),
        "val g = other()".into()
    ] };
    let mut f = Vec::new();
    check_atto_block("spec/20-guard.md", &block, &mut f);
    assert!(has(&f, "example-named-arg"), "{f:?}");
    assert!(has(&f, "example-redeclare"), "{f:?}");
}
#[test]
fn chapter_nesting_and_guard_numbers_are_distinct() {
    let d = docs();
    assert!(d.contains_key("spec/15-nested-actor-pipelines.md"));
    assert!(d.contains_key("spec/20-guard.md"));
    assert!(!d.contains_key("spec/15-guard.md"));
    let mut f = Vec::new();
    check_chapters(&d, &mut f);
    assert!(f.is_empty(), "{f:?}");
}
