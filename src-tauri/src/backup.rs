//! Automatic vault backups: a dated zip of the notes (and the app's own data,
//! minus history snapshots) dropped into a folder the user picked — typically
//! inside iCloud Drive or Dropbox, which makes it an off-machine copy without
//! any service of ours. Restoring is just unzipping.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use chrono::{Datelike, Local, NaiveDateTime};
use serde::{Deserialize, Serialize};
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::error::{AppError, AppResult};

/// A new backup is due once the last good one is this old.
pub const INTERVAL_MS: i64 = 24 * 60 * 60 * 1000;
const STAMP: &str = "%Y-%m-%d-%H%M";

/// Where backups go, and how the last run per vault went.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupConfig {
    #[serde(default)]
    pub folder: Option<String>,
    /// Keyed by vault root.
    #[serde(default)]
    pub last: HashMap<String, BackupRecord>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupRecord {
    pub at_ms: i64,
    pub ok: bool,
    /// The zip's file name, or the error message.
    pub detail: String,
    pub size: u64,
}

/// `true` when `last` is missing, failed, or older than a day.
pub fn due(last: Option<&BackupRecord>, now_ms: i64) -> bool {
    match last {
        Some(record) if record.ok => now_ms - record.at_ms >= INTERVAL_MS,
        _ => true,
    }
}

/// Cloud folders worth offering in one click, when they exist.
pub fn suggestions(home: &Path) -> Vec<(String, PathBuf)> {
    let mut found = Vec::new();
    let icloud = [
        home.join("Library/Mobile Documents/com~apple~CloudDocs"),
        home.join("iCloudDrive"),
    ];
    if let Some(path) = icloud.into_iter().find(|p| p.is_dir()) {
        found.push(("iCloud Drive".to_string(), path.join("Ornata Backups")));
    }
    let mut dropbox = vec![home.join("Dropbox")];
    if let Ok(entries) = fs::read_dir(home.join("Library/CloudStorage")) {
        dropbox.extend(entries.flatten().map(|e| e.path()).filter(|p| {
            p.file_name().is_some_and(|n| n.to_string_lossy().starts_with("Dropbox"))
        }));
    }
    if let Some(path) = dropbox.into_iter().find(|p| p.is_dir()) {
        found.push(("Dropbox".to_string(), path.join("Ornata Backups")));
    }
    found
}

/// A backup folder must be usable and must not sit inside the vault (the
/// backup would then contain its own earlier backups).
pub fn check_folder(root: &Path, folder: &Path) -> AppResult<()> {
    fs::create_dir_all(folder)
        .map_err(|e| AppError::Other(format!("can't use the backup folder: {e}")))?;
    let probe = folder.join(".ornata-write-test");
    File::create(&probe)
        .and_then(|mut f| f.write_all(b"ok"))
        .map_err(|e| AppError::Other(format!("the backup folder isn't writable: {e}")))?;
    let _ = fs::remove_file(probe);
    let inside = match (dunce::canonicalize(root), dunce::canonicalize(folder)) {
        (Ok(root), Ok(folder)) => folder.starts_with(root),
        _ => false,
    };
    if inside {
        return Err(AppError::InvalidInput(
            "the backup folder can't be inside the vault".to_string(),
        ));
    }
    Ok(())
}

/// Files that make up a backup: everything under `notes/` and `.ornata/`
/// except history snapshots, symlinks and `.DS_Store`.
fn collect(root: &Path) -> Vec<(PathBuf, String)> {
    fn walk(dir: &Path, rel: &str, out: &mut Vec<(PathBuf, String)>) {
        let Ok(entries) = fs::read_dir(dir) else { return };
        let mut entries: Vec<_> = entries.flatten().collect();
        entries.sort_by_key(|e| e.file_name());
        for entry in entries {
            let name = entry.file_name().to_string_lossy().to_string();
            let Ok(meta) = fs::symlink_metadata(entry.path()) else { continue };
            if meta.file_type().is_symlink() || name == ".DS_Store" {
                continue;
            }
            let child = format!("{rel}/{name}");
            if meta.is_dir() {
                if child == ".ornata/history" {
                    continue;
                }
                walk(&entry.path(), &child, out);
            } else {
                out.push((entry.path(), child));
            }
        }
    }
    let mut files = Vec::new();
    walk(&root.join("notes"), "notes", &mut files);
    walk(&root.join(".ornata"), ".ornata", &mut files);
    files
}

