//! What the app shows about the command line / MCP: who is connected, what a
//! vault allows, and installing `ornata` onto the PATH. Thin Tauri wrappers
//! around helpers that are unit-tested here.

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::config::{self, CliAccess};
use crate::error::{AppError, AppResult};

use super::http::{self, Activity, Provider, ServerHandle};
use super::presence::{live_sessions, sessions_dir, Session};
use super::vault_path;

/// The in-app MCP server while it is on.
#[derive(Default)]
pub struct McpServer(Mutex<Option<ServerHandle>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerStatus {
    running: bool,
    port: u16,
    activity: Option<Activity>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpStatus {
    vault_path: Option<String>,
    access: CliAccess,
    sessions: Vec<Session>,
    /// The executable agents should run (`<it> mcp`).
    executable: String,
    /// Where `ornata` is linked on the PATH, when it is.
    installed_at: Option<String>,
    /// The localhost server agents can reach with `--transport http`.
    server: ServerStatus,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOutcome {
    path: String,
    /// False when the link's folder isn't on `$PATH` yet.
    on_path: bool,
}

fn exe() -> AppResult<PathBuf> {
    Ok(std::env::current_exe()?)
}

/// `~/.local/bin/ornata`: no administrator rights needed.
fn link_in(home: &Path) -> PathBuf {
    home.join(".local/bin/ornata")
}

fn link_path() -> AppResult<PathBuf> {
    std::env::var_os("HOME")
        .map(|home| link_in(Path::new(&home)))
        .ok_or_else(|| AppError::Other("HOME is not set".into()))
}

/// True when `link` is a symlink to `target`.
fn points_to(link: &Path, target: &Path) -> bool {
    std::fs::read_link(link).map(|dest| dest == target).unwrap_or(false)
}

fn install_link(link: &Path, target: &Path) -> AppResult<()> {
    if let Some(dir) = link.parent() {
        std::fs::create_dir_all(dir)?;
    }
    match std::fs::symlink_metadata(link) {
        Ok(meta) if meta.file_type().is_symlink() => std::fs::remove_file(link)?,
        Ok(_) => {
            return Err(AppError::InvalidInput(format!(
                "{} already exists and isn't a link; remove it first",
                link.display()
            )))
        }
        Err(_) => {}
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(target, link)?;
    #[cfg(not(unix))]
    return Err(AppError::Other("installing the command line tool is only supported on macOS and Linux".into()));
    Ok(())
}

/// Only removes a link that points at `target`, never someone else's file.
fn remove_link(link: &Path, target: &Path) -> AppResult<()> {
    if points_to(link, target) {
        std::fs::remove_file(link)?;
    }
    Ok(())
}

fn on_path(dir: &Path) -> bool {
    std::env::var_os("PATH").is_some_and(|paths| std::env::split_paths(&paths).any(|p| p == dir))
}

fn provider(app: &AppHandle) -> Provider {
    let app = app.clone();
    // Settings are re-read on every request, so access changes apply at once.
    Arc::new(move || vault_path::target_from(&config::load(&app)))
}

fn set_enabled(app: &AppHandle, enabled: bool, port: Option<u16>) -> AppResult<()> {
    let mut config = config::load(app);
    config.mcp_server.enabled = enabled;
    if let Some(port) = port {
        config.mcp_server.port = port;
    }
    config::save(app, &config)
}

/// Start the server if it was left on. Best-effort: a taken port just means
/// it stays off until the user switches it on again.
pub fn autostart(app: &AppHandle) {
    let config = config::load(app);
    if !config.mcp_server.enabled {
        return;
    }
    if let Ok(handle) = http::start(config.mcp_server.port, provider(app)) {
        let _ = set_enabled(app, true, Some(handle.port()));
        if let Ok(mut slot) = app.state::<McpServer>().0.lock() {
            *slot = Some(handle);
        }
    }
}

#[tauri::command]
pub fn mcp_server_start(app: AppHandle, server: State<'_, McpServer>) -> AppResult<()> {
    let mut slot = server.0.lock().map_err(|_| AppError::Other("server lock poisoned".into()))?;
    if slot.is_some() {
        return Ok(());
    }
    let handle = http::start(config::load(&app).mcp_server.port, provider(&app))?;
    set_enabled(&app, true, Some(handle.port()))?;
    *slot = Some(handle);
    Ok(())
}

#[tauri::command]
pub fn mcp_server_stop(app: AppHandle, server: State<'_, McpServer>) -> AppResult<()> {
    let handle = server.0.lock().map_err(|_| AppError::Other("server lock poisoned".into()))?.take();
    if let Some(handle) = handle {
        handle.stop();
    }
    set_enabled(&app, false, None)
}

#[tauri::command]
pub fn mcp_status(app: AppHandle, server: State<'_, McpServer>) -> AppResult<McpStatus> {
    let config = config::load(&app);
    let vault_path = config.vault_path.clone();
    let access = vault_path
        .as_ref()
        .and_then(|v| config.cli_access.get(v).copied())
        .unwrap_or_default();
    let dir = app.path().app_config_dir().map_err(|e| AppError::Other(e.to_string()))?;
    let sessions = vault_path.as_deref().map(|v| live_sessions(&sessions_dir(&dir), v)).unwrap_or_default();
    let exe = exe()?;
    let installed_at = link_path().ok().filter(|link| points_to(link, &exe)).map(|p| p.display().to_string());
    let (running, port, activity) = match server.0.lock().ok().as_deref() {
        Some(Some(handle)) => (true, handle.port(), Some(handle.activity())),
        _ => (false, config.mcp_server.port, None),
    };
    Ok(McpStatus {
        vault_path,
        access,
        sessions,
        executable: exe.display().to_string(),
        installed_at,
        server: ServerStatus { running, port, activity },
    })
}

#[tauri::command]
pub fn mcp_set_access(app: AppHandle, access: CliAccess) -> AppResult<()> {
    let mut config = config::load(&app);
    let vault = config
        .vault_path
        .clone()
        .ok_or_else(|| AppError::NotFound("no vault is open".into()))?;
    config.cli_access.insert(vault, access);
    config::save(&app, &config)
}

#[tauri::command]
pub fn mcp_install_cli() -> AppResult<InstallOutcome> {
    let link = link_path()?;
    install_link(&link, &exe()?)?;
    let on_path = link.parent().is_some_and(on_path);
    Ok(InstallOutcome { path: link.display().to_string(), on_path })
}

#[tauri::command]
pub fn mcp_uninstall_cli() -> AppResult<()> {
    remove_link(&link_path()?, &exe()?)
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn installs_replaces_and_removes_only_its_own_link() {
        let home = tempdir().unwrap();
        let target = home.path().join("Ornata");
        std::fs::write(&target, "").unwrap();
        let link = link_in(home.path());

        install_link(&link, &target).unwrap();
        assert!(points_to(&link, &target));
        // installing again (e.g. after the app moved) just re-points it
        let moved = home.path().join("Ornata2");
        std::fs::write(&moved, "").unwrap();
        install_link(&link, &moved).unwrap();
        assert!(points_to(&link, &moved) && !points_to(&link, &target));

        remove_link(&link, &target).unwrap(); // not ours any more: left alone
        assert!(link.exists());
        remove_link(&link, &moved).unwrap();
        assert!(std::fs::symlink_metadata(&link).is_err());
    }

    #[test]
    fn never_overwrites_a_real_file() {
        let home = tempdir().unwrap();
        let link = link_in(home.path());
        std::fs::create_dir_all(link.parent().unwrap()).unwrap();
        std::fs::write(&link, "my own script").unwrap();
        assert!(install_link(&link, Path::new("/x")).is_err());
        assert_eq!(std::fs::read_to_string(&link).unwrap(), "my own script");
    }
}
