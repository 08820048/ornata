//! Tag collection across the vault.
//!
//! Tags come from two places, both read-only: `#tag` tokens in note bodies
//! (fenced code blocks excluded) and a `tags:` key in frontmatter (inline
//! list or `- item` lines — the same shapes the frontend's frontmatter
//! parser accepts). The app never writes frontmatter or rewrites tags.

use std::collections::HashMap;
use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;
use crate::vault::{notes_root, rel_of};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagCount {
    pub tag: String,
    pub count: usize,
}

/// Tags sorted by usage count, then name.
pub fn list_tags(root: &Path) -> AppResult<Vec<TagCount>> {
    let mut counts: HashMap<String, usize> = HashMap::new();
    collect(root, &notes_root(root), &mut |_, tags| {
        for tag in tags {
            *counts.entry(tag.to_string()).or_insert(0) += 1;
        }
    })?;
    let mut list: Vec<TagCount> = counts
        .into_iter()
        .map(|(tag, count)| TagCount { tag, count })
        .collect();
    list.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.tag.cmp(&b.tag)));
    Ok(list)
}

/// Rels of notes carrying `tag` (case-insensitive), sorted by rel.
pub fn notes_with_tag(root: &Path, tag: &str) -> AppResult<Vec<String>> {
    let needle = tag.to_lowercase();
    let mut rels: Vec<String> = Vec::new();
    collect(root, &notes_root(root), &mut |rel, tags| {
        if tags.iter().any(|candidate| candidate == &needle) {
            rels.push(rel.to_string());
        }
    })?;
    rels.sort();
    Ok(rels)
}

fn collect(
    root: &Path,
    dir: &Path,
    visit: &mut dyn FnMut(&str, &Vec<String>),
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
            collect(root, &path, visit)?;
            continue;
        }
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let rel = rel_of(root, &path)?;
        let content = fs::read_to_string(&path).unwrap_or_default();
        let tags = extract_tags(&content);
        visit(&rel, &tags);
    }
    Ok(())
}

/// Lowercased tags on one note, deduplicated.
fn extract_tags(content: &str) -> Vec<String> {
    let mut tags: Vec<String> = Vec::new();
    let mut push = |tag: String| {
        let tag = tag.to_lowercase();
        if !tag.is_empty() && !tags.contains(&tag) {
            tags.push(tag);
        }
    };
    for tag in frontmatter_tags(content) {
        push(tag);
    }
    for tag in body_tags(content) {
        push(tag);
    }
    tags
}

/// `tags:` in the frontmatter block: `tags: [a, b]`, `tags: a, b`, or a
/// `- item` list under `tags:`. Minimal on purpose — read-only, never authored.
fn frontmatter_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut lines = content.lines();
    let Some(first) = lines.next() else {
        return tags;
    };
    if first.trim_end() != "---" {
        return tags;
    }
    let mut in_tags = false;
    for line in lines {
        let trimmed = line.trim();
        if trimmed == "---" {
            break;
        }
        if let Some(rest) = trimmed.strip_prefix("tags:") {
            let rest = rest.trim();
            in_tags = rest.is_empty();
            if !in_tags {
                let cleaned = rest
                    .trim_start_matches('[')
                    .trim_end_matches(']');
                for item in cleaned.split(',') {
                    push_tag_token(&mut tags, item);
                }
            }
            continue;
        }
        if in_tags {
            if let Some(item) = trimmed.strip_prefix("- ") {
                push_tag_token(&mut tags, item);
            } else if !trimmed.is_empty() {
                in_tags = false;
            }
        }
    }
    tags
}

fn push_tag_token(tags: &mut Vec<String>, token: &str) {
    let token = token.trim().trim_matches(['"', '\'']);
    if !token.is_empty() {
        tags.push(token.to_lowercase());
    }
}

/// `#tag` tokens in the body, skipping fenced code blocks. A tag is `#`
/// followed by word characters (unicode letters, digits, `_`, `-`, `/`);
/// a `#` followed by whitespace (like headings) is not a tag.
fn body_tags(content: &str) -> Vec<String> {
    let mut tags = Vec::new();
    let mut in_fence = false;
    for line in content.lines() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            in_fence = !in_fence;
            continue;
        }
        if in_fence {
            continue;
        }
        let chars: Vec<char> = line.chars().collect();
        let mut index = 0;
        while index < chars.len() {
            if chars[index] != '#' {
                index += 1;
                continue;
            }
            // Heading markers ("# ", "## ") are not tags; a `#` right after
            // a word character belongs to the previous token.
            let prev_word = index > 0 && word_char(chars[index - 1]);
            let next = chars.get(index + 1);
            if prev_word || !next.is_some_and(|c| word_char(*c)) {
                index += 1;
                continue;
            }
            let start = index + 1;
            let mut end = start;
            while end < chars.len() && word_char(chars[end]) {
                end += 1;
            }
            while end > start && matches!(chars[end - 1], '-' | '/' | '_') {
                end -= 1;
            }
            if end > start {
                let tag: String = chars[start..end].iter().collect();
                tags.push(tag.to_lowercase());
            }
            index = end;
        }
    }
    tags
}

fn word_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    fn tags_of(content: &str) -> Vec<String> {
        extract_tags(content)
    }

    #[test]
    fn collects_body_and_frontmatter_tags() {
        let content = "---\ntags: [Work, Ideas]\n---\n# Header\nbody #work and #中文/项目 here — #done!";
        let tags = tags_of(content);
        // Headings ("# Header") are not tags; inline-code spans are accepted
        // noise for a lightweight scanner.
        assert_eq!(tags, vec!["work", "ideas", "中文/项目", "done"]);
    }

    #[test]
    fn fenced_code_blocks_are_skipped() {
        let content = "real #tag\n```md\n#fake in fence\n```\nalso #real2";
        let tags = tags_of(content);
        assert_eq!(tags, vec!["tag", "real2"]);
    }

    #[test]
    fn yaml_list_form_is_parsed() {
        let content = "---\ntags:\n  - alpha\n  - beta-2\nother: x\n---\n";
        assert_eq!(tags_of(content), vec!["alpha", "beta-2"]);
    }

    #[test]
    fn trailing_punctuation_does_not_join_the_tag() {
        assert_eq!(tags_of("look at #work, then #home."), vec!["work", "home"]);
    }

    #[test]
    fn vault_listing_counts_and_filters() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        create_folder(root, "", "projects").unwrap();
        let a = create_note(root, "", "One").unwrap();
        write_note(root, &a, "#alpha #beta").unwrap();
        let b = create_note(root, "projects", "Two").unwrap();
        write_note(root, &b, "---\ntags: [alpha]\n---\ntext").unwrap();

        let tags = list_tags(root).unwrap();
        assert_eq!(tags[0].tag, "alpha");
        assert_eq!(tags[0].count, 2);
        assert_eq!(tags[1].tag, "beta");

        let rels = notes_with_tag(root, "ALPHA").unwrap();
        assert_eq!(rels, vec!["One.md", "projects/Two.md"]);
        let _ = b;
    }
}
