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
    /// Raw markdown of the first few lines linking to the target. Rendered
    /// (link labels, highlighting) by the frontend, so it is never cut
    /// mid-link by a short length cap.
    pub snippets: Vec<String>,
    /// Total number of lines linking to the target.
    pub count: usize,
}

/// Safety cap only — the UI clamps visually. Long enough that encoded CJK
/// hrefs (9 chars per character) survive intact.
const SNIPPET_MAX: usize = 1000;
const SNIPPETS_PER_NOTE: usize = 3;

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
        let lines: Vec<&str> = content
            .lines()
            .filter(|line| links_to(line, target, target_name))
            .collect();
        if lines.is_empty() {
            continue;
        }
        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        hits.push(Backlink {
            rel,
            title,
            snippets: lines.iter().take(SNIPPETS_PER_NOTE).map(|l| snippet(l)).collect(),
            count: lines.len(),
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
/// Handles nested parentheses in link text by counting bracket depth.
pub(crate) fn markdown_hrefs(line: &str) -> impl Iterator<Item = &str> {
    let mut chars = line.char_indices().peekable();
    let mut results = Vec::new();

    while let Some((i, c)) = chars.next() {
        if c == ']' {
            // Check if next char is '('
            if let Some((_, '(')) = chars.peek() {
                chars.next(); // consume '('
                let mut depth = 1;
                let start = i + 2; // position after ']['
                let mut end = None;

                while let Some((j, c)) = chars.next() {
                    if c == '(' {
                        depth += 1;
                    } else if c == ')' {
                        depth -= 1;
                        if depth == 0 {
                            end = Some(j);
                            break;
                        }
                    }
                }

                if let Some(end_pos) = end {
                    let href = &line[start..end_pos];
                    results.push(href.trim());
                }
            }
        }
    }

    results.into_iter()
}

pub(crate) fn wiki_targets(line: &str) -> impl Iterator<Item = &str> {
    line.match_indices("[[").filter_map(move |(i, _)| {
        let rest = &line[i + 2..];
        let inner = &rest[..rest.find("]]")?];
        Some(inner.split('|').next().unwrap_or(inner))
    })
}

/// Mirror of the frontend's `hrefToRel`: vault-relative, extension-less, lowercase.
pub(crate) fn href_to_rel(href: &str) -> Option<String> {
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

pub(crate) fn percent_decode(input: &str) -> String {
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

pub(crate) fn strip_md(rel: &str) -> &str {
    match rel.len().checked_sub(3) {
        Some(cut) if rel.is_char_boundary(cut) && rel[cut..].eq_ignore_ascii_case(".md") => {
            &rel[..cut]
        }
        _ => rel,
    }
}

pub(crate) fn snippet(line: &str) -> String {
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
        assert_eq!(hits[1].snippets, ["see [idea](projects/Big%20Idea.md) today"]);
        assert_eq!(hits[1].count, 1);
    }

    #[test]
    fn collects_every_mention_up_to_the_cap() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let target = create_note(root, "", "Idea").unwrap();
        let a = create_note(root, "", "Log").unwrap();
        let body: Vec<String> = (1..=5).map(|i| format!("{i}. [[Idea]]")).collect();
        write_note(root, &a, &body.join("\nfiller\n")).unwrap();

        let hits = backlinks(root, &target).unwrap();
        assert_eq!(hits[0].count, 5);
        assert_eq!(hits[0].snippets.len(), SNIPPETS_PER_NOTE);
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

    #[test]
    fn finds_chinese_encoded_links() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        create_folder(root, "", "40-职业").unwrap();
        create_folder(root, "40-职业", "面试与笔试").unwrap();
        let target = create_note(root, "40-职业/面试与笔试", "Lua 语法速查 (面试复习)").unwrap();
        let a = create_note(root, "", "Journal").unwrap();
        write_note(
            root,
            &a,
            "参见 [Lua 语法速查(面试复习)](40-%E8%81%8C%E4%B8%9A/%E9%9D%A2%E8%AF%95%E4%B8%8E%E7%AC%94%E8%AF%95/Lua%20%E8%AF%AD%E6%B3%95%E9%80%9F%E6%9F%A5%20(%E9%9D%A2%E8%AF%95%E5%A4%8D%E4%B9%A0).md)",
        )
        .unwrap();

        let hits = backlinks(root, &target).unwrap();
        let titles: Vec<_> = hits.iter().map(|h| h.title.as_str()).collect();
        assert_eq!(titles, ["Journal"]);
    }
}
