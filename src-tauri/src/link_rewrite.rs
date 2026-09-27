//! Rewrites internal links across the vault after a rename or move.
//!
//! Internal links are markdown links whose href is a vault-relative note path,
//! plus `[[wiki]]` text external tools may have written. Moving an entry
//! orphans every href pointing at it, so after the filesystem change we scan
//! all notes and repoint matching links — body only, frontmatter stays
//! verbatim. Reports `from → to` rel pairs so open editors can follow.

use std::collections::HashSet;
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::backlinks::{href_to_rel, percent_decode, strip_md};
use crate::error::AppResult;
use crate::vault::{notes_root, rel_of};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkRewrite {
    pub from: String,
    pub to: String,
}

pub struct RewriteOutcome {
    /// Target pairs for the frontend (per moved note; folder moves expand).
    pub rewrites: Vec<LinkRewrite>,
    /// Rels of the files modified on disk.
    pub files: Vec<String>,
}

/// Scan every note and repoint links that resolve into the moved entry.
/// `old_rel`/`new_rel` are the entry's rels around the move: a note (ends in
/// `.md`) rewrites exact href matches, a folder rewrites everything beneath
/// its prefix — including asset paths that moved along with the folder.
pub fn rewrite_after_move(
    root: &Path,
    old_rel: &str,
    new_rel: &str,
) -> AppResult<RewriteOutcome> {
    if strip_md(old_rel) == strip_md(new_rel) {
        return Ok(RewriteOutcome {
            rewrites: Vec::new(),
            files: Vec::new(),
        });
    }
    let notes_dir = notes_root(root);
    let mut files: Vec<(String, String)> = Vec::new(); // (rel, content)
    let mut basenames: HashSet<String> = HashSet::new();
    collect_notes(root, &notes_dir, &mut files, &mut basenames)?;
    files.sort_by(|a, b| a.0.cmp(&b.0));

    let ctx = MatchCtx::new(old_rel, new_rel, &basenames);
    let mut changed = Vec::new();
    for (rel, content) in &files {
        if let Some(next) = rewrite_content(content, &ctx) {
            fs::write(notes_dir.join(rel), next)?;
            changed.push(rel.clone());
        }
    }

    let rewrites = target_pairs(root, old_rel, new_rel, &notes_dir)?;
    Ok(RewriteOutcome {
        rewrites,
        files: changed,
    })
}

struct MatchCtx {
    /// Lowercase extension-less old rel for a note move.
    note_key: Option<String>,
    /// New rel for a note move (kept with extension).
    note_new: String,
    /// Lowercase old rel for a folder move (no trailing slash).
    dir_key: Option<String>,
    dir_new: String,
    /// A bare `[[name]]` shorthand may follow a rename only when no
    /// surviving note still claims the old basename.
    bare_rename: Option<(String, String)>,
}

impl MatchCtx {
    fn new(old_rel: &str, new_rel: &str, basenames: &HashSet<String>) -> Self {
        if is_note_rel(old_rel) {
            let old_base = basename_of(old_rel).to_lowercase();
            let new_base = basename_of(new_rel);
            let bare_rename = (old_base != new_base.to_lowercase()
                && !basenames.contains(&old_base))
            .then(|| (old_base.clone(), new_base.to_string()));
            MatchCtx {
                note_key: Some(strip_md(old_rel).to_lowercase()),
                note_new: new_rel.to_string(),
                dir_key: None,
                dir_new: String::new(),
                bare_rename,
            }
        } else {
            MatchCtx {
                note_key: None,
                note_new: String::new(),
                dir_key: Some(old_rel.to_lowercase().trim_end_matches('/').to_string()),
                dir_new: new_rel.to_string(),
                bare_rename: None,
            }
        }
    }
}

fn is_note_rel(rel: &str) -> bool {
    rel.to_lowercase().ends_with(".md")
}

fn basename_of(rel: &str) -> &str {
    strip_md(rel).rsplit('/').next().unwrap_or("")
}

/// `from → to` pairs for every note the move displaced (folder moves expand
/// to one pair per note beneath), so the frontend can retarget link marks in
/// live editors.
fn target_pairs(
    root: &Path,
    old_rel: &str,
    new_rel: &str,
    notes_dir: &Path,
) -> AppResult<Vec<LinkRewrite>> {
    if is_note_rel(old_rel) {
        return Ok(vec![LinkRewrite {
            from: old_rel.to_string(),
            to: new_rel.to_string(),
        }]);
    }
    let mut pairs = Vec::new();
    collect_pairs(root, &notes_dir.join(new_rel), old_rel, new_rel, &mut pairs)?;
    pairs.sort_by(|a, b| a.from.cmp(&b.from));
    Ok(pairs)
}

