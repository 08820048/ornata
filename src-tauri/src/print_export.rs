//! Export a note through a hidden print window that renders the note with the
//! app's real editor pipeline (same extensions: images, KaTeX, Mermaid,
//! Shiki), then either writes a PDF or hands the serialized HTML back for
//! file/clipboard export.
//!
//! PDF on macOS is silent: save sheet first, then WebKit prints straight to
//! that file (`pdf_export.rs`). Elsewhere it falls back to the system print
//! dialog ("Save as PDF").

use std::path::PathBuf;
use std::sync::Mutex;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_dialog::DialogExt;

use crate::error::{AppError, AppResult};

pub const LABEL: &str = "print";

/// PDF export writes the file directly (no print sheet) where supported.
const SILENT_PDF: bool = cfg!(target_os = "macos");

#[derive(Debug, Clone, Serialize, serde::Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum ExportKind {
    Pdf,
    Html,
    Clipboard,
}

#[derive(Debug)]
pub struct PrintJob {
    pub id: u64,
    pub kind: ExportKind,
    pub markdown: String,
    pub vault_root: String,
    pub default_name: String,
    /// File destination, picked before rendering (HTML, and PDF on macOS).
    pub path: Option<PathBuf>,
}

/// One PDF bookmark: a heading's text and the index of its parent entry
/// (-1 for top level), computed by the print view (see lib/pdfOutline.ts).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct OutlineEntry {
    pub text: String,
    pub parent: i64,
}

/// What the print window renders. `id` changes on every export so a second
/// export of the same note still retriggers the page.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSource {
    pub id: u64,
    pub markdown: String,
    pub vault_root: String,
}

#[derive(Default)]
pub struct PrintState {
    job: Mutex<Option<PrintJob>>,
    next_id: Mutex<u64>,
}

fn ensure_window(app: &AppHandle, visible: bool) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        if visible {
            let _ = window.show();
            let _ = window.set_focus();
        } else {
            let _ = window.hide();
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
) -> AppResult<PrintSource> {
    let state = app.state::<PrintState>();
    let mut next_id = state
        .next_id
        .lock()
        .map_err(|e| AppError::Other(e.to_string()))?;
    *next_id += 1;
    let id = *next_id;
    drop(next_id);
    let source = PrintSource {
        id,
        markdown: markdown.clone(),
        vault_root: vault_root.clone(),
    };
    let mut job = state.job.lock().map_err(|e| AppError::Other(e.to_string()))?;
    *job = Some(PrintJob {
        id,
        kind,
        markdown,
        vault_root,
        default_name,
        path,
    });
    Ok(source)
}

