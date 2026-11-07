//! spec-lint: checks the AttoLang specification Markdown for structural
//! defects (broken relative links/anchors, unbalanced fences, chapter
//! headers, README index, open-question IDs) and for example code that
//! contradicts the normative call/declaration syntax.
//!
//! Usage: `spec-lint [REPO_ROOT]` (defaults to the current directory).
//! Exit status 0 means no findings; 1 means findings were printed; 2 means
//! the tool could not read the repository.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord)]
struct Finding {
    file: String,
    line: usize,
    rule: &'static str,
    message: String,
}

fn main() -> ExitCode {
    let root = std::env::args().nth(1).map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    let files = match collect_markdown(&root) {
        Ok(f) => f,
        Err(e) => {
            eprintln!("spec-lint: cannot read {}: {e}", root.display());
            return ExitCode::from(2);
        }
    };
    if files.is_empty() {
        eprintln!("spec-lint: no Markdown files found under {}", root.display());
        return ExitCode::from(2);
    }
    let mut docs = BTreeMap::new();
    for rel in &files {
        match fs::read_to_string(root.join(rel)) {
            Ok(text) => {
                docs.insert(rel.clone(), text);
            }
            Err(e) => {
                eprintln!("spec-lint: cannot read {rel}: {e}");
                return ExitCode::from(2);
            }
        }
    }
    let findings = lint_all(&root, &docs);
    for f in &findings {
        println!("{}:{}: [{}] {}", f.file, f.line, f.rule, f.message);
    }
    println!("spec-lint: {} file(s) checked, {} finding(s)", docs.len(), findings.len());
    if findings.is_empty() { ExitCode::SUCCESS } else { ExitCode::from(1) }
}

/// Markdown files that make up the specification, as `/`-separated paths
/// relative to the repository root.
fn collect_markdown(root: &Path) -> std::io::Result<Vec<String>> {
    let mut out = Vec::new();
    for top in ["README.md", "CONTRIBUTING.md"] {
        if root.join(top).is_file() {
            out.push(top.to_string());
        }
    }
    for dir in ["spec", "docs"] {
        walk(root, &root.join(dir), &mut out)?;
    }
    out.sort();
    Ok(out)
}

fn walk(root: &Path, dir: &Path, out: &mut Vec<String>) -> std::io::Result<()> {
    if !dir.is_dir() {
        return Ok(());
    }
    for entry in fs::read_dir(dir)? {
        let path = entry?.path();
        if path.is_dir() {
            walk(root, &path, out)?;
        } else if path.extension().is_some_and(|e| e == "md") {
            let rel = path.strip_prefix(root).unwrap_or(&path);
            out.push(rel.to_string_lossy().replace('\\', "/"));
        }
    }
    Ok(())
}

fn lint_all(root: &Path, docs: &BTreeMap<String, String>) -> Vec<Finding> {
    let mut findings = Vec::new();
    let anchors: BTreeMap<&str, BTreeSet<String>> =
        docs.iter().map(|(k, v)| (k.as_str(), heading_anchors(v))).collect();
    for (file, text) in docs {
        check_fences(file, text, &mut findings);
        check_links(root, file, text, &anchors, &mut findings);
        for block in atto_blocks(text) {
            check_atto_block(file, &block, &mut findings);
        }
    }
    check_chapters(docs, &mut findings);
    check_readme_index(docs, &mut findings);
    check_open_question_ids(docs, &mut findings);
    check_workflow_paths(root, docs, &mut findings);
    check_decision_statuses(docs, &mut findings);
    findings.sort();
    findings
}

// ---------------------------------------------------------------- fences

/// An opening or closing code fence: its character, run length and info string.
fn fence_marker(line: &str) -> Option<(char, usize, &str)> {
    let trimmed = line.trim_start();
    if line.len() - trimmed.len() > 3 {
        return None;
    }
    let ch = trimmed.chars().next()?;
    if ch != '`' && ch != '~' {
        return None;
    }
    let run = trimmed.chars().take_while(|&c| c == ch).count();
    if run < 3 {
        return None;
    }
    Some((ch, run, trimmed[run..].trim()))
}

