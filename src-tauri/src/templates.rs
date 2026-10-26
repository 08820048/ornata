//! Note templates: plain `.md` files under `.ornata/templates/`. Creating a
//! note from a template copies the file's content once — templates are read
//! only, never rewritten by the app.

use std::fs;
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::util::sanitize_name;
use crate::vault::DATA_DIR;

fn templates_dir(root: &Path) -> std::path::PathBuf {
    root.join(DATA_DIR).join("templates")
}

/// Template names (without extension), sorted.
pub fn list_templates(root: &Path) -> Vec<String> {
    let Ok(entries) = fs::read_dir(templates_dir(root)) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .flatten()
        .filter(|entry| entry.path().is_file())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().to_string();
            name.strip_suffix(".md").map(str::to_string)
        })
        .filter(|name| !name.starts_with('.'))
        .collect();
    names.sort();
    names
}

/// Create or overwrite a template (the "save note as template" path).
pub fn write_template(root: &Path, name: &str, content: &str) -> AppResult<()> {
    // Reject blank names up front — sanitize_name would silently fall back
    // to "Untitled", which is the right default for notes but not here.
    if name.trim().is_empty() {
        return Err(AppError::InvalidInput("empty template name".into()));
    }
    let file_name = sanitize_name(name);
    let file_name = file_name.trim();
    if file_name.is_empty() {
        return Err(AppError::InvalidInput("empty template name".into()));
    }
    let dir = templates_dir(root);
    fs::create_dir_all(&dir).map_err(|e| AppError::Other(format!("templates: {e}")))?;
    fs::write(dir.join(format!("{file_name}.md")), content)?;
    Ok(())
}

/// Content of one template, addressed by name.
pub fn read_template(root: &Path, name: &str) -> AppResult<String> {
    let file_name = sanitize_name(name);
    if file_name.trim().is_empty() {
        return Err(AppError::InvalidInput("empty template name".into()));
    }
    let path = templates_dir(root).join(format!("{file_name}.md"));
    if !path.is_file() {
        return Err(AppError::NotFound(name.to_string()));
    }
    Ok(fs::read_to_string(path)?)
}

const SEEDED: &str = ".project-seeded";

const PRD_EN: &str = "# PRD: \n\n## Problem\n\n## Goals\n\n## Non-goals\n\n## Solution\n\n## Tasks\n\n- [ ] \n";
const PRD_ZH: &str = "# PRD：\n\n## 背景与问题\n\n## 目标\n\n## 不做什么\n\n## 方案\n\n## 任务\n\n- [ ] \n";
const BUG_EN: &str = "# Bug: \n\n## What happens\n\n## Steps to reproduce\n\n1. \n\n## Expected\n\n## Environment\n\n## Cause\n\n## Fix\n\n- [ ] Fix it #bug !high\n";
const BUG_ZH: &str = "# Bug：\n\n## 现象\n\n## 复现步骤\n\n1. \n\n## 期望\n\n## 环境\n\n## 原因\n\n## 修复\n\n- [ ] 修复 #bug !high\n";

/// Add "PRD" and "Bug report" templates the first time a project is made.
/// A marker keeps them from coming back after the user deletes or edits them,
/// and an existing template of the same name is never touched.
pub fn seed_project_templates(root: &Path, zh: bool) -> AppResult<()> {
    let dir = templates_dir(root);
    if dir.join(SEEDED).exists() {
        return Ok(());
    }
    fs::create_dir_all(&dir)?;
    let (prd, bug) = if zh { (PRD_ZH, BUG_ZH) } else { (PRD_EN, BUG_EN) };
    let bug_name = if zh { "Bug 报告" } else { "Bug report" };
    for (name, body) in [("PRD", prd), (bug_name, bug)] {
        let path = dir.join(format!("{name}.md"));
        if !path.exists() {
            fs::write(path, body)?;
        }
    }
    fs::write(dir.join(SEEDED), "")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn project_templates_are_seeded_once_and_never_overwrite() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        write_template(dir.path(), "PRD", "mine").unwrap();
        seed_project_templates(dir.path(), false).unwrap();
        assert_eq!(read_template(dir.path(), "PRD").unwrap(), "mine");
        assert!(read_template(dir.path(), "Bug report").unwrap().contains("Steps to reproduce"));
        fs::remove_file(templates_dir(dir.path()).join("Bug report.md")).unwrap();
        seed_project_templates(dir.path(), false).unwrap();
        assert!(read_template(dir.path(), "Bug report").is_err());
        assert_eq!(list_templates(dir.path()), ["PRD"]);
    }

    #[test]
    fn lists_and_reads_templates() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let templates = templates_dir(dir.path());
        fs::create_dir_all(&templates).unwrap();
        fs::write(templates.join("meeting.md"), "# Meeting\n- attendees").unwrap();
        fs::write(templates.join("daily.md"), "# {{date}}").unwrap();
        fs::write(templates.join(".hidden.md"), "nope").unwrap();

        assert_eq!(list_templates(dir.path()), vec!["daily", "meeting"]);
        assert_eq!(read_template(dir.path(), "daily").unwrap(), "# {{date}}");
        assert!(read_template(dir.path(), "missing").is_err());
    }

    #[test]
    fn writes_templates_and_shows_them_in_the_list() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        write_template(dir.path(), "Standup", "# Standup notes").unwrap();
        assert_eq!(read_template(dir.path(), "standup").unwrap(), "# Standup notes");
        assert_eq!(list_templates(dir.path()), vec!["Standup"]);
        assert!(write_template(dir.path(), "   ", "x").is_err());
    }
}