fn collect_pairs(
    root: &Path,
    dir: &Path,
    old_rel: &str,
    new_rel: &str,
    pairs: &mut Vec<LinkRewrite>,
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
            collect_pairs(root, &path, old_rel, new_rel, pairs)?;
            continue;
        }
        if path.extension().is_none_or(|e| !e.eq_ignore_ascii_case("md")) {
            continue;
        }
        let rel = rel_of(root, &path)?;
        pairs.push(LinkRewrite {
            from: format!("{old_rel}/{}", &rel[new_rel.len() + 1..]),
            to: rel,
        });
    }
    Ok(())
}

fn collect_notes(
    root: &Path,
    dir: &Path,
    files: &mut Vec<(String, String)>,
    basenames: &mut HashSet<String>,
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
            collect_notes(root, &path, files, basenames)?;
            continue;
        }
        if path.extension().is_none_or(|e| !e.eq_ignore_ascii_case("md")) {
            continue;
        }
        let rel = rel_of(root, &path)?;
        basenames.insert(basename_of(&rel).to_lowercase());
        let content = fs::read_to_string(&path).unwrap_or_default();
        files.push((rel, content));
    }
    Ok(())
}

struct HrefSpan {
    start: usize,
    end: usize,
    href: String,
}

/// Byte ranges of `](href)` targets, tolerating nested parentheses.
fn scan_hrefs(body: &str) -> Vec<HrefSpan> {
    let mut spans = Vec::new();
    let mut iter = body.char_indices().peekable();
    while let Some((i, c)) = iter.next() {
        if c != ']' || !matches!(iter.peek(), Some((_, '('))) {
            continue;
        }
        iter.next();
        let start = i + 2;
        let mut depth = 1usize;
        let mut end = None;
        while let Some((j, ch)) = iter.next() {
            match ch {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(j);
                        break;
                    }
                }
                _ => {}
            }
        }
        if let Some(end) = end {
            spans.push(HrefSpan {
                start,
                end,
                href: body[start..end].to_string(),
            });
        }
    }
    spans
}

struct WikiSpan {
    target_start: usize,
    target_end: usize,
    target: String,
}

/// Byte ranges of `[[target]]` / `[[target|alias]]` targets.
fn scan_wikis(body: &str) -> Vec<WikiSpan> {
    let mut spans = Vec::new();
    let mut rest = body;
    let mut offset = 0usize;
    while let Some(i) = rest.find("[[") {
        let open = offset + i;
        let Some(close) = rest[i + 2..].find("]]") else {
            break;
        };
        let inner = &rest[i + 2..i + 2 + close];
        let (target, tstart, tend) = match inner.find('|') {
            Some(bar) => (&inner[..bar], open + 2, open + 2 + bar),
            None => (inner, open + 2, open + 2 + inner.len()),
        };
        spans.push(WikiSpan {
            target_start: tstart,
            target_end: tend,
            target: target.to_string(),
        });
        let consumed = i + 2 + close + 2;
        offset += consumed;
        rest = &rest[consumed..];
    }
    spans
}

fn rewrite_content(content: &str, ctx: &MatchCtx) -> Option<String> {
    let (frontmatter, body) = split_frontmatter(content);
    let mut edits: Vec<(usize, usize, String)> = Vec::new();

    for span in scan_hrefs(body) {
        if let Some(text) = rewrite_href(&span.href, ctx) {
            edits.push((span.start, span.end, text));
        }
    }
    for span in scan_wikis(body) {
        if let Some(text) = rewrite_wiki(&span.target, ctx) {
            edits.push((span.target_start, span.target_end, text));
        }
    }
    if edits.is_empty() {
        return None;
    }
    edits.sort_by(|a, b| b.0.cmp(&a.0));
    let mut out = body.to_string();
    for (start, end, text) in edits {
        out.replace_range(start..end, &text);
    }
    Some(format!("{frontmatter}{out}"))
}

