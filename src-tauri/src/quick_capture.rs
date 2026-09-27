//! The global quick-capture window: a small always-on-top note field,
//! summoned by a system-wide shortcut. It never writes to the vault itself —
//! submitting emits the text to the main window, which is the single writer
//! (see the vault store's `appendQuickCapture`).

use tauri::{AppHandle, Emitter, Manager};

use crate::error::{AppError, AppResult};

pub const LABEL: &str = "quick-capture";

/// Show and focus the capture window, creating it on first use.
pub fn show(app: &AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        app,
        LABEL,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Quick capture")
    .inner_size(380.0, 170.0)
    .resizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .build()
        .map_err(|e| AppError::Other(format!("quick capture: {e}")))?;
    Ok(())
}

/// Toggle the capture window from the global shortcut.
pub fn toggle(app: &AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
            return Ok(());
        }
    }
    show(app)
}

fn hide(app: &AppHandle) {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
}

/// Hand the captured text to the main window and hide the field. The main
/// window owns all vault writes.
#[tauri::command]
pub fn submit_quick_capture(app: AppHandle, text: String) -> AppResult<()> {
    if !text.trim().is_empty() {
        app.emit_to("main", "ornata-quick-capture", text)
            .map_err(|e| AppError::Other(format!("quick capture: {e}")))?;
    }
    hide(&app);
    Ok(())
}

#[tauri::command]
pub fn dismiss_quick_capture(app: AppHandle) -> AppResult<()> {
    hide(&app);
    Ok(())
}

#[tauri::command]
pub fn toggle_quick_capture(app: AppHandle) -> AppResult<()> {
    toggle(&app)
}
