use std::path::{Path, PathBuf};
use std::time::Duration;

use serde::Serialize;

use crate::assets;
use crate::error::{AppError, AppResult};

/// Same cap as pasted images: keeps a huge remote file from ballooning memory.
const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;

/// An image already rendered in the editor, loaded back as bytes for the
/// image context menu (re-upload, copy, save as).
pub struct LoadedImage {
    pub bytes: Vec<u8>,
    pub extension: String,
    /// Suggested file name for "Save as".
    pub file_name: String,
}

/// Base64 data URL form sent to the frontend (copy / re-upload).
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImagePayload {
    pub data: String,
    pub extension: String,
}

impl LoadedImage {
    pub fn into_payload(self) -> ImagePayload {
        let mime = mime_for(&self.extension);
        ImagePayload {
            data: format!("data:{mime};base64,{}", assets::encode_base64(&self.bytes)),
            extension: self.extension,
        }
    }
}

/// Load an image from an absolute local path, a `file://` URL, an http(s)
/// URL or an inline data URL. The frontend resolves vault-relative sources
/// before calling.
pub async fn load(source: &str) -> AppResult<LoadedImage> {
    let source = source.trim();
    if source.starts_with("http://") || source.starts_with("https://") {
        return download(source).await;
    }
    if let Some(rest) = source.strip_prefix("data:") {
        return from_data_url(source, rest);
    }
    let path = local_path(source)?;
    let bytes = read_local(&path)?;
    let extension = sniff_extension(&bytes)
        .or_else(|| extension_from_name(&path.to_string_lossy()))
        .ok_or_else(|| AppError::InvalidInput(format!("not an image: {source}")))?;
    let file_name = file_name_for(&path.to_string_lossy(), &extension);
    Ok(LoadedImage {
        bytes,
        extension,
        file_name,
    })
}

/// Resolve a local source to an existing absolute path. Markdown image links
/// are often percent-encoded (`my%20shot.png`), so fall back to the decoded
/// form when the literal path does not exist.
pub fn local_path(source: &str) -> AppResult<PathBuf> {
    let raw = source.strip_prefix("file://").unwrap_or(source);
    let literal = PathBuf::from(raw);
    if !literal.is_absolute() {
        return Err(AppError::InvalidPath(source.to_string()));
    }
    if literal.is_file() {
        return Ok(literal);
    }
    let decoded = PathBuf::from(percent_decode(raw));
    if decoded.is_file() {
        return Ok(decoded);
    }
    Err(AppError::NotFound(source.to_string()))
}

fn read_local(path: &Path) -> AppResult<Vec<u8>> {
    let size = std::fs::metadata(path)?.len() as usize;
    if size > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    Ok(std::fs::read(path)?)
}

async fn download(url: &str) -> AppResult<LoadedImage> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(30))
        .user_agent("Mozilla/5.0 (Macintosh) Ornata")
        .build()
        .map_err(|e| AppError::Network(e.to_string()))?;
    let response = client
        .get(url)
        .send()
        .await
        .and_then(|r| r.error_for_status())
        .map_err(|e| AppError::Network(e.to_string()))?;
    if response.content_length().unwrap_or(0) as usize > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(str::to_string);
    let bytes = response
        .bytes()
        .await
        .map_err(|e| AppError::Network(e.to_string()))?
        .to_vec();
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(too_large());
    }
    let path_part = url.split(['?', '#']).next().unwrap_or(url);
    let extension = sniff_extension(&bytes)
        .or_else(|| content_type.as_deref().and_then(extension_from_mime))
        .or_else(|| extension_from_name(path_part))
        .ok_or_else(|| AppError::InvalidInput(format!("not an image: {url}")))?;
    let file_name = file_name_for(&percent_decode(path_part), &extension);
    Ok(LoadedImage {
        bytes,
        extension,
        file_name,
    })
}

fn from_data_url(source: &str, rest: &str) -> AppResult<LoadedImage> {
    if source.len() > MAX_IMAGE_BYTES / 3 * 4 + 256 {
        return Err(too_large());
    }
    let bytes = assets::decode_base64_image(source)?;
    let extension = sniff_extension(&bytes)
        .or_else(|| extension_from_mime(rest))
        .ok_or_else(|| AppError::InvalidInput("not an image data URL".into()))?;
    let file_name = format!("image.{extension}");
    Ok(LoadedImage {
        bytes,
        extension,
        file_name,
    })
}

