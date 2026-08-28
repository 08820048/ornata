use std::path::{Path, PathBuf};
use std::sync::mpsc;
use std::time::Duration;

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;

const DEBOUNCE: Duration = Duration::from_millis(400);
/// How often the loop checks whether this vault is still the active one.
const POLL: Duration = Duration::from_secs(1);

/// Watch a vault folder and ask the frontend to re-scan the tree when
/// something changes on disk (external editors, iCloud sync, git). Events
/// are debounced because one save can fire many notifications.
pub fn spawn(app: AppHandle, root: PathBuf) {
    std::thread::spawn(move || watch(app, root));
}

/// `true` when `root` is still the vault the app has activated.
fn is_active(app: &AppHandle, root: &Path) -> bool {
    app.state::<AppState>()
        .root()
        .map(|active| active == root)
        .unwrap_or(false)
}

fn watch(app: AppHandle, root: PathBuf) {
    let (tx, rx) = mpsc::channel::<()>();
    let mut watcher = match notify::recommended_watcher(
        move |result: Result<notify::Event, notify::Error>| {
            // The event kind doesn't matter — the frontend re-scans the tree
            // wholesale, so any filesystem blip maps to one refresh request.
            if result.is_ok() {
                let _ = tx.send(());
            }
        },
    ) {
        Ok(watcher) => watcher,
        Err(_) => return,
    };
    if watcher.watch(&root, RecursiveMode::Recursive).is_err() {
        return;
    }

    // Stay alive while this root remains the active vault. The timeout on
    // recv is what lets the loop notice a vault switch and exit.
    loop {
        match rx.recv_timeout(POLL) {
            Ok(()) => {
                // Drain the rest of the burst, then emit a single refresh.
                while rx.recv_timeout(DEBOUNCE).is_ok() {}
                if !is_active(&app, &root) {
                    return;
                }
                let _ = app.emit("ornata-vault-changed", ());
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => return,
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if !is_active(&app, &root) {
                    return;
                }
            }
        }
    }
}