/// Split a leading `---` frontmatter block off, mirroring the frontend's
/// regex: the closing fence must sit at least one line below the opening, so
/// a `---` line directly under the opener stays body.
fn split_frontmatter(content: &str) -> (&str, &str) {
    let bytes = content.as_bytes();
    let mut pos = 0usize;
    let mut line_no = 0usize;
    let mut open = false;
    while pos < content.len() {
        let mut line_end = pos;
        while line_end < bytes.len() && bytes[line_end] != b'\n' {
            line_end += 1;
        }
        let next = if line_end < bytes.len() { line_end + 1 } else { line_end };
        let mut line = &content[pos..line_end];
        if line.ends_with('\r') {
            line = &line[..line.len() - 1];
        }
        let is_fence = line.trim_end_matches([' ', '\t']) == "---";
        if line_no == 0 {
            if !is_fence {
                return ("", content);
            }
            open = true;
        } else if open && is_fence && line_no >= 2 {
            return content.split_at(next);
        }
        pos = next;
        line_no += 1;
    }
    ("", content)
}

/// Repoint one markdown href, preserving its `./` prefix and `#frag`/`?query`
/// suffix; returns the full replacement text for the href slot.
fn rewrite_href(href: &str, ctx: &MatchCtx) -> Option<String> {
    let trimmed = href.trim();
    let norm = href_to_rel(trimmed)?;
    let prefix_len = if trimmed.starts_with("./") {
        2
    } else if trimmed.starts_with('/') {
        1
    } else {
        0
    };
    let rest = &trimmed[prefix_len..];
    let split_at = rest.find(['?', '#']).unwrap_or(rest.len());
    let raw_path = &rest[..split_at];
    let suffix = &rest[split_at..];
    let decoded = percent_decode(raw_path);
    let stripped = decoded.strip_prefix("./").unwrap_or(&decoded);
    let stripped = stripped.strip_prefix('/').unwrap_or(stripped);

    let new_path = if let Some(key) = &ctx.note_key {
        if norm != *key {
            return None;
        }
        ctx.note_new.clone()
    } else {
        let key = ctx.dir_key.as_deref()?;
        if !norm.starts_with(&format!("{key}/")) {
            return None;
        }
        // Cut on char boundaries of the original path so its casing survives.
        let tail: String = stripped.chars().skip(key.chars().count() + 1).collect();
        format!("{}/{}", ctx.dir_new, tail)
    };
    if new_path == stripped {
        return None;
    }
    Some(format!(
        "{}{}{}",
        &trimmed[..prefix_len],
        rel_to_href(&new_path),
        suffix
    ))
}

/// Repoint one `[[wiki]]` target (the part before `|alias`).
fn rewrite_wiki(target: &str, ctx: &MatchCtx) -> Option<String> {
    let trimmed = target.trim();
    // `[[笔记#标题]]` — match the note part, carry the fragment along.
    let (note_part, fragment) = match trimmed.find('#') {
        Some(i) => (&trimmed[..i], Some(&trimmed[i..])),
        None => (trimmed, None),
    };
    let clean = strip_md(note_part);
    let lowered = clean.to_lowercase();
    let mut rewritten: Option<String> = if let Some(key) = &ctx.note_key {
        (lowered == *key).then(|| strip_md(&ctx.note_new).to_string())
    } else if let Some(key) = &ctx.dir_key {
        if lowered.starts_with(&format!("{key}/")) {
            let suffix: String = clean.chars().skip(key.chars().count() + 1).collect();
            Some(format!("{}/{}", strip_md(&ctx.dir_new), suffix))
        } else {
            None
        }
    } else {
        None
    };
    // The bare-name shorthand is checked independently — it applies to note
    // renames even when the note_key branch above didn't match.
    if rewritten.is_none() {
        if let Some((old_base, new_base)) = &ctx.bare_rename {
            if lowered == *old_base {
                rewritten = Some(new_base.clone());
            }
        }
    }
    rewritten.map(|note| match fragment {
        Some(fragment) => format!("{note}{fragment}"),
        None => note,
    })
}

/// Vault rel → href, mirroring the frontend's `relToHref`
/// (per-segment `encodeURIComponent`).
fn rel_to_href(rel: &str) -> String {
    rel.split('/')
        .map(encode_component)
        .collect::<Vec<_>>()
        .join("/")
}

