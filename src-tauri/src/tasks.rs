use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::notes::{read_note, write_note};
use crate::vault::{notes_root, rel_of};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenTask {
    pub rel: String,
    pub title: String,
    /// Zero-based line index in the note file.
    pub line: usize,
    pub text: String,
}

/// Every unchecked `- [ ]` task list item across the vault, outside fenced
/// code blocks, grouped by note path.
pub fn open_tasks(root: &Path) -> AppResult<Vec<OpenTask>> {
    let mut tasks = Vec::new();
    walk(root, &notes_root(root), &mut tasks)?;
    tasks.sort_by(|a, b| {
        a.rel
            .to_lowercase()
            .cmp(&b.rel.to_lowercase())
            .then(a.line.cmp(&b.line))
    });
    Ok(tasks)
}

/// Tick the open task at `line`, provided it still reads `text` — guards
/// against the note having changed since the list was fetched.
pub fn complete_task(root: &Path, rel: &str, line: usize, text: &str) -> AppResult<()> {
    let content = read_note(root, rel)?;
    let mut lines: Vec<&str> = content.split('\n').collect();
    let Some(current) = lines.get(line).copied() else {
        return Err(AppError::InvalidInput("task no longer exists".into()));
    };
    if open_task_text(current) != Some(text) {
        return Err(AppError::InvalidInput("task no longer exists".into()));
    }
    let done = current.replacen("[ ]", "[x]", 1);
    lines[line] = &done;
    write_note(root, rel, &lines.join("\n"))
}

fn walk(root: &Path, dir: &Path, tasks: &mut Vec<OpenTask>) -> AppResult<()> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            walk(root, &path, tasks)?;
            continue;
        }
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        let rel = rel_of(root, &path)?;
        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let mut fenced = false;
        for (line, raw) in content.split('\n').enumerate() {
            let trimmed = raw.trim_start();
            if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
                fenced = !fenced;
                continue;
            }
            if fenced {
                continue;
            }
            if let Some(text) = open_task_text(raw) {
                tasks.push(OpenTask {
                    rel: rel.clone(),
                    title: title.clone(),
                    line,
                    text: text.to_string(),
                });
            }
        }
    }
    Ok(())
}

/// `"  - [ ] Ship it"` → `Some("Ship it")`; anything else → `None`.
fn open_task_text(line: &str) -> Option<&str> {
    let rest = line.trim_start().trim_start_matches('>').trim_start();
    let rest = rest
        .strip_prefix("- ")
        .or_else(|| rest.strip_prefix("* "))
        .or_else(|| rest.strip_prefix("+ "))?;
    let text = rest.strip_prefix("[ ] ")?.trim_end_matches('\r').trim();
    (!text.is_empty()).then_some(text)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::create_note;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn lists_open_tasks_outside_code() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(
            root,
            &rel,
            "# Plan\n- [ ] Draft\n- [x] Done\n  * [ ] Nested\n```\n- [ ] code\n```\n- [ ]\n",
        )
        .unwrap();
        let tasks = open_tasks(root).unwrap();
        let found: Vec<_> = tasks.iter().map(|t| (t.line, t.text.as_str())).collect();
        assert_eq!(found, [(1, "Draft"), (3, "Nested")]);
    }

    #[test]
    fn completes_matching_task_only() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(root, &rel, "- [ ] Draft\r\n  - [ ] Nested\n").unwrap();
        assert!(complete_task(root, &rel, 0, "Other").is_err());
        complete_task(root, &rel, 1, "Nested").unwrap();
        complete_task(root, &rel, 0, "Draft").unwrap();
        assert_eq!(
            read_note(root, &rel).unwrap(),
            "- [x] Draft\r\n  - [x] Nested\n"
        );
        assert!(complete_task(root, &rel, 0, "Draft").is_err());
    }
}