fn check_fences(file: &str, text: &str, findings: &mut Vec<Finding>) {
    let mut open: Option<(char, usize, usize)> = None;
    for (i, line) in text.lines().enumerate() {
        let Some((ch, run, info)) = fence_marker(line) else { continue };
        match open {
            None => open = Some((ch, run, i + 1)),
            Some((och, orun, _)) if ch == och && run >= orun && info.is_empty() => open = None,
            Some(_) => {}
        }
    }
    if let Some((_, _, line)) = open {
        findings.push(Finding {
            file: file.to_string(),
            line,
            rule: "fence",
            message: "code fence opened here is never closed".into(),
        });
    }
}

/// Lines of `text` that are outside fenced code blocks, with 1-based numbers.
fn prose_lines(text: &str) -> Vec<(usize, &str)> {
    let mut out = Vec::new();
    let mut open: Option<(char, usize)> = None;
    for (i, line) in text.lines().enumerate() {
        if let Some((ch, run, info)) = fence_marker(line) {
            match open {
                None => {
                    open = Some((ch, run));
                    continue;
                }
                Some((och, orun)) if ch == och && run >= orun && info.is_empty() => {
                    open = None;
                    continue;
                }
                Some(_) => {}
            }
        }
        if open.is_none() {
            out.push((i + 1, line));
        }
    }
    out
}

struct CodeBlock {
    start_line: usize,
    lines: Vec<String>,
}

fn atto_blocks(text: &str) -> Vec<CodeBlock> {
    let mut out = Vec::new();
    let mut cur: Option<(char, usize, CodeBlock)> = None;
    for (i, line) in text.lines().enumerate() {
        if let Some((ch, run, info)) = fence_marker(line) {
            match &cur {
                None => {
                    let is_atto = info.split_whitespace().next() == Some("atto");
                    let start_line = if is_atto { i + 2 } else { 0 };
                    cur = Some((ch, run, CodeBlock { start_line, lines: Vec::new() }));
                    continue;
                }
                Some((och, orun, _)) if ch == *och && run >= *orun && info.is_empty() => {
                    let (_, _, block) = cur.take().unwrap();
                    if block.start_line != 0 {
                        out.push(block);
                    }
                    continue;
                }
                Some(_) => {}
            }
        }
        if let Some((_, _, block)) = cur.as_mut() {
            block.lines.push(line.to_string());
        }
    }
    out
}

// ---------------------------------------------------------------- anchors and links

/// GitHub-style heading slug.
fn slugify(heading: &str) -> String {
    heading
        .trim()
        .to_lowercase()
        .chars()
        .filter_map(|c| {
            if c == ' ' {
                Some('-')
            } else if c.is_alphanumeric() || c == '-' || c == '_' {
                Some(c)
            } else {
                None
            }
        })
        .collect()
}

fn heading_anchors(text: &str) -> BTreeSet<String> {
    let mut seen: BTreeMap<String, usize> = BTreeMap::new();
    let mut out = BTreeSet::new();
    for (_, line) in prose_lines(text) {
        let trimmed = line.trim_start();
        let hashes = trimmed.chars().take_while(|&c| c == '#').count();
        if hashes == 0 || hashes > 6 || !trimmed[hashes..].starts_with(' ') {
            continue;
        }
        let base = slugify(&trimmed[hashes..]);
        let n = seen.entry(base.clone()).or_insert(0);
        out.insert(if *n == 0 { base.clone() } else { format!("{base}-{n}") });
        *n += 1;
    }
    out
}

/// Remove inline code spans so that links shown as code are not checked.
fn strip_inline_code(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut in_code = false;
    for c in line.chars() {
        if c == '`' {
            in_code = !in_code;
        } else if !in_code {
            out.push(c);
        }
    }
    out
}

/// Targets of inline Markdown links `[text](target)` on one line.
fn link_targets(line: &str) -> Vec<String> {
    let line = strip_inline_code(line);
    let mut out = Vec::new();
    let mut rest = line.as_str();
    while let Some(pos) = rest.find("](") {
        let after = &rest[pos + 2..];
        if let Some(end) = after.find(')') {
            out.push(after[..end].split_whitespace().next().unwrap_or("").to_string());
            rest = &after[end..];
        } else {
            break;
        }
    }
    out
}

fn normalize(base_dir: &str, target: &str) -> String {
    let mut parts: Vec<&str> = if base_dir.is_empty() { Vec::new() } else { base_dir.split('/').collect() };
    for seg in target.split('/') {
        match seg {
            "" | "." => {}
            ".." => {
                parts.pop();
            }
            s => parts.push(s),
        }
    }
    parts.join("/")
}

