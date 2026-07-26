use std::path::{Path, PathBuf};

use tauri::State;

use crate::commands::AppState;
use crate::error::{AppError, AppResult};
use crate::vault;

fn existing_entry(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let path = vault::resolve_rel(root, rel)?;
    if !path.exists() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    Ok(path)
}

#[tauri::command]
pub fn reveal_entry(state: State<'_, AppState>, rel: String) -> AppResult<()> {
    let path = existing_entry(&state.root()?, &rel)?;
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|error| AppError::Other(error.to_string()))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn resolves_existing_notes_and_folders() {
        let dir = tempdir().unwrap();
        vault::ensure_layout(dir.path()).unwrap();
        let notes = vault::notes_root(dir.path());
        fs::create_dir_all(notes.join("projects")).unwrap();
        fs::write(notes.join("projects/plan.md"), "# Plan").unwrap();

        assert_eq!(
            existing_entry(dir.path(), "projects").unwrap(),
            notes.join("projects")
        );
        assert_eq!(
            existing_entry(dir.path(), "projects/plan.md").unwrap(),
            notes.join("projects/plan.md")
        );
    }

    #[test]
    fn rejects_missing_and_escaping_entries() {
        let dir = tempdir().unwrap();
        vault::ensure_layout(dir.path()).unwrap();

        assert!(matches!(
            existing_entry(dir.path(), "missing.md"),
            Err(AppError::NotFound(_))
        ));
        assert!(matches!(
            existing_entry(dir.path(), "../outside.md"),
            Err(AppError::InvalidPath(_))
        ));
    }
}
