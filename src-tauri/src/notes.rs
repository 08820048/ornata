use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::util::sanitize_name;
use crate::vault::{notes_root, rel_of, resolve_rel};

const WELCOME: &str = r#"# Welcome to Ornata

A fast, local-first place to write. Every note here is a plain `.md` file in the
folder you picked — open it in Finder, sync it with iCloud, version it with git.
Delete this note whenever you like.

## Try these

- [ ] Press **⌘K** to jump to any note or run a command
- [ ] Press **⌘N** to create a new note
- [ ] Type `[[` to link to another note
- [ ] Press **⌘⇧D** to toggle light / dark
- [ ] Drag notes and folders in the sidebar to organize

## Markdown just works

**Bold**, *italic*, `inline code`, lists, quotes, and fenced code:

```ts
const notes = "yours, forever";
```

> Your words stay on your disk. No account, no cloud.
"#;

/// Write a starter `notes/Welcome.md` if it doesn't already exist. Used on the
/// first launch of a brand-new vault so it isn't an empty screen.
pub fn seed_welcome(root: &Path) -> AppResult<()> {
    let path = notes_root(root).join("Welcome.md");
    if !path.exists() {
        fs::write(path, WELCOME)?;
    }
    Ok(())
}

pub fn read_note(root: &Path, rel: &str) -> AppResult<String> {
    let path = resolve_rel(root, rel)?;
    if !path.is_file() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    Ok(fs::read_to_string(path)?)
}

pub fn write_note(root: &Path, rel: &str, content: &str) -> AppResult<()> {
    let path = resolve_rel(root, rel)?;
    if !path.is_file() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    fs::write(path, content)?;
    Ok(())
}

/// Pick a path that does not exist yet by suffixing " 2", " 3", …
fn available_path(dir: &Path, stem: &str, ext: Option<&str>) -> PathBuf {
    let make = |name: &str| match ext {
        Some(ext) => dir.join(format!("{name}.{ext}")),
        None => dir.join(name),
    };
    let mut candidate = make(stem);
    let mut counter = 2;
    while candidate.exists() {
        candidate = make(&format!("{stem} {counter}"));
        counter += 1;
    }
    candidate
}

/// Create an empty note inside `dir_rel` ("" = notes root). Returns its rel path.
pub fn create_note(root: &Path, dir_rel: &str, title: &str) -> AppResult<String> {
    let dir = resolve_rel(root, dir_rel)?;
    if !dir.is_dir() {
        return Err(AppError::NotFound(dir_rel.to_string()));
    }
    let path = available_path(&dir, &sanitize_name(title), Some("md"));
    fs::write(&path, "")?;
    rel_of(root, &path)
}

/// Create a folder inside `dir_rel`. Returns its rel path.
pub fn create_folder(root: &Path, dir_rel: &str, name: &str) -> AppResult<String> {
    let dir = resolve_rel(root, dir_rel)?;
    if !dir.is_dir() {
        return Err(AppError::NotFound(dir_rel.to_string()));
    }
    let path = available_path(&dir, &sanitize_name(name), None);
    fs::create_dir(&path)?;
    rel_of(root, &path)
}

/// Rename a note or folder in place and repoint links that referenced it.
/// Returns the new rel path plus the link rewrites that landed on disk.
pub fn rename_entry(root: &Path, rel: &str, new_name: &str) -> AppResult<RenameOutcome> {
    let path = resolve_rel(root, rel)?;
    if !path.exists() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    let dir = path
        .parent()
        .ok_or_else(|| AppError::InvalidPath(rel.to_string()))?
        .to_path_buf();
    let name = sanitize_name(new_name);
    let target = if path.is_dir() {
        available_path(&dir, &name, None)
    } else {
        available_path(&dir, &name, Some("md"))
    };
    fs::rename(&path, &target)?;
    finish_move(root, rel, &target)
}

