//! Per-note snapshots under `.ornata/history/<rel>` (the `.md` extension stays,
//! so `guide.md` and notes inside a `guide/` folder never share a directory).
//!
//! Every vault write funnels through `notes::write_note`, which snapshots the
//! content it is about to overwrite. Ordinary autosaves pin a checkpoint at
//! most once per dedup window and fold later edits in that window into one
//! rolling snapshot. Agent writes and restores force a pinned snapshot, so
//! the state before those mutations stays recoverable.

use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;

use crate::backlinks::strip_md;
use crate::error::{AppError, AppResult};
use crate::vault::DATA_DIR;

/// Snapshots kept per note; older ones are pruned after each write.
const MAX_PER_NOTE: usize = 30;
/// A new pinned checkpoint is written at most this often. Later edits inside
/// the window update one rolling snapshot instead of adding a file.
const DEDUP_WINDOW_MS: i64 = 2 * 60 * 1000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnapshotMeta {
    /// Unix millis; also the snapshot's filename stem.
    pub timestamp: i64,
    /// Snapshot size in bytes.
    pub size: i64,
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn history_dir(root: &Path, rel: &str) -> PathBuf {
    let dir = root.join(DATA_DIR).join("history").join(rel);
    // Snapshots written before the path included `.md`.
    if strip_md(rel) != rel {
        adopt_legacy(
            &root.join(DATA_DIR).join("history").join(strip_md(rel)),
            &dir,
        );
    }
    dir
}

/// Move timestamp files from the extension-less layout into `dir`.
/// Subdirectories stay put (they belong to notes nested under that prefix).
/// Adopted snapshots are pinned so the next autosave cannot overwrite them.
fn adopt_legacy(legacy: &Path, dir: &Path) {
    if legacy == dir || !legacy.is_dir() {
        return;
    }
    let stamps = list_timestamps(legacy);
    if stamps.is_empty() {
        return;
    }
    if let Some(parent) = dir.parent() {
        if fs::create_dir_all(parent).is_err() {
            return;
        }
    }
    if fs::create_dir_all(dir).is_err() {
        return;
    }
    for stamp in stamps {
        let from = legacy.join(stamp.to_string());
        let to = dir.join(stamp.to_string());
        if to.exists() {
            continue;
        }
        if fs::rename(&from, &to).is_ok() {
            let _ = fs::write(dir.join(format!("{stamp}.keep")), "");
        }
    }
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

/// A `.keep` file next to a snapshot marks a checkpoint that later autosaves
/// must not overwrite (window anchor, forced snapshot, or adopted history).
fn is_pinned(dir: &Path, stamp: i64) -> bool {
    dir.join(format!("{stamp}.keep")).is_file()
}

/// Save `current` as a snapshot of `rel` (the content a write is about to
/// replace). Identical content is skipped. A forced write, or the first write
/// after the dedup window, pins a new checkpoint. Further differing edits
/// inside the window update one rolling snapshot so the text just overwritten
/// stays recoverable without a file per autosave.
pub fn snapshot_note(root: &Path, rel: &str, current: &str, forced: bool) -> AppResult<()> {
    if current.is_empty() {
        return Ok(());
    }
    let dir = history_dir(root, rel);
    if let Some(newest) = newest_snapshot(&dir) {
        let path = dir.join(newest.to_string());
        if fs::read_to_string(&path).is_ok_and(|saved| saved == current) {
            return Ok(());
        }
        let within = now_ms() - newest < DEDUP_WINDOW_MS;
        if !forced && within && !is_pinned(&dir, newest) {
            fs::write(path, current)?;
            return Ok(());
        }
        return write_new_snapshot(&dir, current, forced || !within);
    }
    write_new_snapshot(&dir, current, true)
}

fn write_new_snapshot(dir: &Path, content: &str, pin: bool) -> AppResult<()> {
    let dir = ensure_dir(dir)?;
    // Same-millisecond collisions step forward until the name is free.
    let mut stamp = now_ms();
    while dir.join(stamp.to_string()).exists() {
        stamp += 1;
    }
    fs::write(dir.join(stamp.to_string()), content)?;
    if pin {
        fs::write(dir.join(format!("{stamp}.keep")), "")?;
    }
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
        let _ = fs::remove_file(dir.join(format!("{stamp}.keep")));
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
    use crate::notes::{create_folder, create_note, write_note};
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
        assert_eq!(
            read_snapshot(&root, &rel, snapshots[0].timestamp).unwrap(),
            "v2"
        );
        assert_eq!(
            read_snapshot(&root, &rel, snapshots[1].timestamp).unwrap(),
            "v1"
        );
    }

    #[test]
    fn window_keeps_checkpoint_and_rolls_later_edits() {
        let (_dir, root, rel) = setup();
        snapshot_note(&root, &rel, "v1", false).unwrap();
        let anchor = newest_snapshot(&history_dir(&root, &rel)).unwrap();
        snapshot_note(&root, &rel, "v2", false).unwrap();
        let rolling = newest_snapshot(&history_dir(&root, &rel)).unwrap();
        assert_ne!(anchor, rolling);
        snapshot_note(&root, &rel, "v3", false).unwrap();
        let snapshots = list_snapshots(&root, &rel);
        assert_eq!(snapshots.len(), 2);
        assert_eq!(snapshots[0].timestamp, rolling);
        assert_eq!(read_snapshot(&root, &rel, rolling).unwrap(), "v3");
        assert_eq!(read_snapshot(&root, &rel, anchor).unwrap(), "v1");
    }

    #[test]
    fn elapsed_window_starts_a_new_checkpoint() {
        let (_dir, root, rel) = setup();
        snapshot_note(&root, &rel, "v1", false).unwrap();
        let dir = history_dir(&root, &rel);
        let stamp = newest_snapshot(&dir).unwrap();
        let old = now_ms() - DEDUP_WINDOW_MS - 1;
        fs::rename(dir.join(stamp.to_string()), dir.join(old.to_string())).unwrap();
        fs::rename(
            dir.join(format!("{stamp}.keep")),
            dir.join(format!("{old}.keep")),
        )
        .unwrap();
        snapshot_note(&root, &rel, "v2", false).unwrap();
        let snapshots = list_snapshots(&root, &rel);
        assert_eq!(snapshots.len(), 2);
        assert_eq!(
            read_snapshot(&root, &rel, snapshots[0].timestamp).unwrap(),
            "v2"
        );
        assert_eq!(read_snapshot(&root, &rel, old).unwrap(), "v1");
    }

    #[test]
    fn forced_snapshot_is_not_replaced_by_a_later_autosave() {
        let (_dir, root, rel) = setup();
        snapshot_note(&root, &rel, "v1", false).unwrap();
        snapshot_note(&root, &rel, "v2", true).unwrap();
        let forced = newest_snapshot(&history_dir(&root, &rel)).unwrap();
        snapshot_note(&root, &rel, "v3", false).unwrap();
        assert_eq!(read_snapshot(&root, &rel, forced).unwrap(), "v2");
        assert_eq!(list_snapshots(&root, &rel).len(), 3);
    }

    #[test]
    fn legacy_extensionless_history_is_adopted() {
        let (_dir, root, rel) = setup();
        let legacy = root.join(DATA_DIR).join("history").join(strip_md(&rel));
        fs::create_dir_all(legacy.join("child")).unwrap();
        fs::write(legacy.join("1000"), "old").unwrap();
        fs::write(legacy.join("child").join("2000"), "child").unwrap();

        let snapshots = list_snapshots(&root, &rel);
        assert_eq!(snapshots.len(), 1);
        assert_eq!(read_snapshot(&root, &rel, 1000).unwrap(), "old");
        assert!(!legacy.join("1000").exists());
        assert_eq!(
            fs::read_to_string(legacy.join("child").join("2000")).unwrap(),
            "child"
        );
    }

    #[test]
    fn note_and_same_named_folder_keep_separate_history() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let note = create_note(root, "", "guide").unwrap();
        snapshot_note(root, &note, "note-v1", true).unwrap();
        create_folder(root, "", "guide").unwrap();
        let child = create_note(root, "guide", "intro").unwrap();
        snapshot_note(root, &child, "child-v1", true).unwrap();

        let renamed = crate::notes::rename_entry(root, &note, "archive").unwrap();
        let note_snaps = list_snapshots(root, &renamed.next);
        assert_eq!(
            read_snapshot(root, &renamed.next, note_snaps[0].timestamp).unwrap(),
            "note-v1"
        );
        assert_eq!(
            read_snapshot(root, &child, list_snapshots(root, &child)[0].timestamp).unwrap(),
            "child-v1"
        );

        let folder = crate::notes::rename_entry(root, "guide", "handbook").unwrap();
        let child_next = format!("{}/intro.md", folder.next);
        assert_eq!(
            read_snapshot(
                root,
                &child_next,
                list_snapshots(root, &child_next)[0].timestamp
            )
            .unwrap(),
            "child-v1"
        );
        assert_eq!(
            read_snapshot(
                root,
                &renamed.next,
                list_snapshots(root, &renamed.next)[0].timestamp
            )
            .unwrap(),
            "note-v1"
        );
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