fn check_links(
    root: &Path,
    file: &str,
    text: &str,
    anchors: &BTreeMap<&str, BTreeSet<String>>,
    findings: &mut Vec<Finding>,
) {
    let base_dir = file.rsplit_once('/').map(|(d, _)| d).unwrap_or("");
    for (line_no, line) in prose_lines(text) {
        for target in link_targets(line) {
            if target.is_empty()
                || target.starts_with("http://")
                || target.starts_with("https://")
                || target.starts_with("mailto:")
            {
                continue;
            }
            let (path_part, anchor) = match target.split_once('#') {
                Some((p, a)) => (p, Some(a)),
                None => (target.as_str(), None),
            };
            let resolved = if path_part.is_empty() { file.to_string() } else { normalize(base_dir, path_part) };
            if !path_part.is_empty() && !root.join(&resolved).exists() {
                findings.push(Finding {
                    file: file.to_string(),
                    line: line_no,
                    rule: "link",
                    message: format!("relative link `{target}` points to missing `{resolved}`"),
                });
                continue;
            }
            if let Some(anchor) = anchor {
                if let Some(set) = anchors.get(resolved.as_str()) {
                    if !set.contains(anchor) {
                        findings.push(Finding {
                            file: file.to_string(),
                            line: line_no,
                            rule: "anchor",
                            message: format!("anchor `#{anchor}` not found in `{resolved}`"),
                        });
                    }
                }
            }
        }
    }
}

// ---------------------------------------------------------------- chapters and index

/// `spec/NN-name.md` → `NN`.
fn chapter_number(file: &str) -> Option<&str> {
    let name = file.strip_prefix("spec/")?;
    if name.contains('/') || !name.ends_with(".md") {
        return None;
    }
    let num = name.split('-').next()?;
    (num.len() == 2 && num.chars().all(|c| c.is_ascii_digit())).then_some(num)
}

fn check_chapters(docs: &BTreeMap<String, String>, findings: &mut Vec<Finding>) {
    let mut numbers: BTreeMap<&str, &str> = BTreeMap::new();
    for (file, text) in docs {
        let Some(num) = chapter_number(file) else { continue };
        if let Some(prev) = numbers.insert(num, file) {
            findings.push(Finding {
                file: file.clone(),
                line: 1,
                rule: "chapter",
                message: format!("chapter number {num} is also used by `{prev}`"),
            });
        }
        let first = text.lines().next().unwrap_or("");
        if !first.starts_with(&format!("# {num} — ")) {
            findings.push(Finding {
                file: file.clone(),
                line: 1,
                rule: "chapter",
                message: format!("first line must be the chapter title `# {num} — ...`"),
            });
        }
        if !text.lines().take(6).any(|l| l.starts_with("**Status:")) {
            findings.push(Finding {
                file: file.clone(),
                line: 1,
                rule: "status",
                message: "chapter must declare `**Status: ...**` near the top".into(),
            });
        }
    }
}

fn check_readme_index(docs: &BTreeMap<String, String>, findings: &mut Vec<Finding>) {
    let Some(readme) = docs.get("README.md") else { return };
    let mut listed: BTreeMap<String, usize> = BTreeMap::new();
    for (_, line) in prose_lines(readme) {
        if !line.trim_start().starts_with('|') {
            continue;
        }
        for target in link_targets(line) {
            if chapter_number(&target).is_some() {
                *listed.entry(target).or_insert(0) += 1;
            }
        }
    }
    for file in docs.keys().filter(|f| chapter_number(f).is_some()) {
        match listed.get(file) {
            None => findings.push(Finding {
                file: "README.md".into(),
                line: 1,
                rule: "index",
                message: format!("chapter `{file}` is missing from the README chapter table"),
            }),
            Some(n) if *n > 1 => findings.push(Finding {
                file: "README.md".into(),
                line: 1,
                rule: "index",
                message: format!("chapter `{file}` is listed {n} times in the README chapter table"),
            }),
            _ => {}
        }
    }
}

// ---------------------------------------------------------------- open-question IDs

/// All `S-NN` identifiers mentioned on a line.
fn question_ids(line: &str) -> Vec<String> {
    let bytes = line.as_bytes();
    let mut out = Vec::new();
    for i in 0..bytes.len() {
        if i + 2 < bytes.len()
            && bytes[i] == b'S'
            && bytes[i + 1] == b'-'
            && (i == 0 || !bytes[i - 1].is_ascii_alphanumeric())
        {
            let digits: String = line[i + 2..].chars().take_while(|c| c.is_ascii_digit()).collect();
            let after = i + 2 + digits.len();
            if digits.len() >= 2 && (after >= bytes.len() || !bytes[after].is_ascii_alphanumeric()) {
                out.push(format!("S-{digits}"));
            }
        }
    }
    out
}

