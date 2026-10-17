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

mod scan;
#[cfg(test)]
mod tests;

use scan::{scan_hrefs, scan_wikis, split_frontmatter};

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
    edits.sort_by_key(|a| std::cmp::Reverse(a.0));
    let mut out = body.to_string();
    for (start, end, text) in edits {
        out.replace_range(start..end, &text);
    }
    Some(format!("{frontmatter}{out}"))
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
