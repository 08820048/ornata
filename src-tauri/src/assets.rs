use std::fs;
use std::path::{Path, PathBuf};

use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::vault::ASSETS_DIR;

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// Reject images beyond 20 MB decoded — pasted screenshots are far below
/// this, and the cap keeps a stray huge paste from ballooning memory.
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

/// Save image bytes (sent from the editor as base64) into the vault's
/// asset folder. Returns the absolute path for use with the asset protocol.
pub fn save_image(root: &Path, base64_data: &str, extension: &str) -> AppResult<PathBuf> {
    save_image_in(root.join(ASSETS_DIR), base64_data, extension)
}

/// Save an image next to an external document in a portable `assets/` folder.
pub fn save_external_image(
    note_path: &Path,
    base64_data: &str,
    extension: &str,
) -> AppResult<PathBuf> {
    let parent = note_path
        .parent()
        .ok_or_else(|| AppError::InvalidPath(note_path.display().to_string()))?;
    save_image_in(parent.join("assets"), base64_data, extension)
}

fn save_image_in(dir: PathBuf, base64_data: &str, extension: &str) -> AppResult<PathBuf> {
    let ext = extension.trim_start_matches('.').to_lowercase();
    if !ALLOWED_EXTENSIONS.contains(&ext.as_str()) {
        return Err(AppError::InvalidInput(format!(
            "unsupported image type: {ext}"
        )));
    }
    // Base64 inflates by 4/3 — check the encoded length first so an oversized
    // payload is rejected before allocating the decode buffer.
    if base64_data.len() > MAX_IMAGE_BYTES / 3 * 4 {
        return Err(AppError::InvalidInput(format!(
            "image exceeds the {}/{} MB limit",
            MAX_IMAGE_BYTES / 1024 / 1024,
            MAX_IMAGE_BYTES / 1024 / 1024
        )));
    }
    let bytes = decode_base64(base64_data)?;
    fs::create_dir_all(&dir)?;
    let path = dir.join(format!("{}.{ext}", Uuid::new_v4()));
    fs::write(&path, bytes)?;
    Ok(path)
}

fn decode_base64(data: &str) -> AppResult<Vec<u8>> {
    // Accept both raw base64 and data URLs.
    let raw = data.rsplit(',').next().unwrap_or(data);
    base64_decode(raw).ok_or_else(|| AppError::InvalidInput("invalid base64 image".to_string()))
}

/// Minimal base64 decoder (standard alphabet, ignores whitespace/padding).
fn base64_decode(input: &str) -> Option<Vec<u8>> {
    fn value(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let mut buffer: u32 = 0;
    let mut bits = 0u8;
    for &byte in input.as_bytes() {
        if byte == b'=' || byte.is_ascii_whitespace() {
            continue;
        }
        buffer = (buffer << 6) | value(byte)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
        }
    }
    Some(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn saves_data_url_png() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        // 1x1 transparent png, truncated is fine for the write test
        let data = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
        let path = save_image(dir.path(), data, "png").unwrap();
        assert!(path.exists());
        assert!(path.to_string_lossy().contains(".ornata/assets"));
    }

    #[test]
    fn rejects_unknown_extension() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        assert!(save_image(dir.path(), "aGVsbG8=", "exe").is_err());
    }

    #[test]
    fn external_images_use_sibling_assets_folder() {
        let dir = tempdir().unwrap();
        let note = dir.path().join("outside.md");
        std::fs::write(&note, "").unwrap();
        let path = save_external_image(&note, "aGVsbG8=", "png").unwrap();
        assert_eq!(path.parent(), Some(dir.path().join("assets").as_path()));
        assert!(path.exists());
    }

    #[test]
    fn base64_roundtrip() {
        assert_eq!(base64_decode("aGVsbG8=").unwrap(), b"hello");
        assert!(base64_decode("!!!").is_none());
    }

    #[test]
    fn rejects_oversized_images() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let big = "A".repeat(MAX_IMAGE_BYTES / 3 * 4 + 1);
        let error = save_image(dir.path(), &big, "png").unwrap_err();
        assert!(error.to_string().contains("limit"));
    }
}