/// Move a note or folder into `target_dir_rel` and repoint links that
/// referenced it.
pub fn move_entry(root: &Path, rel: &str, target_dir_rel: &str) -> AppResult<RenameOutcome> {
    let path = resolve_rel(root, rel)?;
    if !path.exists() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    let target_dir = resolve_rel(root, target_dir_rel)?;
    if !target_dir.is_dir() {
        return Err(AppError::NotFound(target_dir_rel.to_string()));
    }
    // Refuse moving a folder into itself or its own subtree.
    if path.is_dir() && target_dir.starts_with(&path) {
        return Err(AppError::InvalidInput(
            "cannot move a folder into itself".to_string(),
        ));
    }
    if target_dir == path.parent().unwrap_or(Path::new("")) {
        return Ok(RenameOutcome {
            next: rel_of(root, &path)?,
            rewrites: Vec::new(),
            files: Vec::new(),
        });
    }
    let target = if path.is_dir() {
        let name = path
            .file_name()
            .ok_or_else(|| AppError::InvalidPath(rel.to_string()))?
            .to_string_lossy()
            .to_string();
        available_path(&target_dir, &name, None)
    } else {
        let stem = path
            .file_stem()
            .ok_or_else(|| AppError::InvalidPath(rel.to_string()))?
            .to_string_lossy()
            .to_string();
        available_path(&target_dir, &stem, Some("md"))
    };
    fs::rename(&path, &target)?;
    finish_move(root, rel, &target)
}

/// What a rename/move produced: the entry's new rel plus every link rewrite
/// the backend applied across the vault (used by the frontend to retarget
/// link marks in live editors and to report how many notes changed).
#[derive(Debug, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RenameOutcome {
    pub next: String,
    pub rewrites: Vec<crate::link_rewrite::LinkRewrite>,
    pub files: Vec<String>,
}

fn finish_move(root: &Path, old_rel: &str, target: &Path) -> AppResult<RenameOutcome> {
    let next = rel_of(root, target)?;
    let outcome = crate::link_rewrite::rewrite_after_move(root, old_rel, &next)?;
    Ok(RenameOutcome {
        next,
        rewrites: outcome.rewrites,
        files: outcome.files,
    })
}

/// Move a note or folder to the OS trash.
pub fn delete_entry(root: &Path, rel: &str) -> AppResult<()> {
    let path = resolve_rel(root, rel)?;
    if !path.exists() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    trash::delete(&path).map_err(|e| AppError::Other(format!("trash: {e}")))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    fn setup() -> tempfile::TempDir {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        dir
    }

    #[test]
    fn create_write_read_roundtrip() {
        let dir = setup();
        let rel = create_note(dir.path(), "", "My Note").unwrap();
        assert_eq!(rel, "My Note.md");
        write_note(dir.path(), &rel, "# hello").unwrap();
        assert_eq!(read_note(dir.path(), &rel).unwrap(), "# hello");
    }

    #[test]
    fn create_collision_suffixes() {
        let dir = setup();
        assert_eq!(create_note(dir.path(), "", "Note").unwrap(), "Note.md");
        assert_eq!(create_note(dir.path(), "", "Note").unwrap(), "Note 2.md");
        assert_eq!(create_note(dir.path(), "", "Note").unwrap(), "Note 3.md");
    }

    #[test]
    fn rename_and_move() {
        let dir = setup();
        let folder = create_folder(dir.path(), "", "projects").unwrap();
        let rel = create_note(dir.path(), "", "Idea").unwrap();
        let renamed = rename_entry(dir.path(), &rel, "Big Idea").unwrap();
        assert_eq!(renamed.next, "Big Idea.md");
        let moved = move_entry(dir.path(), &renamed.next, &folder).unwrap();
        assert_eq!(moved.next, "projects/Big Idea.md");
    }

    #[test]
    fn move_folder_into_itself_rejected() {
        let dir = setup();
        let folder = create_folder(dir.path(), "", "a").unwrap();
        let inner = create_folder(dir.path(), &folder, "b").unwrap();
        assert!(move_entry(dir.path(), &folder, &inner).is_err());
    }

    #[test]
    fn write_missing_note_errors() {
        let dir = setup();
        assert!(write_note(dir.path(), "nope.md", "x").is_err());
    }
}