fn too_large() -> AppError {
    AppError::InvalidInput(format!(
        "image exceeds the {} MB limit",
        MAX_IMAGE_BYTES / 1024 / 1024
    ))
}

/// Identify the format from magic bytes — file names and content types lie.
pub fn sniff_extension(bytes: &[u8]) -> Option<String> {
    let ext = if bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        "png"
    } else if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "jpg"
    } else if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") {
        "gif"
    } else if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        "webp"
    } else {
        let head = String::from_utf8_lossy(&bytes[..bytes.len().min(512)]).to_lowercase();
        if head.contains("<svg") {
            "svg"
        } else {
            return None;
        }
    };
    Some(ext.to_string())
}

fn extension_from_mime(mime: &str) -> Option<String> {
    let subtype = mime.split(';').next()?.trim().strip_prefix("image/")?;
    let ext = match subtype {
        "jpeg" => "jpg",
        "svg+xml" => "svg",
        other => other,
    };
    known(ext)
}

fn extension_from_name(name: &str) -> Option<String> {
    let ext = name.rsplit_once('.')?.1.to_lowercase();
    known(if ext == "jpeg" { "jpg" } else { &ext })
}

fn known(ext: &str) -> Option<String> {
    ["png", "jpg", "gif", "webp", "svg"]
        .contains(&ext)
        .then(|| ext.to_string())
}

fn mime_for(extension: &str) -> &'static str {
    match extension {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        _ => "image/png",
    }
}

/// Last path segment, with the sniffed extension when it has none.
fn file_name_for(path: &str, extension: &str) -> String {
    let base = path
        .rsplit(['/', '\\'])
        .next()
        .filter(|s| !s.is_empty())
        .unwrap_or("image");
    if extension_from_name(base).is_some() {
        base.to_string()
    } else {
        format!("{base}.{extension}")
    }
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(byte) = u8::from_str_radix(&input[i + 1..i + 3], 16) {
                out.push(byte);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const PNG: &[u8] = b"\x89PNG\r\n\x1a\n\0\0\0\rIHDR";

    #[test]
    fn sniffs_common_formats() {
        assert_eq!(sniff_extension(PNG).as_deref(), Some("png"));
        assert_eq!(sniff_extension(&[0xFF, 0xD8, 0xFF, 0xE0]).as_deref(), Some("jpg"));
        assert_eq!(sniff_extension(b"GIF89a...").as_deref(), Some("gif"));
        assert_eq!(sniff_extension(b"RIFF\0\0\0\0WEBPVP8 ").as_deref(), Some("webp"));
        assert_eq!(sniff_extension(b"<?xml?><svg xmlns=''/>").as_deref(), Some("svg"));
        assert_eq!(sniff_extension(b"hello"), None);
    }

    #[test]
    fn falls_back_to_mime_and_name() {
        assert_eq!(extension_from_mime("image/jpeg; q=1").as_deref(), Some("jpg"));
        assert_eq!(extension_from_mime("text/html"), None);
        assert_eq!(extension_from_name("a/b/Shot.JPEG").as_deref(), Some("jpg"));
        assert_eq!(extension_from_name("a/b/readme"), None);
    }

    #[test]
    fn names_saved_files() {
        assert_eq!(file_name_for("/x/.ornata/assets/abc.png", "png"), "abc.png");
        assert_eq!(file_name_for("https://cdn.test/raw/abc", "webp"), "abc.webp");
        assert_eq!(file_name_for("https://cdn.test/", "png"), "image.png");
    }

    #[test]
    fn decodes_percent_escapes() {
        assert_eq!(percent_decode("my%20shot.png"), "my shot.png");
        assert_eq!(percent_decode("%E5%9B%BE.png"), "图.png");
        assert_eq!(percent_decode("100%"), "100%");
        assert_eq!(percent_decode("bad%zz"), "bad%zz");
    }

    #[test]
    fn loads_local_images_including_encoded_paths() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("my shot.png");
        std::fs::write(&path, PNG).unwrap();

        let encoded = format!("{}/my%20shot.png", dir.path().display());
        let resolved = local_path(&encoded).unwrap();
        assert_eq!(resolved, path);
        assert_eq!(local_path(&format!("file://{}", path.display())).unwrap(), path);
        assert!(matches!(local_path("relative.png"), Err(AppError::InvalidPath(_))));
        assert!(matches!(
            local_path(&format!("{}/missing.png", dir.path().display())),
            Err(AppError::NotFound(_))
        ));
    }
}