/// The print window pulls this on load. The emit that follows can arrive
/// before the page has subscribed, so the pull is what actually delivers the
/// first job.
#[tauri::command]
pub fn current_print_job(app: AppHandle) -> AppResult<Option<PrintSource>> {
    let state = app.state::<PrintState>();
    let job = state.job.lock().map_err(|e| AppError::Other(e.to_string()))?;
    Ok(job.as_ref().map(|job| PrintSource {
        id: job.id,
        markdown: job.markdown.clone(),
        vault_root: job.vault_root.clone(),
    }))
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

fn take_job_if(app: &AppHandle, id: u64) -> AppResult<PrintJob> {
    let state = app.state::<PrintState>();
    let mut job = state.job.lock().map_err(|e| AppError::Other(e.to_string()))?;
    match job.as_ref() {
        Some(current) if current.id == id => job
            .take()
            .ok_or_else(|| AppError::Other("no print job".into())),
        Some(_) => Err(AppError::Other("stale print job".into())),
        None => Err(AppError::Other("no print job".into())),
    }
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
    // File exports need a destination picked before any rendering happens.
    let extension = match kind {
        ExportKind::Html => Some("html"),
        ExportKind::Pdf if SILENT_PDF => Some("pdf"),
        _ => None,
    };
    let path = if let Some(extension) = extension {
        let app_handle = app.clone();
        let file_name = format!("{default_name}.{extension}");
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
    if extension.is_some() && path.is_none() {
        return Ok(());
    }

    // The print-sheet fallback needs the window on screen so the sheet
    // snapshots a painted page. Every other export stays hidden.
    let show = kind == ExportKind::Pdf && !SILENT_PDF;
    let source = store_job(&app, kind, markdown, vault_root, default_name, path)?;
    ensure_window(&app, show)?;
    emit_to_window(&app, LABEL, "ornata-print", source)?;
    Ok(())
}

/// The print view calls this once its content has rendered (fonts, images and
/// diagrams settled) and hands over the serialized body + page CSS.
#[tauri::command]
pub async fn print_view_ready(
    app: AppHandle,
    window: tauri::WebviewWindow,
    id: u64,
    body_html: String,
    page_css: String,
    headings: Vec<OutlineEntry>,
) -> AppResult<()> {
    let job = take_job_if(&app, id)?;
    match job.kind {
        #[cfg(target_os = "macos")]
        ExportKind::Pdf => {
            let Some(path) = job.path else {
                return Err(AppError::Other("pdf export missing path".into()));
            };
            let app_handle = app.clone();
            let shown = path.display().to_string();
            crate::pdf_export::save_pdf(&window, path, job.default_name, headings, move |result| {
                let _ = match result {
                    Ok(()) => emit_to_window(&app_handle, "main", "ornata-export-done", shown),
                    Err(message) => {
                        emit_to_window(&app_handle, "main", "ornata-export-failed", message)
                    }
                };
            })?;
        }
        #[cfg(not(target_os = "macos"))]
        ExportKind::Pdf => {
            // Show only once the note is in the DOM, then open the system
            // print sheet (the user chooses "Save as PDF"). The sheet may
            // outlive this call, so the window hides itself via `afterprint`.
            let _ = window.show();
            let _ = window.set_focus();
            window.print().map_err(|e| AppError::Other(e.to_string()))?;
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
        "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n<style>\n{css}\n@page {{ margin: 12mm 14mm; }}\nhtml, body, #root {{ height: auto !important; overflow: visible !important; background: #fff !important; }}\nbody {{ margin: 0; background: #fff !important; }}\n.prose-note {{ box-sizing: border-box !important; max-width: 760px; height: auto !important; overflow: visible !important; margin: 0 auto; padding: 12mm 16mm 16mm !important; }}\n</style>\n</head>\n<body class=\"light\">\n<div class=\"prose-note\">{inlined}</div>\n</body>\n</html>"
    )
}

fn inline_asset_images(html: &str, vault_root: &str) -> String {
    let vault = PathBuf::from(vault_root);
    let mut out = String::with_capacity(html.len());
    let mut rest = html;
    let markers = ["asset://localhost/", "http://asset.localhost/"];
    loop {
        let hit = markers
            .iter()
            .filter_map(|m| rest.find(m).map(|pos| (pos, *m)))
            .min_by_key(|(pos, _)| *pos);
        let Some((pos, marker)) = hit else { break };
        // Only rewrite image sources — bare mentions of asset:// in text must
        // not trigger a filesystem read.
        let prefix = &rest[..pos];
        let src_ok = prefix
            .rfind('<')
            .map(|start| {
                let tag = &prefix[start..];
                tag.to_ascii_lowercase().starts_with("<img")
                    && tag.rfind("src=").is_some_and(|s| !tag[s + 4..].contains('<'))
            })
            .unwrap_or(false);
        out.push_str(prefix);
        rest = &rest[pos + marker.len()..];
        let end = rest
            .find(|c: char| c == '"' || c == '\'' || c == ')' || c.is_whitespace())
            .unwrap_or(rest.len());
        let encoded = &rest[..end];
        rest = &rest[end..];
        if !src_ok {
            out.push_str(marker);
            out.push_str(encoded);
            continue;
        }
        let decoded = percent_decode(encoded);
        let abs = PathBuf::from(&decoded);
        let path = if abs.is_absolute() {
            abs
        } else {
            vault.join(&abs)
        };
        let Ok(canonical) = path.canonicalize() else {
            out.push_str(TRANSPARENT_PIXEL);
            continue;
        };
        let Ok(vault_canon) = vault.canonicalize() else {
            out.push_str(TRANSPARENT_PIXEL);
            continue;
        };
        if !canonical.starts_with(&vault_canon) {
            out.push_str(TRANSPARENT_PIXEL);
            continue;
        }
        let mime = match canonical
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
        let bytes = std::fs::read(&canonical).ok();
        let inlined = bytes
            .filter(|bytes| bytes.len() <= MAX_INLINE_BYTES)
            .map(|bytes| {
                format!("data:{mime};base64,{}", crate::assets::encode_base64(&bytes))
            })
            .unwrap_or_else(|| TRANSPARENT_PIXEL.to_string());
        out.push_str(&inlined);
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

/// 1×1 transparent GIF — placeholder for images we can't inline.
const TRANSPARENT_PIXEL: &str =
    "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

/// Per-image inline cap, matching the paste limit.
const MAX_INLINE_BYTES: usize = 20 * 1024 * 1024;

#[derive(Clone, Serialize)]
struct RichTextPayload {
    html: String,
    plain: String,
}


/// Hide the print window — called from its `afterprint` event, since the
/// system print sheet can outlive the `print()` call.
#[tauri::command]
pub fn hide_print_window(app: AppHandle) -> AppResult<()> {
    if let Some(window) = app.get_webview_window(LABEL) {
        let _ = window.hide();
    }
    Ok(())
}
