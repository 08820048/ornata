use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{mpsc, Mutex};
use std::time::{Duration, SystemTime};

use notify::{RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter, Manager};

use crate::commands::AppState;

const DEBOUNCE: Duration = Duration::from_millis(400);
/// How often the loop checks whether this vault is still the active one.
const POLL: Duration = Duration::from_secs(1);

/// Notes the app itself just saved, with the size and mtime it left them at.
/// The watcher drops events for those, so an autosave doesn't bounce back as
/// "the vault changed" and set off a tree re-scan plus vault-wide backlink /
/// graph rebuilds roughly once a second while typing.
#[derive(Default)]
pub struct SelfWrites(Mutex<HashMap<PathBuf, (u64, Option<SystemTime>)>>);

/// Stamp of a file as (size, mtime), or `None` when it can't be read.
fn stamp(path: &Path) -> Option<(u64, Option<SystemTime>)> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()))
}

fn key(path: &Path) -> PathBuf {
    path.canonicalize().unwrap_or_else(|_| path.to_path_buf())
}

impl SelfWrites {
    /// Remember `path` as just written by the app.
    pub fn record(&self, path: &Path) {
        let Some(now) = stamp(path) else { return };
        if let Ok(mut map) = self.0.lock() {
            // Bounded: anything older than the last few hundred saves is moot.
            if map.len() > 512 {
                map.clear();
            }
            map.insert(key(path), now);
        }
    }

    /// `true` when `path` still looks exactly as the app last left it.
    fn is_own(&self, path: &Path) -> bool {
        let Ok(map) = self.0.lock() else { return false };
        map.get(&key(path))
            .is_some_and(|saved| stamp(path).as_ref() == Some(saved))
    }
}

/// Does this event concern the notes tree, other than the app's own saves?
/// App data under `.ornata/` (history snapshots, assets) never does.
fn is_relevant(app: &AppHandle, notes: &[PathBuf], paths: &[PathBuf]) -> bool {
    let own = app.state::<SelfWrites>();
    paths.iter().any(|path| {
        // Raw and canonical forms both count: a deleted file can't be
        // canonicalised, and the vault may sit behind a symlink.
        let canonical = key(path);
        let inside = notes
            .iter()
            .any(|dir| path.starts_with(dir) || canonical.starts_with(dir));
        inside && !own.is_own(path)
    })
}

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
    let (tx, rx) = mpsc::channel::<Vec<PathBuf>>();
    let notes_dir = crate::vault::notes_root(&root);
    let notes = [key(&notes_dir), notes_dir];
    let mut watcher = match notify::recommended_watcher(
        move |result: Result<notify::Event, notify::Error>| {
            if let Ok(event) = result {
                let _ = tx.send(event.paths);
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
            Ok(mut paths) => {
                // Drain the rest of the burst, then emit a single refresh —
                // judged after the burst, so the app's own save is on record.
                // The event kind doesn't matter: the frontend re-scans the
                // tree wholesale.
                while let Ok(more) = rx.recv_timeout(DEBOUNCE) {
                    paths.extend(more);
                }
                if !is_active(&app, &root) {
                    return;
                }
                if is_relevant(&app, &notes, &paths) {
                    let _ = app.emit("ornata-vault-changed", ());
                }
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


#[cfg(test)]
mod tests {
    use super::SelfWrites;
    use std::fs;

    #[test]
    fn own_writes_are_recognised_until_the_file_changes_again() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.md");
        fs::write(&path, "one").unwrap();
        let own = SelfWrites::default();
        assert!(!own.is_own(&path));
        own.record(&path);
        assert!(own.is_own(&path));
        fs::write(&path, "changed elsewhere").unwrap();
        assert!(!own.is_own(&path));
    }
}
