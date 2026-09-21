use std::fs;
use std::path::PathBuf;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::time::Duration;

use crate::assets;
use crate::error::{AppError, AppResult};

/// How long an upload command may run before we kill it. PicGo can be slow on
/// a cold start, so this is generous.
const UPLOAD_TIMEOUT: Duration = Duration::from_secs(60);
const MAX_OUTPUT_CHARS: usize = 20_000;

/// Upload image bytes through the user's custom command and return the
/// hosted URL. The image is staged as a temp file (the usual convention for
/// uploader CLIs like PicGo) and passed as the single argument:
///
///   sh -l -c "<user command> '<temp file>'"
///
/// URL extraction takes the last output line that parses as an absolute
/// http(s) URL — that keeps `[PicGo SUCCESS]: url` prefixes and progress
/// noise from breaking the parse, and matches Typora's behavior.
pub fn upload_image(data: &str, extension: &str, command: &str) -> AppResult<String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Err(AppError::InvalidInput(
            "no upload command is configured".into(),
        ));
    }
    let bytes = assets::decode_base64_image(data)?;
    let staged = stage_image(&bytes, extension)?;
    let _staged_guard = TempImage(&staged);
    let full = format!("{trimmed} '{}'", staged.display());

    let (tx, rx) = mpsc::channel();
    let script = full.clone();
    std::thread::spawn(move || {
        let output = Command::new("/bin/zsh")
            .args(["-l", "-c", &script])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .and_then(|child| child.wait_with_output());
        let _ = tx.send(output);
    });

    let output = rx.recv_timeout(UPLOAD_TIMEOUT).map_err(|_| {
        // The channel send happens after wait_with_output returns, so a
        // timeout means the process tree is still alive. Kill by staged-file
        // path: unique per invocation and regex-safe (unlike the full script,
        // which may contain regex metacharacters).
        let _ = Command::new("/usr/bin/pkill")
            .args(["-f", &staged.to_string_lossy()])
            .stdin(Stdio::null())
            .status();
        AppError::Network("upload timed out after 60s".into())
    })?;
    let output =
        output.map_err(|e| AppError::Network(format!("failed to run upload command: {e}")))?;

    let stdout = clip(&String::from_utf8_lossy(&output.stdout));
    let stderr = clip(&String::from_utf8_lossy(&output.stderr));
    if !output.status.success() {
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        return Err(AppError::Network(format!(
            "upload command failed (exit {}): {}",
            output.status.code().unwrap_or(-1),
            first_line(detail)
        )));
    }
    extract_url(&stdout).ok_or_else(|| {
        AppError::Network(
            "upload command printed no image URL — check that it prints the hosted URL on success"
                .into(),
        )
    })
}

struct TempImage<'a>(&'a std::path::Path);

impl Drop for TempImage<'_> {
    fn drop(&mut self) {
        let _ = fs::remove_file(self.0);
    }
}

/// Write the image to a per-invocation temp file so concurrent uploads and
/// deterministic-name uploaders can't clobber each other.
fn stage_image(bytes: &[u8], extension: &str) -> AppResult<PathBuf> {
    let ext = extension.trim_start_matches('.').to_lowercase();
    let dir = std::env::temp_dir().join("ornata-upload");
    fs::create_dir_all(&dir)?;
    let name = format!(
        "{}-{}.{ext}",
        std::process::id(),
        now_nanos()
    );
    let path = dir.join(name);
    fs::write(&path, bytes)?;
    Ok(path)
}

fn now_nanos() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

/// Find the last line containing an absolute http(s) URL and return the URL.
pub fn extract_url(output: &str) -> Option<String> {
    output
        .lines()
        .rev()
        .filter_map(|line| find_url_in(line))
        .next()
}

fn find_url_in(line: &str) -> Option<String> {
    // Scan tokens for something URL-shaped; tolerate punctuation glued to the
    // match (e.g. `[PicGo SUCCESS]: https://…` or a trailing quote).
    line.split_whitespace()
        .rev()
        .filter_map(|token| {
            let token = token.trim_start_matches(|c: char| !c.is_alphanumeric() && c != '[');
            let end = token
                .char_indices()
                .take_while(|(_, c)| *c != '\'' && *c != '"' && *c != ']' && *c != ')')
                .map(|(i, c)| i + c.len_utf8())
                .last()
                .unwrap_or(token.len());
            let candidate = &token[..end];
            if candidate.starts_with("http://") || candidate.starts_with("https://") {
                Some(candidate.to_string())
            } else {
                None
            }
        })
        .next()
}

fn clip(text: &str) -> String {
    let mut out: String = text.chars().take(MAX_OUTPUT_CHARS).collect();
    if text.chars().count() > MAX_OUTPUT_CHARS {
        out.push_str("…[truncated]");
    }
    out
}

fn first_line(text: &str) -> &str {
    text.lines().next().unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_plain_url() {
        assert_eq!(
            extract_url("https://cdn.example.com/img.png"),
            Some("https://cdn.example.com/img.png".into())
        );
    }

    #[test]
    fn extracts_picgo_success_line() {
        assert_eq!(
            extract_url("[PicGo SUCCESS]: https://cdn.example.com/a.png"),
            Some("https://cdn.example.com/a.png".into())
        );
    }

    #[test]
    fn extracts_last_url_not_progress_noise() {
        let out = "Processing image 1/2\nhttps://cdn.example.com/1.png\nUploading 2/2\nhttps://cdn.example.com/2.png\nDone!";
        assert_eq!(
            extract_url(out),
            Some("https://cdn.example.com/2.png".into())
        );
    }

    #[test]
    fn rejects_output_without_url() {
        assert_eq!(extract_url("all done, no link here"), None);
        assert_eq!(extract_url(""), None);
    }

    #[test]
    fn trims_trailing_punctuation() {
        assert_eq!(
            extract_url("\"https://cdn.example.com/a.png\"."),
            Some("https://cdn.example.com/a.png".into())
        );
    }

    #[test]
    fn empty_command_is_rejected() {
        assert!(upload_image("aGk=", "png", "  ").is_err());
    }
}