fn check_open_question_ids(docs: &BTreeMap<String, String>, findings: &mut Vec<Finding>) {
    let ledger_file = "spec/12-open-questions.md";
    let Some(ledger) = docs.get(ledger_file) else { return };
    let mut defined: BTreeMap<String, usize> = BTreeMap::new();
    for (line_no, line) in prose_lines(ledger) {
        let Some(first_cell) = line.trim_start().strip_prefix('|') else { continue };
        let id = first_cell.split('|').next().unwrap_or("").trim();
        if question_ids(id) == [id.to_string()] {
            if let Some(prev) = defined.insert(id.to_string(), line_no) {
                findings.push(Finding {
                    file: ledger_file.into(),
                    line: line_no,
                    rule: "question-id",
                    message: format!("open question {id} is defined twice (first on line {prev})"),
                });
            }
        }
    }
    for (file, text) in docs {
        for (line_no, line) in prose_lines(text) {
            for id in question_ids(line) {
                if !defined.contains_key(&id) {
                    findings.push(Finding {
                        file: file.clone(),
                        line: line_no,
                        rule: "question-id",
                        message: format!("{id} is referenced but has no row in {ledger_file}"),
                    });
                }
            }
        }
    }
}

// ---------------------------------------------------------------- example syntax

/// Strip a trailing `//` comment that is not inside a string literal.
fn strip_comment(line: &str) -> &str {
    let mut in_str = false;
    let bytes = line.as_bytes();
    for i in 0..bytes.len() {
        match bytes[i] {
            b'"' => in_str = !in_str,
            b'/' if !in_str && i + 1 < bytes.len() && bytes[i + 1] == b'/' => return &line[..i],
            _ => {}
        }
    }
    line
}

fn is_ident_char(c: char) -> bool {
    c.is_ascii_alphanumeric() || c == '_'
}

/// Find `label=value` items directly inside call parentheses (not inside
/// generic angle brackets). Value arguments must use `label: value`.
/// Returns each label with the 0-based line it appears on.
fn equals_named_args(code: &str) -> Vec<(String, usize)> {
    let chars: Vec<char> = code.chars().collect();
    // Open brackets: '(' or a generic '<' (one directly after an identifier).
    let mut stack: Vec<char> = Vec::new();
    let mut out = Vec::new();
    let mut in_str = false;
    for i in 0..chars.len() {
        let c = chars[i];
        if c == '"' {
            in_str = !in_str;
            continue;
        }
        if in_str {
            continue;
        }
        match c {
            '(' => stack.push('('),
            ')' => {
                while let Some(top) = stack.pop() {
                    if top == '(' {
                        break;
                    }
                }
            }
            '<' if i > 0 && is_ident_char(chars[i - 1]) => stack.push('<'),
            '>' if stack.last() == Some(&'<') && !(i > 0 && chars[i - 1] == '-') => {
                stack.pop();
            }
            '=' if stack.last() == Some(&'(') => {
                let next = chars.get(i + 1).copied().unwrap_or(' ');
                let prev = if i > 0 { chars[i - 1] } else { ' ' };
                if next == '=' || matches!(prev, '=' | '!' | '<' | '>') {
                    continue;
                }
                // Walk back over the identifier and check that it starts an argument.
                let mut j = i;
                while j > 0 && chars[j - 1] == ' ' {
                    j -= 1;
                }
                let end = j;
                while j > 0 && is_ident_char(chars[j - 1]) {
                    j -= 1;
                }
                let mut k = j;
                while k > 0 && chars[k - 1] == ' ' {
                    k -= 1;
                }
                let starts_arg = k == 0 || matches!(chars[k - 1], '(' | ',');
                if end > j && starts_arg {
                    let line = chars[..i].iter().filter(|&&c| c == '\n').count();
                    out.push((chars[j..end].iter().collect(), line));
                }
            }
            _ => {}
        }
    }
    out
}

