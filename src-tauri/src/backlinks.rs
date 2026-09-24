use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;
use crate::vault::{notes_root, rel_of};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Backlink {
    pub rel: String,
    pub title: String,
    /// The line containing the first link to the target.
    pub snippet: String,
}

const SNIPPET_MAX: usize = 180;

/// Notes that link to `target` via a markdown link (`[x](target.md)`) or a
/// `[[wiki]]` link, sorted by title.
pub fn backlinks(root: &Path, target: &str) -> AppResult<Vec<Backlink>> {
    let target = strip_md(target).to_lowercase();
    let target_name = target.rsplit('/').next().unwrap_or(&target).to_string();
    let mut hits = Vec::new();
    walk(root, &notes_root(root), &target, &target_name, &mut hits)?;
    hits.sort_by_key(|hit| hit.title.to_lowercase());
    Ok(hits)
}

fn walk(
    root: &Path,
    dir: &Path,
    target: &str,
    target_name: &str,
    hits: &mut Vec<Backlink>,
) -> AppResult<()> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if entry.file_name().to_string_lossy().starts_with('.') {
            continue;
        }
        if path.is_dir() {
            walk(root, &path, target, target_name, hits)?;
            continue;
        }
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let rel = rel_of(root, &path)?;
        if strip_md(&rel).to_lowercase() == target {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        let Some(line) = content
            .lines()
            .find(|line| links_to(line, target, target_name))
        else {
            continue;
        };
        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        hits.push(Backlink {
            rel,
            title,
            snippet: snippet(line),
        });
    }
    Ok(())
}

fn links_to(line: &str, target: &str, target_name: &str) -> bool {
    markdown_hrefs(line).any(|href| href_to_rel(href).is_some_and(|rel| rel == target))
        || wiki_targets(line).any(|wiki| {
            let wiki = strip_md(wiki.trim()).to_lowercase();
            wiki == target || wiki == target_name
        })
}

/// Hrefs of inline markdown links: the text between `](` and the next `)`.
fn markdown_hrefs(line: &str) -> impl Iterator<Item = &str> {
    line.match_indices("](").filter_map(move |(i, _)| {
        let rest = &line[i + 2..];
        rest.find(')').map(|end| rest[..end].trim())
    })
}

fn wiki_targets(line: &str) -> impl Iterator<Item = &str> {
    line.match_indices("[[").filter_map(move |(i, _)| {
        let rest = &line[i + 2..];
        let inner = &rest[..rest.find("]]")?];
        Some(inner.split('|').next().unwrap_or(inner))
    })
}

/// Mirror of the frontend's `hrefToRel`: vault-relative, extension-less, lowercase.
fn href_to_rel(href: &str) -> Option<String> {
    let href = href
        .split_whitespace()
        .next()?
        .trim_matches(|c| c == '<' || c == '>');
    if href.starts_with('#') || has_scheme(href) {
        return None;
    }
    let path = href.split(['?', '#']).next().unwrap_or(href);
    let decoded = percent_decode(path);
    let rel = decoded.trim_start_matches("./").trim_start_matches('/');
    (!rel.is_empty()).then(|| strip_md(rel).to_lowercase())
}

fn has_scheme(href: &str) -> bool {
    href.split_once(':').is_some_and(|(scheme, _)| {
        scheme
            .chars()
            .next()
            .is_some_and(|c| c.is_ascii_alphabetic())
            && scheme
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || "+.-".contains(c))
    })
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            let hex = std::str::from_utf8(&bytes[i + 1..i + 3]).unwrap_or("");
            if let Ok(byte) = u8::from_str_radix(hex, 16) {
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

fn strip_md(rel: &str) -> &str {
    match rel.len().checked_sub(3) {
        Some(cut) if rel.is_char_boundary(cut) && rel[cut..].eq_ignore_ascii_case(".md") => {
            &rel[..cut]
        }
        _ => rel,
    }
}

fn snippet(line: &str) -> String {
    let text = line
        .trim()
        .trim_start_matches(['#', '-', '*', '>', ' '])
        .trim();
    let mut out: String = text.chars().take(SNIPPET_MAX).collect();
    if text.chars().count() > SNIPPET_MAX {
        out.push('…');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn finds_markdown_and_wiki_links() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        create_folder(root, "", "projects").unwrap();
        let target = create_note(root, "projects", "Big Idea").unwrap();
        let a = create_note(root, "", "Journal").unwrap();
        write_note(
            root,
            &a,
            "intro\n- see [idea](projects/Big%20Idea.md) today",
        )
        .unwrap();
        let b = create_note(root, "", "Archive").unwrap();
        write_note(root, &b, "old: [[big idea|the idea]]").unwrap();
        let c = create_note(root, "", "Unrelated").unwrap();
        write_note(root, &c, "[web](https://example.com/Big%20Idea.md)").unwrap();
        write_note(root, &target, "[self](projects/Big%20Idea.md)").unwrap();

        let hits = backlinks(root, &target).unwrap();
        let titles: Vec<_> = hits.iter().map(|h| h.title.as_str()).collect();
        assert_eq!(titles, ["Archive", "Journal"]);
        assert_eq!(hits[1].snippet, "see [idea](projects/Big%20Idea.md) today");
    }

    #[test]
    fn href_resolution_matches_frontend() {
        assert_eq!(href_to_rel("./a/b.md").as_deref(), Some("a/b"));
        assert_eq!(href_to_rel("/A.MD#top").as_deref(), Some("a"));
        assert_eq!(href_to_rel("note").as_deref(), Some("note"));
        assert_eq!(href_to_rel("mailto:x@y.z"), None);
        assert_eq!(href_to_rel("#anchor"), None);
        assert_eq!(percent_decode("%E4%BD%A0%zz"), "你%zz");
    }
}
