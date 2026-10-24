//! Tauri side of backups: settings commands, the run itself (which records
//! its outcome and tells the frontend) and the once-a-day scheduler.

use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_dialog::DialogExt;

use crate::backup::{self, BackupRecord};
use crate::commands::AppState;
use crate::config;
use crate::error::{AppError, AppResult};

/// Event the frontend listens to: payload is the [`BackupRecord`].
pub const EVENT: &str = "ornata-backup";
const FIRST_CHECK: Duration = Duration::from_secs(40);
const RECHECK: Duration = Duration::from_secs(30 * 60);

/// Keeps two runs from overlapping and retires stale schedulers.
#[derive(Default)]
pub struct BackupGuard {
    running: AtomicBool,
    generation: AtomicU64,
}

#[derive(Serialize)]
pub struct Suggestion {
    label: String,
    path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    folder: Option<String>,
    suggestions: Vec<Suggestion>,
    last: Option<BackupRecord>,
}

fn vault_name(root: &Path) -> String {
    root.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_else(|| "Vault".into())
}

fn info(app: &AppHandle, root: &Path) -> BackupInfo {
    let cfg = config::load(app);
    let suggestions = app
        .path()
        .home_dir()
        .map(|home| backup::suggestions(&home))
        .unwrap_or_default()
        .into_iter()
        .map(|(label, path)| Suggestion { label, path: path.display().to_string() })
        .collect();
    BackupInfo {
        folder: cfg.backup.folder.clone(),
        suggestions,
        last: cfg.backup.last.get(&root.display().to_string()).cloned(),
    }
}

/// Run one backup for `root` now, record how it went and tell the frontend.
fn perform(app: &AppHandle, root: &Path) -> AppResult<BackupRecord> {
    let guard = app.state::<BackupGuard>();
    if guard.running.swap(true, Ordering::SeqCst) {
        return Err(AppError::Other("a backup is already running".into()));
    }
    let cfg = config::load(app);
    let outcome = match cfg.backup.folder.as_deref() {
        Some(folder) => backup::run(root, &vault_name(root), &PathBuf::from(folder)),
        None => Err(AppError::InvalidInput("choose a backup folder first".into())),
    };
    guard.running.store(false, Ordering::SeqCst);

    let record = match &outcome {
        Ok(record) => record.clone(),
        Err(error) => BackupRecord {
            at_ms: chrono::Local::now().timestamp_millis(),
            ok: false,
            detail: error.to_string(),
            size: 0,
        },
    };
    let mut cfg = config::load(app);
    cfg.backup.last.insert(root.display().to_string(), record.clone());
    let _ = config::save(app, &cfg);
    let _ = app.emit(EVENT, &record);
    outcome
}

#[tauri::command]
pub fn get_backup(app: AppHandle, state: State<'_, AppState>) -> AppResult<BackupInfo> {
    Ok(info(&app, &state.root()?))
}

/// Set (or clear, with `None`) the backup folder.
#[tauri::command]
pub fn set_backup_folder(
    app: AppHandle,
    state: State<'_, AppState>,
    folder: Option<String>,
) -> AppResult<BackupInfo> {
    let root = state.root()?;
    let mut cfg = config::load(&app);
    if let Some(folder) = &folder {
        backup::check_folder(&root, Path::new(folder))?;
    }
    cfg.backup.folder = folder;
    config::save(&app, &cfg)?;
    Ok(info(&app, &root))
}

/// Pick the folder with the system dialog. Async: the blocking dialog must not
/// run on the main thread.
#[tauri::command]
pub async fn choose_backup_folder(
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Option<BackupInfo>> {
    let picked = tauri::async_runtime::spawn_blocking({
        let app = app.clone();
        move || app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| AppError::Other(e.to_string()))?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else { return Ok(None) };
    let root = state.root()?;
    backup::check_folder(&root, &path)?;
    let mut cfg = config::load(&app);
    cfg.backup.folder = Some(path.display().to_string());
    config::save(&app, &cfg)?;
    Ok(Some(info(&app, &root)))
}

#[tauri::command]
pub async fn run_backup_now(app: AppHandle, state: State<'_, AppState>) -> AppResult<BackupInfo> {
    let root = state.root()?;
    let job = { let (app, root) = (app.clone(), root.clone()); move || perform(&app, &root) };
    tauri::async_runtime::spawn_blocking(job)
        .await
        .map_err(|e| AppError::Other(e.to_string()))??;
    Ok(info(&app, &root))
}

#[tauri::command]
pub fn reveal_backup_folder(app: AppHandle) -> AppResult<()> {
    let folder = config::load(&app).backup.folder.ok_or_else(|| AppError::NotFound("backup folder".into()))?;
    tauri_plugin_opener::open_path(folder, None::<&str>).map_err(|e| AppError::Other(e.to_string()))
}

/// Back the vault up when it is due: shortly after it opens, then every half
/// hour while the app runs. Stops when another vault takes over.
pub fn spawn_scheduler(app: AppHandle, root: PathBuf) {
    let generation = app.state::<BackupGuard>().generation.fetch_add(1, Ordering::SeqCst) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(FIRST_CHECK);
        loop {
            let guard = app.state::<BackupGuard>();
            let active = app.state::<AppState>().root().map(|r| r == root).unwrap_or(false);
            if !active || guard.generation.load(Ordering::SeqCst) != generation {
                return;
            }
            let cfg = config::load(&app);
            let last = cfg.backup.last.get(&root.display().to_string());
            if cfg.backup.folder.is_some() && backup::due(last, chrono::Local::now().timestamp_millis()) {
                let _ = perform(&app, &root);
            }
            std::thread::sleep(RECHECK);
        }
    });
}