/// On a callable signature line, find `name: Type` parameters.
fn colon_typed_params(code: &str) -> Vec<String> {
    if !(code.contains("->") && code.trim_end().ends_with("::")) {
        return Vec::new();
    }
    let (Some(open), Some(close)) = (code.find('('), code.rfind(')')) else { return Vec::new() };
    if close <= open {
        return Vec::new();
    }
    code[open + 1..close]
        .split(',')
        .filter_map(|p| {
            let (name, ty) = p.split_once(':')?;
            let (name, ty) = (name.trim(), ty.trim());
            let ok_name = !name.is_empty() && name.chars().all(is_ident_char);
            let ok_ty = ty.chars().next().is_some_and(|c| c.is_ascii_uppercase());
            (ok_name && ok_ty).then(|| format!("{name}: {ty}"))
        })
        .collect()
}

/// `val|let|const NAME =` with no type annotation, at line start.
fn untyped_binding(code: &str) -> Option<(usize, String)> {
    let indent = code.len() - code.trim_start().len();
    let mut words = code.split_whitespace();
    if !matches!(words.next()?, "val" | "let" | "const") {
        return None;
    }
    let name = words.next()?;
    if words.next()? != "=" || !name.chars().all(is_ident_char) {
        return None;
    }
    Some((indent, name.to_string()))
}

fn check_atto_block(file: &str, block: &CodeBlock, findings: &mut Vec<Finding>) {
    // Joined text so that multi-line calls are checked as a whole.
    let mut joined = String::new();
    for line in &block.lines {
        joined.push_str(strip_comment(line));
        joined.push('\n');
    }
    for (label, line) in equals_named_args(&joined) {
        findings.push(Finding {
            file: file.to_string(),
            line: block.start_line + line,
            rule: "example-named-arg",
            message: format!("value argument `{label}=...` must be written `{label}: ...` (chapter 03)"),
        });
    }
    let mut seen: BTreeMap<(usize, String), usize> = BTreeMap::new();
    for (idx, raw) in block.lines.iter().enumerate() {
        let code = strip_comment(raw);
        let line_no = block.start_line + idx;
        for param in colon_typed_params(code) {
            findings.push(Finding {
                file: file.to_string(),
                line: line_no,
                rule: "example-param-order",
                message: format!("parameter `{param}` must put the type first (chapter 01)"),
            });
        }
        // A less-indented line closes inner scopes.
        let indent = code.len() - code.trim_start().len();
        if !code.trim().is_empty() {
            seen.retain(|(ind, _), _| *ind <= indent);
        }
        if let Some(key) = untyped_binding(code) {
            if let Some(prev) = seen.insert(key.clone(), line_no) {
                findings.push(Finding {
                    file: file.to_string(),
                    line: line_no,
                    rule: "example-redeclare",
                    message: format!("`{}` is redeclared in the same scope (first on line {prev})", key.1),
                });
            }
        }
    }
}

// ---------------------------------------------------------------- workflow paths and decision maturity

/// Find explicit numbered chapter paths in workflow text (not globs, comments,
/// or external references).  This prevents stale path filters from silently
/// suppressing tests when a chapter is moved or renumbered.
fn check_workflow_spec_refs(
    file: &str,
    workflow: &str,
    docs: &BTreeMap<String, String>,
    findings: &mut Vec<Finding>,
) {
    for (idx, line) in workflow.lines().enumerate() {
        if line.trim_start().starts_with('#') {
            continue;
        }
        let mut rest = line;
        while let Some(start) = rest.find("spec/") {
            let candidate = &rest[start..];
            let path = candidate
                .split(|c: char| c.is_whitespace() || matches!(c, '\'' | '"' | ',' | ']' | '[' | '#' | ')'))
                .next()
                .unwrap_or("");
            if chapter_number(path).is_some() && !docs.contains_key(path) {
                findings.push(Finding {
                    file: file.to_string(),
                    line: idx + 1,
                    rule: "workflow-path",
                    message: format!("workflow references absent chapter `{path}`"),
                });
            }
            rest = &candidate["spec/".len()..];
        }
    }
}

