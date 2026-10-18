use std::path::Path;

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::commands::AppState;
use crate::config::{self, ImageUpload, Language, Theme};
use crate::error::{AppError, AppResult};

/// Label of the standalone settings window. The frontend branches on this
/// (via `getCurrentWindow().label`) to render the settings UI instead of the
/// main workspace.
pub const SETTINGS_WINDOW_LABEL: &str = "settings";

/// Scalar settings the settings window needs to render itself. Deliberately
/// side-effect free — unlike `startup`, reading this must not activate a vault
/// or spawn a filesystem watcher, since the main window already owns those.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSnapshot {
    pub theme: Theme,
    pub language: Language,
    pub outline_sound: bool,
    pub cursor_animation: bool,
    pub image_upload: ImageUpload,
    pub vault_path: Option<String>,
    pub vault_name: Option<String>,
}

fn vault_name(root: &Path) -> Option<String> {
    root.file_name().map(|name| name.to_string_lossy().into_owned())
}

/// Read the current settings without touching window or vault state.
#[tauri::command]
pub fn get_settings(app: AppHandle, state: State<'_, AppState>) -> AppResult<SettingsSnapshot> {
    let cfg = config::load(&app);
    let root = state.root().ok();
    Ok(SettingsSnapshot {
        theme: cfg.theme,
        language: cfg.language,
        outline_sound: cfg.outline_sound,
        cursor_animation: cfg.cursor_animation,
        image_upload: cfg.image_upload,
        vault_path: root.as_ref().map(|path| path.display().to_string()),
        vault_name: root.as_deref().and_then(vault_name),
    })
}

/// Open the settings window, focusing it if it already exists. The window
/// loads the same entry point as the main window; the frontend tells them
/// apart by label.
#[tauri::command]
pub fn open_settings_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(SETTINGS_WINDOW_LABEL) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    let builder = tauri::WebviewWindowBuilder::new(
        &app,
        SETTINGS_WINDOW_LABEL,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Settings")
    .inner_size(860.0, 600.0)
    .min_inner_size(640.0, 460.0)
    .resizable(true)
    .center();

    // Match the main window chrome on macOS: transparent title bar with the
    // traffic lights floating over the sidebar, hidden title text.
    #[cfg(target_os = "macos")]
    let builder = builder
        .title_bar_style(tauri::TitleBarStyle::Overlay)
        .hidden_title(true);

    builder
        .build()
        .map_err(|e| AppError::Other(format!("failed to open settings window: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::vault_name;
    use std::path::Path;

    #[test]
    fn vault_name_is_the_last_path_segment() {
        assert_eq!(
            vault_name(Path::new("/Users/me/Documents/Vault")).as_deref(),
            Some("Vault")
        );
        assert_eq!(vault_name(Path::new("/")).as_deref(), None);
    }
}
