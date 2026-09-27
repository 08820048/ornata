use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::Serialize;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::vault::ASSETS_DIR;

const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "svg"];

/// Reject images beyond 20 MB decoded — pasted screenshots are far below
/// this, and the cap keeps a stray huge paste from ballooning memory.
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

/// A fresh paste lands on disk before its reference is written into the
/// note — give that window a wide berth before calling an asset orphaned.
const GRACE_MS: u128 = 10 * 60 * 1000;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UnusedAsset {
    pub name: String,
    pub size: i64,
}

/// Vault assets no note references (`.ornata/assets/...` and legacy
/// `.markd/assets/...` references both count as live). Fresh files inside
/// the grace window are never listed.
pub fn unreferenced_assets(root: &Path) -> AppResult<Vec<UnusedAsset>> {
    let mut referenced: HashSet<String> = HashSet::new();
    collect_references(root, &crate::vault::notes_root(root), &mut referenced)?;
    let mut out: Vec<UnusedAsset> = Vec::new();
    let now = SystemTime::now();
    for entry in fs::read_dir(root.join(ASSETS_DIR)).into_iter().flatten().flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') || referenced.contains(&name) {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if metadata
            .modified()
            .ok()
            .and_then(|modified| now.duration_since(modified).ok())
            .is_some_and(|age| age.as_millis() < GRACE_MS)
        {
            continue;
        }
        out.push(UnusedAsset {
            name,
            size: metadata.len() as i64,
        });
    }
    out.sort_by(|a, b| b.size.cmp(&a.size));
    Ok(out)
}

/// Move the named vault assets to the OS trash. Bare file names only —
/// anything with a separator is ignored. Returns how many were trashed.
pub fn trash_assets(root: &Path, names: &[String]) -> AppResult<usize> {
    let mut trashed = 0;
    for name in names {
        if name.starts_with('.') || name.contains('/') || name.contains('\\') {
            continue;
        }
        let path = root.join(ASSETS_DIR).join(name);
        if path.is_file() && trash::delete(&path).is_ok() {
            trashed += 1;
        }
    }
    Ok(trashed)
}

/// Filenames referenced by any note: every `assets/<name>` token in the raw
/// markdown (uuid names carry no spaces, so the token ends at whitespace,
/// `)`, `>` or a quote). `.ornata/` and legacy `.markd/` both appear as
/// prefixes; only the filename matters here.
fn collect_references(root: &Path, dir: &Path, referenced: &mut HashSet<String>) -> AppResult<()> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            collect_references(root, &path, referenced)?;
            continue;
        }
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        let mut rest = content.as_str();
        while let Some(pos) = rest.find("assets/") {
            let tail = &rest[pos + "assets/".len()..];
            let name: String = tail
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
                .collect();
            if name.contains('.') {
                referenced.insert(name);
            }
            rest = tail;
        }
    }
    Ok(())
}

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
    decode_base64_bytes(raw).ok_or_else(|| {
        AppError::InvalidInput("invalid base64 image".to_string())
    })
}

/// Decode raw base64 or a data URL into raw image bytes. Shared with the
/// image-upload pipeline, which stages bytes as a temp file.
pub fn decode_base64_image(data: &str) -> AppResult<Vec<u8>> {
    decode_base64(data)
}

/// Minimal base64 encoder (standard alphabet, padded) — the inverse of
/// `decode_base64_bytes`, used to hand image bytes back to the editor.
pub fn encode_base64(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    for chunk in bytes.chunks(3) {
        let n = (chunk[0] as u32) << 16
            | (*chunk.get(1).unwrap_or(&0) as u32) << 8
            | *chunk.get(2).unwrap_or(&0) as u32;
        for i in 0..4 {
            if i <= chunk.len() {
                out.push(ALPHABET[(n >> (18 - 6 * i) & 63) as usize] as char);
            } else {
                out.push('=');
            }
        }
    }
    out
}

/// Minimal base64 decoder (standard alphabet, ignores whitespace/padding).
fn decode_base64_bytes(input: &str) -> Option<Vec<u8>> {
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
        assert_eq!(decode_base64_bytes("aGVsbG8=").unwrap(), b"hello");
        assert!(decode_base64_bytes("!!!").is_none());
        for input in [&b""[..], b"h", b"he", b"hel", b"hello", &[0xFF, 0x00, 0xFE]] {
            assert_eq!(decode_base64_bytes(&encode_base64(input)).unwrap(), input);
        }
        assert_eq!(encode_base64(b"hello"), "aGVsbG8=");
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
