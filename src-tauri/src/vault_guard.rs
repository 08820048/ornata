//! Keeps agents (MCP and the `ornata` command line)
//! inside the vault. Paths are already checked for `..`, but a symlink in
//! `notes/` can still point anywhere — `notes/x.md -> ~/.ssh/id_rsa` — and
//! reads and writes follow it. Agent-facing calls go through here so the
//! *real* location must be inside the notes folder.
//!
//! The app's own UI doesn't use this: people do link folders into a vault on
//! purpose, and they should keep working in the editor.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::vault::{notes_root, resolve_rel, TreeNode};

/// True when `path` really lives under the notes folder. A path that doesn't
/// exist yet is judged by its nearest existing ancestor; a dangling symlink
/// (which a write would follow to wherever it points) is refused.
pub fn real_inside(root: &Path, path: &Path) -> bool {
    let Ok(base) = fs::canonicalize(notes_root(root)) else {
        return false;
    };
    let mut probe = path.to_path_buf();
    loop {
        match fs::canonicalize(&probe) {
            Ok(real) => return real.starts_with(&base),
            Err(_) => {
                if fs::symlink_metadata(&probe).is_ok() {
                    return false; // a link to something that isn't there
                }
                if !probe.pop() {
                    return false;
                }
            }
        }
    }
}

/// `resolve_rel`, plus: the real location must be inside the vault.
pub fn contained_rel(root: &Path, rel: &str) -> AppResult<PathBuf> {
    let path = resolve_rel(root, rel)?;
    if real_inside(root, &path) {
        Ok(path)
    } else {
        Err(AppError::InvalidPath(format!("{rel} points outside the vault")))
    }
}

pub fn rel_inside(root: &Path, rel: &str) -> bool {
    contained_rel(root, rel).is_ok()
}

/// The tree without anything whose real location is outside the vault.
pub fn retain_tree(root: &Path, nodes: Vec<TreeNode>) -> Vec<TreeNode> {
    nodes
        .into_iter()
        .filter(|node| rel_inside(root, &node.rel))
        .map(|mut node| {
            if let Some(children) = node.children.take() {
                node.children = Some(retain_tree(root, children));
            }
            node
        })
        .collect()
}

#[cfg(test)]
pub(crate) mod fixture {
    use std::path::PathBuf;

    use tempfile::TempDir;

    use crate::vault::ensure_layout;

    /// A vault with a normal note, a link to an outside secret, a link to an
    /// outside folder, a dangling link, and a link that stays inside.
    pub struct Escape {
        pub _dir: TempDir,
        pub root: PathBuf,
        pub secret: PathBuf,
    }

    #[cfg(unix)]
    pub fn escape() -> Escape {
        use std::os::unix::fs::symlink;
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("vault");
        std::fs::create_dir_all(&root).unwrap();
        ensure_layout(&root).unwrap();
        let notes = root.join("notes");
        std::fs::create_dir_all(&notes).unwrap();
        std::fs::write(notes.join("ok.md"), "# ok\n- [ ] inside task\nsee secret").unwrap();
        let outside = dir.path().join("outside");
        std::fs::create_dir_all(&outside).unwrap();
        let secret = outside.join("secret.md");
        std::fs::write(&secret, "TOP SECRET\n- [ ] outside task").unwrap();
        symlink(&secret, notes.join("evil.md")).unwrap();
        symlink(&outside, notes.join("linked")).unwrap();
        symlink(outside.join("nope.md"), notes.join("dangling.md")).unwrap();
        symlink(notes.join("ok.md"), notes.join("alias.md")).unwrap();
        Escape { _dir: dir, root, secret }
    }
}

#[cfg(all(test, unix))]
mod tests {
    use super::fixture::escape;
    use super::*;

    #[test]
    fn links_out_of_the_vault_are_refused_and_links_within_are_fine() {
        let v = escape();
        assert!(rel_inside(&v.root, "ok.md"));
        assert!(rel_inside(&v.root, "alias.md"));
        assert!(rel_inside(&v.root, "new-note.md"), "a note that doesn't exist yet");
        assert!(!rel_inside(&v.root, "evil.md"));
        assert!(!rel_inside(&v.root, "linked/secret.md"));
        assert!(!rel_inside(&v.root, "linked/new.md"), "creating inside a linked-out folder");
        assert!(!rel_inside(&v.root, "dangling.md"), "a write would land outside");
        assert!(contained_rel(&v.root, "../x.md").is_err());
    }

    #[test]
    fn the_tree_hides_what_points_outside() {
        let v = escape();
        let tree = retain_tree(&v.root, crate::vault::scan_tree(&v.root).unwrap());
        let names: Vec<&str> = tree.iter().map(|n| n.rel.as_str()).collect();
        assert!(names.contains(&"ok.md") && names.contains(&"alias.md"));
        assert!(!names.iter().any(|n| n.starts_with("evil") || n.starts_with("linked") || n.starts_with("dangling")));
    }
}