/// The Guard model must trigger for edits to chapter 20 on both PRs and main
/// pushes. A stale path checker alone cannot catch someone removing a trigger.
fn check_guard_trigger_paths(file: &str, workflow: &str, findings: &mut Vec<Finding>) {
    let mut event: Option<&str> = None;
    let mut in_paths = false;
    let mut seen: BTreeSet<&str> = BTreeSet::new();
    for line in workflow.lines() {
        let trimmed = line.trim();
        let indent = line.len() - line.trim_start().len();
        if indent == 2 && trimmed.ends_with(':') {
            event = match trimmed.trim_end_matches(':') {
                "pull_request" => Some("pull_request"),
                "push" => Some("push"),
                _ => None,
            };
            in_paths = false;
        } else if indent == 4 {
            in_paths = event.is_some() && trimmed == "paths:";
        } else if indent >= 6 && in_paths
            && trimmed.strip_prefix("- ").is_some_and(|path| path.trim_matches(|c| c == '\u{27}' || c == '"') == "spec/20-guard.md")
        {
            if let Some(e) = event {
                seen.insert(e);
            }
        }
    }
    for required in ["pull_request", "push"] {
        if !seen.contains(required) {
            findings.push(Finding {
                file: file.to_string(),
                line: 1,
                rule: "guard-trigger",
                message: format!("{required}.paths must watch spec/20-guard.md"),
            });
        }
    }
}

fn check_workflow_paths(
    root: &Path,
    docs: &BTreeMap<String, String>,
    findings: &mut Vec<Finding>,
) {
    let dir = root.join(".github/workflows");
    if !dir.exists() {
        return;
    }
    let entries = match fs::read_dir(&dir) {
        Ok(entries) => entries,
        Err(e) => {
            findings.push(Finding {
                file: ".github/workflows".to_string(),
                line: 1,
                rule: "workflow-path",
                message: format!("cannot read workflows: {e}"),
            });
            return;
        }
    };
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(e) => {
                findings.push(Finding {
                    file: ".github/workflows".to_string(),
                    line: 1,
                    rule: "workflow-path",
                    message: format!("cannot enumerate workflow: {e}"),
                });
                continue;
            }
        };
        let path = entry.path();
        if !matches!(path.extension().and_then(|s| s.to_str()), Some("yml" | "yaml")) {
            continue;
        }
        let name = format!(".github/workflows/{}", entry.file_name().to_string_lossy());
        match fs::read_to_string(&path) {
            Ok(source) => {
                check_workflow_spec_refs(&name, &source, docs, findings);
                if name == ".github/workflows/guard-model.yml" {
                    check_guard_trigger_paths(&name, &source, findings);
                }
            },
            Err(e) => findings.push(Finding {
                file: name,
                line: 1,
                rule: "workflow-path",
                message: format!("cannot read workflow: {e}"),
            }),
        }
    }
}

/// S-41..S-57 are *audit decisions*, not automatically ratified rules.
/// Every row must name its maturity. A future DECIDED claim must link to
/// independent compiler-owner review in the same row, to make status changes
/// visible and reviewable rather than an unnoticed prose edit.
fn check_decision_statuses(docs: &BTreeMap<String, String>, findings: &mut Vec<Finding>) {
    let ledger_file = "spec/12-open-questions.md";
    let Some(ledger) = docs.get(ledger_file) else { return };
    let mut present = BTreeSet::new();
    for (idx, line) in prose_lines(ledger) {
        let cells: Vec<_> = line.split('|').collect();
        let id = cells.get(1).map(|s| s.trim()).unwrap_or("");
        let Some(n) = id.strip_prefix("S-").and_then(|s| s.parse::<usize>().ok()) else { continue };
        if !(41..=57).contains(&n) {
            continue;
        }
        present.insert(n);
        let resolution = cells.get(3).copied().unwrap_or("");
        let statuses = ["**DECIDED**", "**TARGET**", "**PROPOSED**", "**UNRESOLVED**"];
        let count = statuses.iter().filter(|s| resolution.contains(**s)).count();
        if count != 1 {
            findings.push(Finding {
                file: ledger_file.to_string(),
                line: idx,
                rule: "decision-status",
                message: format!("{id} must have exactly one explicit DECIDED/TARGET/PROPOSED/UNRESOLVED classification"),
            });
        }
        if resolution.contains("**DECIDED**")
            && !(resolution.contains("Reviewed-by:")
                && (resolution.contains("/pull/") || resolution.contains("/issues/")))
        {
            findings.push(Finding {
                file: ledger_file.to_string(),
                line: idx,
                rule: "decision-status",
                message: format!("{id} cannot become DECIDED without a Reviewed-by: GitHub review/decision link"),
            });
        }
    }
    // Deleting an audited question must not evade review by deleting its row.
    for n in 41..=57 {
        if !present.contains(&n) {
            findings.push(Finding {
                file: ledger_file.to_string(),
                line: 1,
                rule: "decision-status",
                message: format!("S-{n} is missing from the audited decision ledger"),
            });
        }
    }
}

