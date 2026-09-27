//! Export a note through a hidden print window that renders the note with the
//! app's real editor pipeline (same extensions: images, KaTeX, Mermaid,
//! Shiki), then either opens the system print dialog (PDF via "Save as PDF")
//! or hands the serialized HTML back for file/clipboard export.
//!
//! tauri 2.11 has no `print_to_pdf`; the dialog route is the documented
//! fallback and gives the user full print-sheet control.

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};

pub const LABEL: &str = "print";

#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ExportKind {
    Pdf,
    Html,
    Clipboard,
}

#[derive(Debug)]
pub struct PrintJob {
    pub kind: ExportKind,
    pub markdown: String,
    pub vault_root: String,
    pub default_name: String,
    /// HTML file destination, picked before rendering (HTML exports only).
    pub path: Option<PathBuf>,
}

#[derive(Default)]
pub struct PrintState {
    job: Mutex<Option<PrintJob>>,
}

fn ensure_window(app: &AppHandle, visible: bool) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        if visible {
            let _ = window.show();
            let _ = window.set_focus();
        }
        return Ok(());
    }
    let mut builder = tauri::WebviewWindowBuilder::new(
        app,
        LABEL,
        tauri::WebviewUrl::App("index.html".into()),
    )
    .title("Print")
    .inner_size(820.0, 900.0)
    .visible(false);
    if visible {
        builder = builder.visible(true);
    }
    builder
        .build()
        .map_err(|e| AppError::Other(format!("print window: {e}")))?;
    Ok(())
}

fn store_job(
    app: &AppHandle,
    kind: ExportKind,
    markdown: String,
    vault_root: String,
    default_name: String,
    path: Option<PathBuf>,
) -> AppResult<()> {
    let state = app.state::<PrintState>();
    let mut job = state.job.lock().map_err(|e| AppError::Other(e.to_string()))?;
    *job = Some(PrintJob {
        kind,
        markdown,
        vault_root,
        default_name,
        path,
    });
    Ok(())
}

fn emit_to_window<T: serde::Serialize + Clone>(
    app: &AppHandle,
    target: &str,
    event: &str,
    payload: T,
) -> AppResult<()> {
    app.emit_to(target, event, payload)
        .map_err(|e| AppError::Other(format!("{event}: {e}")))
}

fn take_job(app: &AppHandle) -> AppResult<PrintJob> {
    let state = app.state::<PrintState>();
    let mut job = state.job.lock().map_err(|e| AppError::Other(e.to_string()))?;
    job.take().ok_or_else(|| AppError::Other("no print job".into()))
}

/// Kick off an export: stage the job, create the print window (hidden for
/// HTML/clipboard, visible for PDF so the print sheet has a document), and
/// hand the markdown over. The window signals back via `print_view_ready`.
#[tauri::command]
pub async fn start_print_export(
    app: AppHandle,
    markdown: String,
    vault_root: String,
    default_name: String,
    kind: ExportKind,
) -> AppResult<()> {
    // HTML exports need a destination picked before any rendering happens.
    let path = if kind == ExportKind::Html {
        let app_handle = app.clone();
        let file_name = format!("{}.html", default_name);
        tauri::async_runtime::spawn_blocking(move || {
            app_handle
                .dialog()
                .file()
                .set_file_name(file_name)
                .blocking_save_file()
        })
        .await
        .map_err(|e| AppError::Other(e.to_string()))?
        .map(|dest| dest.into_path())
        .transpose()
        .map_err(|e| AppError::InvalidPath(e.to_string()))?
    } else {
        None
    };
    // User cancelled the save sheet — nothing to render.
    if kind == ExportKind::Html && path.is_none() {
        return Ok(());
    }

    store_job(&app, kind, markdown, vault_root, default_name, path)?;
    let visible = {
        let state = app.state::<PrintState>();
        let job = state.job.lock().map_err(|e| AppError::Other(e.to_string()))?;
        matches!(job.as_ref().map(|j| &j.kind), Some(ExportKind::Pdf))
    };
    ensure_window(&app, visible)?;
    emit_to_window(&app, LABEL, "ornata-print", ())?;
    Ok(())
}

