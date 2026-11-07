//! End-to-end negative-mutation checks of the actual spec-lint executable.
//! These are source-free structural checks, never compiler guest evidence.
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

static SERIAL: AtomicUsize = AtomicUsize::new(0);
struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let nanos = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        let root = std::env::temp_dir().join(format!(
            "atto-spec-lint-mutation-{}-{nanos}-{}",
            std::process::id(),
            SERIAL.fetch_add(1, Ordering::Relaxed)
        ));
        let fx = Self(root);
        fx.put("README.md", concat!(
            "# Specification\n\n| Chapter | Subject |\n| --- | --- |\n",
            "| [00](spec/00-scope.md) | Scope |\n",
            "| [12](spec/12-open-questions.md) | Decisions |\n",
            "| [15](spec/15-nested-actor-pipelines.md) | Pipelines |\n",
            "| [20](spec/20-guard.md) | Guard |\n"
        ));
        fx.put("spec/00-scope.md", "# 00 — Scope\n\n**Status: DRAFT.**\n");
        fx.put("spec/12-open-questions.md", concat!(
            "# 12 — Open questions\n\n**Status: DRAFT.**\n\n",
            "| ID | Question | Resolution |\n| --- | --- | --- |\n",
            "| S-41 | Wording | **UNRESOLVED** — Needs review |\n"
        ));
        fx.put("spec/15-nested-actor-pipelines.md",
            "# 15 — Nested actor pipelines\n\n**Status: TARGET.**\n");
        fx.put("spec/20-guard.md", "# 20 — Guard\n\n**Status: TARGET.**\n");
        fx.put(".github/workflows/guard-model.yml", concat!(
            "on:\n  pull_request:\n    paths:\n      - 'spec/20-guard.md'\n",
            "  push:\n    paths:\n      - 'spec/20-guard.md'\n"
        ));
        fx
    }

    fn put(&self, rel: &str, content: &str) {
        let dest = self.0.join(rel);
        fs::create_dir_all(dest.parent().unwrap()).unwrap();
        fs::write(dest, content).unwrap();
    }

    fn run(&self) -> Output {
        Command::new(env!("CARGO_BIN_EXE_spec-lint"))
            .arg(&self.0)
            .output()
            .expect("launch spec-lint")
    }

    fn assert_rejected(&self, rule: &str) {
        let output = self.run();
        let stdout = String::from_utf8_lossy(&output.stdout);
        assert_eq!(output.status.code(), Some(1), "expected lint rejection: {stdout}");
        assert!(stdout.contains(&format!("[{rule}]")), "missing {rule} witness: {stdout}");
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn clean_baseline_passes() {
    let fx = Fixture::new();
    let output = fx.run();
    assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stdout));
    assert!(String::from_utf8_lossy(&output.stdout).contains("0 finding(s)"));
}

#[test]
fn duplicate_chapter_number_is_rejected() {
    let fx = Fixture::new();
    fx.put("spec/15-collision.md", "# 15 — Duplicate\n\n**Status: DRAFT.**\n");
    fx.assert_rejected("chapter");
}

#[test]
fn unindexed_chapter_is_rejected() {
    let fx = Fixture::new();
    fx.put("README.md", "# Specification\n\n| Chapter | Subject |\n| --- | --- |\n\
        | [00](spec/00-scope.md) | Scope |\n\
        | [12](spec/12-open-questions.md) | Decisions |\n\
        | [15](spec/15-nested-actor-pipelines.md) | Pipelines |\n");
    fx.assert_rejected("index");
}

#[test]
fn stale_workflow_chapter_path_is_rejected() {
    let fx = Fixture::new();
    fx.put(".github/workflows/guard-model.yml", concat!(
        "on:\n  pull_request:\n    paths:\n      - 'spec/15-guard.md'\n",
        "  push:\n    paths:\n      - 'spec/20-guard.md'\n"
    ));
    fx.assert_rejected("workflow-path");
}

#[test]
fn missing_cross_reference_is_rejected() {
    let fx = Fixture::new();
    fx.put("spec/20-guard.md", concat!(
        "# 20 — Guard\n\n**Status: TARGET.**\n\n",
        "See [missing chapter](09-nonexistent.md).\n"
    ));
    fx.assert_rejected("link");
}

#[test]
fn broken_anchor_is_rejected() {
    let fx = Fixture::new();
    fx.put("spec/20-guard.md", concat!(
        "# 20 — Guard\n\n**Status: TARGET.**\n\n",
        "See [bad anchor](15-nested-actor-pipelines.md#no-such-heading).\n"
    ));
    fx.assert_rejected("anchor");
}

#[test]
fn duplicate_decision_id_is_rejected() {
    let fx = Fixture::new();
    fx.put("spec/12-open-questions.md", concat!(
        "# 12 — Open questions\n\n**Status: DRAFT.**\n\n",
        "| ID | Question | Resolution |\n| --- | --- | --- |\n",
        "| S-41 | A | **UNRESOLVED** — Review |\n",
        "| S-41 | B | **UNRESOLVED** — Review |\n"
    ));
    fx.assert_rejected("question-id");
}

#[test]
fn silently_ratified_decision_is_rejected() {
    let fx = Fixture::new();
    fx.put("spec/12-open-questions.md", concat!(
        "# 12 — Open questions\n\n**Status: DRAFT.**\n\n",
        "| ID | Question | Resolution |\n| --- | --- | --- |\n",
        "| S-41 | A | **DECIDED** — No independently reviewed decision |\n"
    ));
    fx.assert_rejected("decision-status");
}

#[test]
fn unclassified_decision_is_rejected() {
    let fx = Fixture::new();
    fx.put("spec/12-open-questions.md", concat!(
        "# 12 — Open questions\n\n**Status: DRAFT.**\n\n",
        "| ID | Question | Resolution |\n| --- | --- | --- |\n",
        "| S-41 | A | We should consider this |\n"
    ));
    fx.assert_rejected("decision-status");
}