// ---------------------------------------------------------------- tests

#[cfg(test)]
mod tests {
    use super::*;

    fn block(src: &str) -> CodeBlock {
        CodeBlock { start_line: 1, lines: src.lines().map(String::from).collect() }
    }

    fn findings(src: &str) -> Vec<Finding> {
        let mut f = Vec::new();
        check_atto_block("x.md", &block(src), &mut f);
        f
    }

    fn rules(src: &str) -> Vec<&'static str> {
        findings(src).into_iter().map(|f| f.rule).collect()
    }

    #[test]
    fn slug_matches_github() {
        assert_eq!(slugify("00 — Scope, Normative Vocabulary"), "00--scope-normative-vocabulary");
        assert_eq!(
            slugify("Named generic type parameters and specialization (v1 target)"),
            "named-generic-type-parameters-and-specialization-v1-target"
        );
        assert_eq!(slugify("`Actor.pipe` usage"), "actorpipe-usage");
    }

    #[test]
    fn duplicate_headings_get_suffixes() {
        let a = heading_anchors("# A\n## B\n## B\n```\n# not a heading\n```\n");
        assert!(a.contains("a") && a.contains("b") && a.contains("b-1"));
        assert!(!a.contains("not-a-heading"));
    }

    #[test]
    fn equals_named_argument_is_flagged_on_its_own_line() {
        assert_eq!(rules("await self.spawn_actor(HttpActor(), restart=#permanent)"), vec!["example-named-arg"]);
        let f = findings("val g = Actor.pipe(\n  Reader(),\n  Transformer(batch_size=256)\n)");
        assert_eq!(f.len(), 1);
        assert_eq!(f[0].line, 3);
    }

    #[test]
    fn generic_named_arguments_and_comparisons_are_allowed() {
        assert!(rules("fnc build<A=int, B=bool, C=B>() -> A ::\nend").is_empty());
        assert!(rules("val x = build<A=int, C=bool>()").is_empty());
        assert!(rules("val ok = check(a == b, c <= d, e != f)").is_empty());
        assert!(rules("val a = combine(second: 2, first: 1) // x=1").is_empty());
        assert!(rules("val s = f(\"a=b\")").is_empty());
        assert!(rules("self.handle_state(critical-write |s| -> {\n  s.count = s.count + 1\n})").is_empty());
    }

    #[test]
    fn colon_typed_parameter_is_flagged() {
        assert_eq!(rules("async on_panic(f: Failure) -> void ::"), vec!["example-param-order"]);
        assert!(rules("async on_panic(Failure f) -> void ::").is_empty());
        assert!(rules("val a = combine(second: 2, first: 1)").is_empty());
    }

    #[test]
    fn same_scope_redeclaration_is_flagged() {
        assert_eq!(rules("val g = a()\nval g = b()"), vec!["example-redeclare"]);
        assert!(rules("val a = 1\nval b = 2").is_empty());
        assert!(rules("fnc f() -> void ::\n  val x = 1\nend\nfnc g() -> void ::\n  val x = 2\nend").is_empty());
    }

    #[test]
    fn unclosed_fence_is_reported() {
        let mut f = Vec::new();
        check_fences("x.md", "text\n```atto\nval a = 1\n", &mut f);
        assert_eq!(f.len(), 1);
        let mut g = Vec::new();
        check_fences("x.md", "~~~atto\n```\n~~~\n", &mut g);
        assert!(g.is_empty());
    }

    #[test]
    fn question_ids_are_extracted() {
        assert_eq!(question_ids("see S-05 and (S-41)."), vec!["S-05", "S-41"]);
        assert!(question_ids("CS-05 S-5 S-05x").is_empty());
    }

    #[test]
    fn links_inside_inline_code_are_ignored() {
        assert!(link_targets("use `[a](missing.md)` literally").is_empty());
        assert_eq!(
            link_targets("see [ch](02-types.md#x) and [w](https://e.org)"),
            vec!["02-types.md#x".to_string(), "https://e.org".to_string()]
        );
    }

    #[test]
    fn relative_paths_normalize() {
        assert_eq!(normalize("spec", "../README.md"), "README.md");
        assert_eq!(normalize("docs/audit", "../../spec/01-x.md"), "spec/01-x.md");
    }
}

#[cfg(test)]
mod mutation_tests;