fn encode_component(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for byte in s.bytes() {
        match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'!' | b'~'
            | b'*' | b'\'' | b'(' | b')' => out.push(byte as char),
            other => out.push_str(&format!("%{other:02X}")),
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    struct Vault {
        _dir: tempfile::TempDir,
        root: std::path::PathBuf,
    }

    impl std::ops::Deref for Vault {
        type Target = std::path::Path;
        fn deref(&self) -> &std::path::Path {
            &self.root
        }
    }

    fn setup() -> Vault {
        let dir = tempdir().unwrap();
        let root = dir.path().to_path_buf();
        ensure_layout(&root).unwrap();
        Vault { _dir: dir, root }
    }

    fn content_of(root: &Path, rel: &str) -> String {
        fs::read_to_string(notes_root(root).join(rel)).unwrap()
    }

    #[test]
    fn renames_repoint_markdown_links() {
        let root = setup();
        create_folder(&root, "", "projects").unwrap();
        let target = create_note(&root, "projects", "Big Idea").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(
            &root,
            &a,
            "see [idea](projects/Big%20Idea.md) and [alt](projects/Big%20Idea.md#top)",
        )
        .unwrap();

        let outcome = crate::notes::rename_entry(&root, &target, "New Idea").unwrap();
        assert_eq!(
            content_of(&root, &a),
            "see [idea](projects/New%20Idea.md) and [alt](projects/New%20Idea.md#top)"
        );
        assert_eq!(outcome.rewrites.len(), 1);
        assert_eq!(outcome.rewrites[0].from, target);
        assert_eq!(outcome.rewrites[0].to, outcome.next);
        assert_eq!(outcome.files, vec![a.clone()]);
    }

    #[test]
    fn moves_rewrite_links_from_anywhere() {
        let root = setup();
        create_folder(&root, "", "projects").unwrap();
        create_folder(&root, "", "archive").unwrap();
        let target = create_note(&root, "projects", "Idea").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(&root, &a, "[x](projects/Idea.md) [[projects/Idea]]").unwrap();

        let outcome = crate::notes::move_entry(&root, &target, "archive").unwrap();
        assert_eq!(
            content_of(&root, &a),
            "[x](archive/Idea.md) [[archive/Idea]]"
        );
        assert_eq!(outcome.rewrites[0].from, "projects/Idea.md");
        assert_eq!(outcome.rewrites[0].to, outcome.next);
    }

    #[test]
    fn folder_moves_rewrite_prefixes_inside_and_outside() {
        let root = setup();
        create_folder(&root, "", "projects").unwrap();
        create_folder(&root, "projects", "sub").unwrap();
        let a = create_note(&root, "projects", "Alpha").unwrap();
        let b = create_note(&root, "projects/sub", "Beta").unwrap();
        let outside = create_note(&root, "", "Journal").unwrap();
        write_note(
            &root,
            &outside,
            "[a](projects/Alpha.md) [b](projects/sub/Beta.md) ![pic](projects/pic.png)",
        )
        .unwrap();
        write_note(&root, &a, "[sibling](projects/sub/Beta.md)").unwrap();
        write_note(&root, &b, "[back](../Journal.md) [up](../../Outside.md)").unwrap();

        let outcome = crate::notes::rename_entry(&root, "projects", "work").unwrap();
        assert_eq!(
            content_of(&root, &outside),
            "[a](work/Alpha.md) [b](work/sub/Beta.md) ![pic](work/pic.png)"
        );
        assert_eq!(content_of(&root, "work/Alpha.md"), "[sibling](work/sub/Beta.md)");
        assert_eq!(content_of(&root, "work/sub/Beta.md"), "[back](../Journal.md) [up](../../Outside.md)");
        assert_eq!(outcome.rewrites.len(), 2); // Alpha + Beta
        assert!(outcome.files.contains(&outside));
        assert!(outcome.files.contains(&"work/Alpha.md".to_string()));
        // Beta only holds ../-relative links — vault-relative rewrites don't touch it.
        assert_eq!(outcome.files.len(), 2);
    }

    #[test]
    fn bare_wiki_names_follow_unambiguous_renames_only() {
        let root = setup();
        create_folder(&root, "", "projects").unwrap();
        let target = create_note(&root, "projects", "app").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        let b = create_note(&root, "", "Log").unwrap();
        write_note(&root, &a, "[[app]] [[app|alias]] [[projects/app]]").unwrap();
        write_note(&root, &b, "[[app]]").unwrap();

        crate::notes::rename_entry(&root, &target, "renamed app").unwrap();
        assert_eq!(
            content_of(&root, &a),
            "[[renamed app]] [[renamed app|alias]] [[projects/renamed app]]"
        );
        assert_eq!(content_of(&root, &b), "[[renamed app]]");
    }

    #[test]
    fn wiki_fragments_survive_renames() {
        let root = setup();
        create_folder(&root, "", "projects").unwrap();
        let target = create_note(&root, "projects", "app").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(&root, &a, "[[projects/app#概要]] [[projects/app#概要|别名]] [[app#概要]]").unwrap();

        crate::notes::rename_entry(&root, &target, "renamed").unwrap();
        assert_eq!(
            content_of(&root, &a),
            "[[projects/renamed#概要]] [[projects/renamed#概要|别名]] [[renamed#概要]]"
        );
    }

    #[test]
    fn ambiguous_bare_wiki_names_are_left_alone() {
        let root = setup();
        create_folder(&root, "", "projects").unwrap();
        create_folder(&root, "", "archive").unwrap();
        let target = create_note(&root, "projects", "app").unwrap();
        let twin = create_note(&root, "archive", "app").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(&root, &a, "[[app]]").unwrap();

        crate::notes::rename_entry(&root, &target, "renamed").unwrap();
        assert_eq!(content_of(&root, &a), "[[app]]");
        let _ = twin;
    }

    #[test]
    fn frontmatter_is_preserved_verbatim() {
        let root = setup();
        let target = create_note(&root, "", "Idea").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(
            &root,
            &a,
            "---\ntitle: [x](Idea.md)\nref: Idea.md\n---\n[link](Idea.md)",
        )
        .unwrap();

        let next = crate::notes::rename_entry(&root, &target, "New Idea").unwrap().next;
        rewrite_after_move(&root, &target, &next).unwrap();
        assert_eq!(
            content_of(&root, &a),
            "---\ntitle: [x](Idea.md)\nref: Idea.md\n---\n[link](New%20Idea.md)"
        );
    }

    #[test]
    fn encoded_cjk_hrefs_are_repointed_and_reencoded() {
        let root = setup();
        create_folder(&root, "", "40-职业").unwrap();
        let target = create_note(&root, "40-职业", "面试").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(
            &root,
            &a,
            "[x](40-%E8%81%8C%E4%B8%9A/%E9%9D%A2%E8%AF%95.md)",
        )
        .unwrap();

        crate::notes::rename_entry(&root, &target, "笔试").unwrap();
        assert_eq!(
            content_of(&root, &a),
            "[x](40-%E8%81%8C%E4%B8%9A/%E7%AC%94%E8%AF%95.md)"
        );
    }

    #[test]
    fn external_links_and_fragments_are_untouched() {
        let root = setup();
        let target = create_note(&root, "", "Idea").unwrap();
        let a = create_note(&root, "", "Journal").unwrap();
        write_note(
            &root,
            &a,
            "[web](https://x/Idea.md) [mail](mailto:Idea.md) [frag](Idea.md#top) [q](Idea.md?v=2) [other](Stuff.md)",
        )
        .unwrap();
        let stuff = create_note(&root, "", "Stuff").unwrap();

        let next = crate::notes::rename_entry(&root, &target, "New Idea").unwrap().next;
        rewrite_after_move(&root, &target, &next).unwrap();
        assert_eq!(
            content_of(&root, &a),
            "[web](https://x/Idea.md) [mail](mailto:Idea.md) [frag](New%20Idea.md#top) [q](New%20Idea.md?v=2) [other](Stuff.md)"
        );
        let _ = stuff;
    }

    #[test]
    fn split_frontmatter_mirrors_the_frontend() {
        assert_eq!(split_frontmatter("body only"), ("", "body only"));
        assert_eq!(
            split_frontmatter("---\na: b\n---\nbody"),
            ("---\na: b\n---\n", "body")
        );
        assert_eq!(split_frontmatter("---\na: b\n---"), ("---\na: b\n---", ""));
        // A `---` line directly under the opener is body, matching the regex.
        assert_eq!(split_frontmatter("---\n---\nbody"), ("", "---\n---\nbody"));
        assert_eq!(split_frontmatter("---\nunterminated"), ("", "---\nunterminated"));
    }

    #[test]
    fn rel_to_href_matches_the_frontend_encoder() {
        assert_eq!(rel_to_href("projects/New Idea.md"), "projects/New%20Idea.md");
        assert_eq!(
            rel_to_href("40-职业/笔试.md"),
            "40-%E8%81%8C%E4%B8%9A/%E7%AC%94%E8%AF%95.md"
        );
        assert_eq!(
            rel_to_href("Lua 速查 (面试).md"),
            "Lua%20%E9%80%9F%E6%9F%A5%20(%E9%9D%A2%E8%AF%95).md"
        );
    }
}

