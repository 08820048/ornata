use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Manager, State};

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

/// Files exported this session. Exports land outside the vault, so these are
/// the only outside paths `reveal_export` will show — the frontend can't use
/// it to probe arbitrary locations.
#[derive(Default)]
pub struct ExportedFiles(Mutex<Vec<PathBuf>>);

/// Enough for any run of exports a toast could still point at.
const EXPORTS_REMEMBERED: usize = 32;

impl ExportedFiles {
    fn remember(&self, path: &Path) {
        if let Ok(mut paths) = self.0.lock() {
            paths.retain(|known| known != path);
            paths.push(path.to_path_buf());
            let excess = paths.len().saturating_sub(EXPORTS_REMEMBERED);
            paths.drain(..excess);
        }
    }

    fn contains(&self, path: &Path) -> bool {
        self.0.lock().is_ok_and(|paths| paths.iter().any(|known| known == path))
    }
}

/// Record a file an export just wrote, so its toast can reveal it.
pub fn remember_export(app: &AppHandle, path: &Path) {
    app.state::<ExportedFiles>().remember(path);
}

/// Show an exported file in Finder (from the "exported" toast).
#[tauri::command]
pub fn reveal_export(exported: State<'_, ExportedFiles>, path: String) -> AppResult<()> {
    let path = PathBuf::from(path);
    if !exported.contains(&path) {
        return Err(AppError::InvalidPath("not an exported file".into()));
    }
    if !path.exists() {
        return Err(AppError::NotFound(path.display().to_string()));
    }
    tauri_plugin_opener::reveal_item_in_dir(path)
        .map_err(|error| AppError::Other(error.to_string()))
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
    fn exported_files_are_remembered_and_bounded() {
        let exported = ExportedFiles::default();
        exported.remember(Path::new("/tmp/a.pdf"));
        assert!(exported.contains(Path::new("/tmp/a.pdf")));
        assert!(!exported.contains(Path::new("/etc/passwd")));
        for i in 0..EXPORTS_REMEMBERED {
            exported.remember(&PathBuf::from(format!("/tmp/{i}.html")));
        }
        assert!(!exported.contains(Path::new("/tmp/a.pdf")));
        assert!(exported.contains(Path::new("/tmp/0.html")));
    }

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
