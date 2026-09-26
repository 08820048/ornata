//! Small JSON state files under `.ornata/` (currently `pinned.json`).
//!
//! Pinned notes are vault state, not note content: they live in the vault so
//! they follow it across machines (iCloud/git), unlike session-only state in
//! localStorage. The filename is whitelisted — nothing else is addressable.

use std::fs;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::vault::DATA_DIR;

fn data_path(root: &Path, name: &str) -> AppResult<PathBuf> {
    let ok = !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '-' | '_'));
    if !ok {
        return Err(AppError::InvalidInput(format!("bad data file: {name}")));
    }
    Ok(root.join(DATA_DIR).join(format!("{name}.json")))
}

pub fn read_data_file(root: &Path, name: &str) -> AppResult<Option<String>> {
    let path = data_path(root, name)?;
    if !path.is_file() {
        return Ok(None);
    }
    Ok(Some(fs::read_to_string(path)?))
}

pub fn write_data_file(root: &Path, name: &str, content: &str) -> AppResult<()> {
    let path = data_path(root, name)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| AppError::Other(format!("data: {e}")))?;
    }
    fs::write(path, content)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn roundtrips_json_content() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        assert_eq!(read_data_file(dir.path(), "pinned").unwrap(), None);
        write_data_file(dir.path(), "pinned", r#"["a.md"]"#).unwrap();
        assert_eq!(
            read_data_file(dir.path(), "pinned").unwrap().as_deref(),
            Some(r#"["a.md"]"#)
        );
    }

    #[test]
    fn rejects_path_traversal_names() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        assert!(read_data_file(dir.path(), "../notes").is_err());
        assert!(read_data_file(dir.path(), ".ornata").is_err());
        assert!(write_data_file(dir.path(), "a/b", "x").is_err());
    }
}
