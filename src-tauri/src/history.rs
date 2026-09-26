//! Per-note snapshots under `.ornata/history/`.
//!
//! Every vault write funnels through `notes::write_note`, which snapshots the
//! content it is about to overwrite. Ordinary autosaves snapshot at most once
//! per dedup window; agent writes and restores force a snapshot, so the state
//! before any mutation that could lose work is always recoverable.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::backlinks::strip_md;
use crate::error::{AppError, AppResult};
use crate::vault::DATA_DIR;

/// Snapshots kept per note; older ones are pruned after each write.
const MAX_PER_NOTE: usize = 30;
/// Ordinary (non-forced) snapshots of the same note land at most this often.
const DEDUP_WINDOW_MS: i64 = 2 * 60 * 1000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    /// Unix millis; also the snapshot's filename stem.
    pub timestamp: i64,
    /// Snapshot size in bytes.
    pub size: i64,
}

fn history_dir(root: &Path, rel: &str) -> PathBuf {
    root.join(DATA_DIR).join("history").join(strip_md(rel))
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

/// Newest snapshot timestamp in a note's history dir, if any.
fn newest_snapshot(dir: &Path) -> Option<i64> {
    list_timestamps(dir).into_iter().max()
}

fn list_timestamps(dir: &Path) -> Vec<i64> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut stamps: Vec<i64> = entries
        .flatten()
        .filter_map(|entry| entry.file_name().to_string_lossy().parse::<i64>().ok())
        .collect();
    stamps.sort_unstable();
    stamps
}

/// Save `current` as a snapshot of `rel` (the content a write is about to
/// replace). Forced snapshots bypass the dedup window but still skip when the
/// newest snapshot is byte-identical.
pub fn snapshot_note(root: &Path, rel: &str, current: &str, forced: bool) -> AppResult<()> {
    if current.is_empty() {
        return Ok(());
    }
    let dir = history_dir(root, rel);
    let newest = newest_snapshot(&dir);
    if let Some(newest) = newest {
        if forced {
            let stamp = newest.to_string();
            if fs::read_to_string(dir.join(&stamp)).is_ok_and(|saved| saved == current) {
                return Ok(());
            }
        } else if now_ms() - newest < DEDUP_WINDOW_MS {
            return Ok(());
        }
    }

    let dir = ensure_dir(&dir)?;
    // Same-millisecond collisions (a forced snapshot right after a windowed
    // one) step forward until the name is free.
    let mut stamp = now_ms();
    while dir.join(stamp.to_string()).exists() {
        stamp += 1;
    }
    fs::write(dir.join(stamp.to_string()), current)?;
    prune(&dir, MAX_PER_NOTE);
    Ok(())
}

fn ensure_dir(dir: &Path) -> AppResult<PathBuf> {
    fs::create_dir_all(dir).map_err(|e| AppError::Other(format!("history: {e}")))?;
    Ok(dir.to_path_buf())
}

fn prune(dir: &Path, keep: usize) {
    let stamps = list_timestamps(dir);
    let cut = stamps.len().saturating_sub(keep);
    for stamp in stamps.into_iter().take(cut) {
        let _ = fs::remove_file(dir.join(stamp.to_string()));
    }
}

/// Snapshots for `rel`, newest first.
pub fn list_snapshots(root: &Path, rel: &str) -> Vec<SnapshotMeta> {
    let dir = history_dir(root, rel);
    let mut metas: Vec<SnapshotMeta> = list_timestamps(&dir)
        .into_iter()
        .rev()
        .filter_map(|timestamp| {
            let size = fs::metadata(dir.join(timestamp.to_string())).ok()?.len() as i64;
            Some(SnapshotMeta { timestamp, size })
        })
        .collect();
    metas.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    metas
}

/// Read one snapshot by timestamp.
pub fn read_snapshot(root: &Path, rel: &str, timestamp: i64) -> AppResult<String> {
    let path = history_dir(root, rel).join(timestamp.to_string());
    if !path.is_file() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    Ok(fs::read_to_string(path)?)
}