/// The print view calls this once its content has rendered (fonts, images and
/// diagrams settled) and hands over the serialized body + page CSS.
#[tauri::command]
pub async fn print_view_ready(
    app: AppHandle,
    window: tauri::WebviewWindow,
    body_html: String,
    page_css: String,
) -> AppResult<()> {
    let job = take_job(&app)?;
    match job.kind {
        ExportKind::Pdf => {
            // The system print sheet; the user chooses "Save as PDF".
            window.print().map_err(|e| AppError::Other(e.to_string()))?;
            if let Some(window) = app.get_webview_window(LABEL) {
                let _ = window.hide();
            }
        }
        ExportKind::Html => {
            let Some(path) = job.path else {
                return Err(AppError::Other("html export missing path".into()));
            };
            let html = assemble_html(&body_html, &page_css, &job.vault_root);
            std::fs::write(&path, html)
                .map_err(|e| AppError::Other(format!("html export: {e}")))?;
            if let Some(window) = app.get_webview_window(LABEL) {
                let _ = window.hide();
            }
            emit_to_window(&app, "main", "ornata-export-done", path.display().to_string())?;
        }
        ExportKind::Clipboard => {
            emit_to_window(
                &app,
                "main",
                "ornata-rich-text",
                RichTextPayload {
                    html: assemble_html(&body_html, &page_css, &job.vault_root),
                    plain: job.markdown,
                },
            )?;
            if let Some(window) = app.get_webview_window(LABEL) {
                let _ = window.hide();
            }
        }
    }
    Ok(())
}

fn assemble_html(body: &str, css: &str, vault_root: &str) -> String {
    // Rewrite asset-protocol image sources into data URLs so the exported
    // file is standalone.
    let inlined = inline_asset_images(body, vault_root);
    format!(
        "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<style>\n{css}\nbody {{ margin: 0; }}\n.prose-note {{ max-width: 760px; margin: 0 auto; padding: 48px 32px; }}\n@media print {{ .prose-note {{ padding: 0; }} }}\n</style>\n</head>\n<body class=\"light\">\n<div class=\"prose-note\">{inlined}</div>\n</body>\n</html>"
    )
}

fn inline_asset_images(html: &str, vault_root: &str) -> String {
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    let markers = ["asset://localhost/", "http://asset.localhost/"];
    loop {
        let hit = markers
            .iter()
            .filter_map(|m| rest.find(m).map(|pos| (pos, *m)))
            .min_by_key(|(pos, _)| *pos);
        let Some((pos, marker)) = hit else { break };
        out.push_str(&rest[..pos]);
        rest = &rest[pos + marker.len()..];
        // The path runs until a quote, paren or whitespace; it is
        // percent-encoded by convertFileSrc.
        let end = rest
            .find(|c: char| c == '"' || c == '\'' || c == ')' || c.is_whitespace())
            .unwrap_or(rest.len());
        let encoded = &rest[..end];
        let decoded = percent_decode(encoded);
        let abs = PathBuf::from(decoded);
        let path = if abs.is_absolute() {
            abs
        } else {
            PathBuf::from(vault_root).join(abs)
        };
        let mime = match path
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("")
            .to_lowercase()
            .as_str()
        {
            "png" => "image/png",
            "jpg" | "jpeg" => "image/jpeg",
            "gif" => "image/gif",
            "webp" => "image/webp",
            "svg" => "image/svg+xml",
            _ => "application/octet-stream",
        };
        match std::fs::read(&path) {
            Ok(bytes) => {
                out.push_str(&format!("data:{mime};base64,{}", crate::assets::encode_base64(&bytes)));
            }
            Err(_) => out.push_str(&format!("file://{encoded}")),
        }
        rest = &rest[end..];
    }
    out.push_str(rest);
    out
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[derive(Clone, Serialize)]
struct RichTextPayload {
    html: String,
    plain: String,
}