fn file_prefix(vault_name: &str) -> String {
    crate::util::sanitize_name(vault_name)
}

/// Write `<Vault>-<stamp>.zip` into `folder`, then thin out old ones.
pub fn run(root: &Path, vault_name: &str, folder: &Path) -> AppResult<BackupRecord> {
    check_folder(root, folder)?;
    let now = Local::now();
    let prefix = file_prefix(vault_name);
    let name = format!("{prefix}-{}.zip", now.format(STAMP));
    let target = folder.join(&name);
    let part = folder.join(format!("{name}.part"));

    let result = (|| -> AppResult<u64> {
        let mut zip = ZipWriter::new(File::create(&part)?);
        let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (path, entry) in collect(root) {
            // A note can vanish between listing and reading; skip it.
            let Ok(mut file) = File::open(&path) else { continue };
            zip.start_file(entry, options).map_err(|e| AppError::Other(e.to_string()))?;
            io::copy(&mut file, &mut zip)?;
        }
        zip.finish().map_err(|e| AppError::Other(e.to_string()))?;
        fs::rename(&part, &target)?;
        Ok(fs::metadata(&target)?.len())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&part);
    }
    let size = result?;
    let _ = prune(folder, &prefix, now.naive_local());
    Ok(BackupRecord { at_ms: now.timestamp_millis(), ok: true, detail: name, size })
}

/// Which of `backups` (name, local time) to delete: the newest of each of the
/// last 7 days, the last 4 weeks and the last 6 months stay; the newest overall
/// always stays.
pub fn plan_retention(
    backups: &[(String, NaiveDateTime)],
    now: NaiveDateTime,
) -> Vec<String> {
    let today = now.date();
    let mut keep: Vec<&str> = Vec::new();
    let mut sorted: Vec<&(String, NaiveDateTime)> = backups.iter().collect();
    sorted.sort_by_key(|entry| std::cmp::Reverse(entry.1)); // newest first
    if let Some(first) = sorted.first() {
        keep.push(&first.0);
    }
    let mut days = BTreeMap::new();
    let mut weeks = BTreeMap::new();
    let mut months = BTreeMap::new();
    for (name, at) in &sorted {
        let date = at.date();
        let age = (today - date).num_days();
        if age < 0 {
            continue;
        }
        if age < 7 {
            days.entry(date).or_insert(name.as_str());
        }
        if age < 28 {
            let week = date.iso_week();
            weeks.entry((week.year(), week.week())).or_insert(name.as_str());
        }
        let month_gap = (today.year() - date.year()) * 12 + today.month() as i32 - date.month() as i32;
        if month_gap < 6 {
            months.entry((date.year(), date.month())).or_insert(name.as_str());
        }
    }
    keep.extend(days.values());
    keep.extend(weeks.values());
    keep.extend(months.values());
    backups
        .iter()
        .filter(|(name, _)| !keep.contains(&name.as_str()))
        .map(|(name, _)| name.clone())
        .collect()
}

