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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

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