/// Move a note's snapshots along with a rename/move. Orphans are fine when
/// the destination already exists — they are simply left behind.
pub fn migrate(root: &Path, old_rel: &str, new_rel: &str) {
    let from = history_dir(root, old_rel);
    let to = history_dir(root, new_rel);
    if !from.is_dir() || to.exists() {
        return;
    }
    if let Some(parent) = to.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    let _ = fs::rename(from, to);
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    fn setup() -> (tempfile::TempDir, std::path::PathBuf, String) {
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();
        ensure_layout(&root).unwrap();
        let rel = create_note(&root, "", "Note").unwrap();
        (dir, root, rel)
    }

    #[test]
    fn forced_snapshots_land_and_skip_identical_content() {
        let (_dir, root, rel) = setup();
        write_note(&root, &rel, "v1").unwrap();
        snapshot_note(&root, &rel, "v1", true).unwrap();
        snapshot_note(&root, &rel, "v1", true).unwrap(); // identical → skipped
        assert_eq!(list_snapshots(&root, &rel).len(), 1);
        snapshot_note(&root, &rel, "v2", true).unwrap();
        let snapshots = list_snapshots(&root, &rel);
        assert_eq!(snapshots.len(), 2);
        assert_eq!(read_snapshot(&root, &rel, snapshots[0].timestamp).unwrap(), "v2");
        assert_eq!(read_snapshot(&root, &rel, snapshots[1].timestamp).unwrap(), "v1");
    }

    #[test]
    fn windowed_snapshots_dedup_within_the_window() {
        let (_dir, root, rel) = setup();
        // write_note already snapshotted the (empty → "v1") transition's
        // overwritten content; a windowed follow-up inside the window skips.
        write_note(&root, &rel, "v1").unwrap();
        snapshot_note(&root, &rel, "v1", false).unwrap();
        snapshot_note(&root, &rel, "v2", false).unwrap(); // inside window → skipped
        assert_eq!(list_snapshots(&root, &rel).len(), 1);
        // Simulate the window having elapsed for the newest snapshot.
        let dir = history_dir(&root, &rel);
        let newest = newest_snapshot(&dir).unwrap();
        let old = now_ms() - DEDUP_WINDOW_MS - 1;
        fs::rename(dir.join(newest.to_string()), dir.join(old.to_string())).unwrap();
        snapshot_note(&root, &rel, "v2", false).unwrap();
        assert_eq!(list_snapshots(&root, &rel).len(), 2);
    }

    #[test]
    fn prune_keeps_only_the_newest_max() {
        let (_dir, root, rel) = setup();
        for i in 0..(MAX_PER_NOTE + 5) {
            snapshot_note(&root, &rel, &format!("v{i}"), true).unwrap();
        }
        let snapshots = list_snapshots(&root, &rel);
        assert_eq!(snapshots.len(), MAX_PER_NOTE);
        // Newest survives, oldest are gone.
        assert_eq!(
            read_snapshot(&root, &rel, snapshots[0].timestamp).unwrap(),
            format!("v{}", MAX_PER_NOTE + 4)
        );
    }

    #[test]
    fn empty_content_is_never_snapshotted() {
        let (_dir, root, rel) = setup();
        snapshot_note(&root, &rel, "", true).unwrap();
        assert_eq!(list_snapshots(&root, &rel).len(), 0);
    }

    #[test]
    fn migrate_moves_snapshots_with_the_note() {
        let (_dir, root, rel) = setup();
        snapshot_note(&root, &rel, "v1", true).unwrap();
        migrate(&root, &rel, "projects/Note.md");
        let snapshots = list_snapshots(&root, "projects/Note.md");
        assert_eq!(snapshots.len(), 1);
        assert!(list_snapshots(&root, &rel).is_empty());
    }

    #[test]
    fn migrate_never_overwrites_an_existing_destination() {
        let (_dir, root, rel) = setup();
        snapshot_note(&root, &rel, "v1", true).unwrap();
        let other = create_note(&root, "", "Other").unwrap();
        snapshot_note(&root, &other, "other", true).unwrap();
        // Both notes basename-collide in the history layout ("Note" vs
        // "Other") — no; instead simulate a move onto an existing dir.
        std::fs::create_dir_all(history_dir(&root, "x.md")).unwrap();
        migrate(&root, &rel, "x.md");
        assert!(history_dir(&root, &rel).is_dir());
    }

    #[test]
    fn unknown_timestamps_are_not_found() {
        let (_dir, root, rel) = setup();
        assert!(read_snapshot(&root, &rel, 1).is_err());
    }
}