/// Delete expired backups of this vault — only files whose name is exactly
/// `<prefix>-<stamp>.zip`, never anything else in the folder.
fn prune(folder: &Path, prefix: &str, now: NaiveDateTime) -> io::Result<()> {
    let mut found = Vec::new();
    for entry in fs::read_dir(folder)?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let Some(stamp) = name
            .strip_prefix(&format!("{prefix}-"))
            .and_then(|rest| rest.strip_suffix(".zip"))
        else {
            continue;
        };
        if let Ok(at) = NaiveDateTime::parse_from_str(stamp, STAMP) {
            found.push((name, at));
        }
    }
    for name in plan_retention(&found, now) {
        let _ = fs::remove_file(folder.join(name));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Duration, NaiveDate};

    fn at(y: i32, m: u32, d: u32, h: u32) -> NaiveDateTime {
        NaiveDate::from_ymd_opt(y, m, d).unwrap().and_hms_opt(h, 0, 0).unwrap()
    }

    fn make_vault() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path();
        fs::create_dir_all(root.join("notes/sub")).unwrap();
        fs::create_dir_all(root.join(".ornata/assets")).unwrap();
        fs::create_dir_all(root.join(".ornata/history/a")).unwrap();
        fs::write(root.join("notes/a.md"), "# A").unwrap();
        fs::write(root.join("notes/sub/b.md"), "# B").unwrap();
        fs::write(root.join("notes/.DS_Store"), "x").unwrap();
        fs::write(root.join(".ornata/assets/p.png"), "png").unwrap();
        fs::write(root.join(".ornata/history/a/1.md"), "old").unwrap();
        dir
    }

    #[test]
    fn a_backup_holds_notes_and_assets_but_not_history() {
        let vault = make_vault();
        let out = tempfile::tempdir().unwrap();
        let record = run(vault.path(), "My Vault", out.path()).unwrap();
        assert!(record.ok && record.detail.starts_with("My Vault-") && record.detail.ends_with(".zip"));
        let mut zip = zip::ZipArchive::new(File::open(out.path().join(&record.detail)).unwrap()).unwrap();
        let mut names: Vec<String> = (0..zip.len()).map(|i| zip.by_index(i).unwrap().name().unwrap().to_string()).collect();
        names.sort();
        assert_eq!(names, vec![".ornata/assets/p.png", "notes/a.md", "notes/sub/b.md"]);
        assert!(!out.path().join(format!("{}.part", record.detail)).exists());
    }

    #[test]
    fn the_folder_cannot_be_inside_the_vault() {
        let vault = make_vault();
        let err = check_folder(vault.path(), &vault.path().join("notes/backups")).unwrap_err();
        assert!(err.to_string().contains("inside the vault"));
        assert!(check_folder(vault.path(), tempfile::tempdir().unwrap().path()).is_ok());
    }

    #[test]
    fn due_after_a_day_or_a_failure() {
        let ok = |ms| BackupRecord { at_ms: ms, ok: true, detail: String::new(), size: 0 };
        assert!(due(None, 0));
        assert!(!due(Some(&ok(1_000)), 1_000 + INTERVAL_MS - 1));
        assert!(due(Some(&ok(1_000)), 1_000 + INTERVAL_MS));
        assert!(due(Some(&BackupRecord { ok: false, ..ok(1_000) }), 2_000));
    }

    #[test]
    fn retention_keeps_daily_weekly_monthly_and_the_newest() {
        let now = at(2026, 10, 24, 12);
        let mut list = Vec::new();
        // Two backups a day (08:00, 11:00) for the last 10 days.
        for back in 0..10 {
            let day = now - Duration::days(back);
            for hour in [8, 11] {
                let t = day.date().and_hms_opt(hour, 0, 0).unwrap();
                list.push((format!("V-{}.zip", t.format(STAMP)), t));
            }
        }
        // And one on the 15th of every month from Oct 2025 to Sep 2026.
        for (year, month) in (10..=12).map(|m| (2025, m)).chain((1..=9).map(|m| (2026, m))) {
            let t = at(year, month, 15, 9);
            list.push((format!("V-{}.zip", t.format(STAMP)), t));
        }
        let gone = plan_retention(&list, now);
        let kept: Vec<_> = list.iter().filter(|(n, _)| !gone.contains(n)).collect();
        // The 7 newest days keep exactly their later backup.
        for back in 0..7 {
            let day = (now - Duration::days(back)).date();
            let held: Vec<_> = kept.iter().filter(|(_, t)| t.date() == day).collect();
            assert_eq!(held.len(), 1, "day {day}");
            assert_eq!(held[0].1.format("%H").to_string(), "11");
        }
        // Within six months a monthly stays; older ones go.
        assert!(kept.iter().any(|(n, _)| n.contains("2026-05-15")));
        assert!(gone.iter().any(|n| n.contains("2026-03-15")));
        assert!(gone.iter().any(|n| n.contains("2025-10-15")));
        assert!(!kept.is_empty() && kept.len() < list.len());
    }

    #[test]
    fn prune_only_touches_its_own_files() {
        let out = tempfile::tempdir().unwrap();
        let old = at(2020, 1, 1, 9);
        let mine = format!("V-{}.zip", old.format(STAMP));
        for name in [&mine, "V-notes.txt", "Other-2020-01-01-0900.zip", "readme.md"] {
            fs::write(out.path().join(name), "x").unwrap();
        }
        let fresh = at(2026, 10, 24, 9);
        fs::write(out.path().join(format!("V-{}.zip", fresh.format(STAMP))), "x").unwrap();
        prune(out.path(), "V", at(2026, 10, 24, 12)).unwrap();
        assert!(!out.path().join(&mine).exists());
        for keep in ["V-notes.txt", "Other-2020-01-01-0900.zip", "readme.md"] {
            assert!(out.path().join(keep).exists(), "{keep}");
        }
    }
}
