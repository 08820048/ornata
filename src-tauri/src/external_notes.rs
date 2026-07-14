use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::assets;
use crate::commands::AppState;
use crate::error::{AppError, AppResult};
use crate::util::sanitize_name;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExternalNote {
    pub path: String,
    pub title: String,
}

fn markdown_path(path: impl AsRef<Path>) -> AppResult<PathBuf> {
    let canonical = path
        .as_ref()
        .canonicalize()
        .map_err(|_| AppError::NotFound(path.as_ref().display().to_string()))?;
    if !canonical.is_file() {
        return Err(AppError::InvalidPath(canonical.display().to_string()));
    }
    let extension = canonical
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if !extension.eq_ignore_ascii_case("md") && !extension.eq_ignore_ascii_case("markdown") {
        return Err(AppError::InvalidInput(
            "only .md and .markdown files can be opened".to_string(),
        ));
    }
    Ok(canonical)
}

fn descriptor(path: &Path) -> ExternalNote {
    ExternalNote {
        path: path.display().to_string(),
        title: path
            .file_stem()
            .map(|value| value.to_string_lossy().to_string())
            .unwrap_or_else(|| "Untitled".to_string()),
    }
}

fn available_rename_path(source: &Path, name: &str) -> AppResult<PathBuf> {
    let parent = source
        .parent()
        .ok_or_else(|| AppError::InvalidPath(source.display().to_string()))?;
    let extension = source
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("md");
    let stem = sanitize_name(name);
    let make = |suffix: Option<usize>| {
        let name = suffix.map_or_else(|| stem.clone(), |number| format!("{stem} {number}"));
        parent.join(format!("{name}.{extension}"))
    };
    let mut target = make(None);
    if target == source {
        return Ok(target);
    }
    if target.exists() && target.canonicalize().ok().as_deref() == Some(source) {
        // Case-only rename on a case-insensitive filesystem.
        return Ok(target);
    }
    let mut counter = 2;
    while target.exists() {
        target = make(Some(counter));
        counter += 1;
    }
    Ok(target)
}

pub(crate) fn authorize(
    app: &AppHandle,
    state: &AppState,
    path: impl AsRef<Path>,
) -> AppResult<ExternalNote> {
    let path = markdown_path(path)?;
    if let Some(parent) = path.parent() {
        // External Markdown may contain relative images next to the document.
        let _ = app.asset_protocol_scope().allow_directory(parent, true);
    }
    state.allow_external(path.clone())?;
    Ok(descriptor(&path))
}

fn authorized_path(state: &AppState, path: &str) -> AppResult<PathBuf> {
    let path = markdown_path(path)?;
    if state.is_external_allowed(&path)? {
        Ok(path)
    } else {
        Err(AppError::InvalidPath(
            "external file has not been authorized".to_string(),
        ))
    }
}

#[tauri::command]
pub async fn choose_external_notes(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<ExternalNote>> {
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .add_filter("Markdown", &["md", "markdown"])
                .blocking_pick_files()
        }
    })
    .await
    .map_err(|error| AppError::Other(error.to_string()))?;

    let mut notes = Vec::new();
    for file in picked.unwrap_or_default() {
        let path = file
            .into_path()
            .map_err(|error| AppError::InvalidPath(error.to_string()))?;
        notes.push(authorize(&app, &state, path)?);
    }
    Ok(notes)
}

/// Re-authorize persisted external tabs after restart. Invalid/missing files
/// are omitted so one stale session entry does not prevent the rest restoring.
#[tauri::command]
pub fn authorize_external_notes(
    app: AppHandle,
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Vec<ExternalNote> {
    paths
        .into_iter()
        .filter_map(|path| authorize(&app, &state, path).ok())
        .collect()
}

#[tauri::command]
pub fn take_opened_external_notes(state: State<'_, AppState>) -> AppResult<Vec<ExternalNote>> {
    state.take_opened()
}

#[tauri::command]
pub fn read_external_note(state: State<'_, AppState>, path: String) -> AppResult<String> {
    Ok(std::fs::read_to_string(authorized_path(&state, &path)?)?)
}

#[tauri::command]
pub fn write_external_note(
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> AppResult<()> {
    Ok(std::fs::write(authorized_path(&state, &path)?, content)?)
}

#[tauri::command]
pub fn rename_external_note(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> AppResult<ExternalNote> {
    let source = authorized_path(&state, &path)?;
    let target = available_rename_path(&source, &name)?;
    if target != source {
        std::fs::rename(&source, &target)?;
        let target = target.canonicalize()?;
        state.replace_external(&source, target.clone())?;
        return Ok(descriptor(&target));
    }
    Ok(descriptor(&source))
}

#[tauri::command]
pub fn delete_external_note(state: State<'_, AppState>, path: String) -> AppResult<()> {
    let source = authorized_path(&state, &path)?;
    trash::delete(&source).map_err(|error| AppError::Other(format!("trash: {error}")))?;
    state.revoke_external(&source)
}

#[tauri::command]
pub fn save_external_image(
    state: State<'_, AppState>,
    path: String,
    data: String,
    extension: String,
) -> AppResult<String> {
    let source = authorized_path(&state, &path)?;
    Ok(assets::save_external_image(&source, &data, &extension)?
        .display()
        .to_string())
}

#[tauri::command]
pub fn open_external_link(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    href: String,
) -> AppResult<Option<ExternalNote>> {
    let source = authorized_path(&state, &path)?;
    if href.starts_with('#') || href.trim().is_empty() {
        return Ok(None);
    }
    let base = tauri::Url::from_file_path(&source)
        .map_err(|_| AppError::InvalidPath(source.display().to_string()))?;
    let target = base
        .join(&href)
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    if target.scheme() != "file" {
        return Ok(None);
    }
    let path = target
        .to_file_path()
        .map_err(|_| AppError::InvalidPath(target.to_string()))?;
    authorize(&app, &state, path).map(Some)
}

#[tauri::command]
pub async fn export_external_note(
    app: AppHandle,
    state: State<'_, AppState>,
    path: String,
    content: String,
) -> AppResult<Option<String>> {
    let source = authorized_path(&state, &path)?;
    let file_name = source
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "note.md".to_string());
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || {
            app.dialog()
                .file()
                .set_file_name(file_name)
                .blocking_save_file()
        }
    })
    .await
    .map_err(|error| AppError::Other(error.to_string()))?;
    let Some(destination) = picked else {
        return Ok(None);
    };
    let destination = destination
        .into_path()
        .map_err(|error| AppError::InvalidPath(error.to_string()))?;
    std::fs::write(&destination, content)?;
    Ok(Some(destination.display().to_string()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_markdown_extensions_case_insensitively() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.MARKDOWN");
        std::fs::write(&path, "hello").unwrap();
        assert_eq!(markdown_path(&path).unwrap(), path.canonicalize().unwrap());
    }

    #[test]
    fn rejects_non_markdown_files() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("note.txt");
        std::fs::write(&path, "hello").unwrap();
        assert!(matches!(
            markdown_path(path),
            Err(AppError::InvalidInput(_))
        ));
    }

    #[test]
    fn rename_path_preserves_extension_and_suffixes_collisions() {
        let dir = tempfile::tempdir().unwrap();
        let source = dir.path().join("old.markdown");
        std::fs::write(&source, "hello").unwrap();
        std::fs::write(dir.path().join("New.markdown"), "collision").unwrap();
        assert_eq!(
            available_rename_path(&source, "New").unwrap(),
            dir.path().join("New 2.markdown")
        );
    }
}
