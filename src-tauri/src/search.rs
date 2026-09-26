use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::AppResult;
use crate::vault::{notes_root, rel_of};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchHit {
    pub rel: String,
    pub title: String,
    pub snippet: String,
    /// True when at least one term matched the title.
    pub title_match: bool,
    /// First term that matched (the UI uses it to reveal the hit in the note).
    pub term: String,
    /// Ranking tier, lower is better: 0 = every term in the title, 1 = every
    /// term matched with title involvement, 2 = content-only matches.
    #[serde(skip)]
    tier: u8,
}

const SNIPPET_RADIUS: usize = 60;

/// Case-insensitive multi-term search across note titles and contents. Terms
/// are whitespace-separated and every term must match somewhere (intersect),
/// so `todo list` finds notes containing both words in any order.
pub fn search_notes(root: &Path, query: &str, limit: usize) -> AppResult<Vec<SearchHit>> {
    let mut seen = std::collections::HashSet::new();
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|term| term.to_lowercase())
        .filter(|term| !term.is_empty() && seen.insert(term.clone()))
        .collect();
    if terms.is_empty() {
        return Ok(Vec::new());
    }
    let mut hits: Vec<SearchHit> = Vec::new();
    walk(root, &notes_root(root), &terms, &mut hits)?;
    hits.sort_by(|a, b| {
        a.tier
            .cmp(&b.tier)
            .then_with(|| a.title.to_lowercase().cmp(&b.title.to_lowercase()))
    });
    hits.truncate(limit);
    Ok(hits)
}

fn walk(root: &Path, dir: &Path, terms: &[String], hits: &mut Vec<SearchHit>) -> AppResult<()> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Ok(());
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        if name.starts_with('.') {
            continue;
        }
        if path.is_dir() {
            walk(root, &path, terms, hits)?;
            continue;
        }
        if path.extension().is_none_or(|e| e != "md") {
            continue;
        }
        let title = path
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_default();
        let rel = rel_of(root, &path)?;
        let content = fs::read_to_string(&path).unwrap_or_default();
        let title_lower = title.to_lowercase();
        let content_lower = content.to_lowercase();

        // Every term must match somewhere; remember where terms landed.
        let mut in_title = 0usize;
        let mut all_matched = true;
        let mut first_term: Option<&String> = None;
        let mut first_content_term: Option<&String> = None;
        for term in terms {
            let title_hit = title_lower.contains(term.as_str());
            let content_hit = content_lower.contains(term.as_str());
            if title_hit {
                in_title += 1;
            }
            if !title_hit && !content_hit {
                all_matched = false;
                break;
            }
            if first_term.is_none() {
                first_term = Some(term);
            }
            if content_hit && first_content_term.is_none() {
                first_content_term = Some(term);
            }
        }
        if !all_matched {
            continue;
        }
        let tier = if in_title == terms.len() {
            0
        } else if in_title > 0 {
            1
        } else {
            2
        };
        hits.push(SearchHit {
            snippet: match first_content_term {
                Some(term) => snippet(&content, term),
                None => snippet(&content, first_term.expect("all_matched implies a term")),
            },
            rel,
            title,
            title_match: in_title > 0,
            term: first_term.expect("all_matched implies a term").clone(),
            tier,
        });
    }
    Ok(())
}

fn snippet(content: &str, needle: &str) -> String {
    match find_ignore_case(content, needle) {
        Some((start, end)) => snippet_at(content, start, end),
        None => content.chars().take(SNIPPET_RADIUS * 2).collect(),
    }
}

/// Byte range of `needle` in `content`, compared case-insensitively.
/// The range stays on original char boundaries: lowercasing that changes
/// width (`İ`, `ﬁ`) must not be used as an index into `content`.
fn find_ignore_case(content: &str, needle: &str) -> Option<(usize, usize)> {
    if needle.is_empty() {
        return None;
    }
    let needle = needle.to_lowercase();
    let start = content.to_lowercase().find(&needle)?;
    map_lower_span(content, start, needle.len())
}

/// Map a byte span in `content.to_lowercase()` back onto `content`.
fn map_lower_span(content: &str, lower_start: usize, lower_len: usize) -> Option<(usize, usize)> {
    let lower_end = lower_start + lower_len;
    let mut orig = 0usize;
    let mut lower_at = 0usize;
    let mut start_orig = None;
    for ch in content.chars() {
        let next_orig = orig + ch.len_utf8();
        let next_lower = lower_at + ch.to_lowercase().to_string().len();
        if start_orig.is_none() && next_lower > lower_start {
            start_orig = Some(orig);
        }
        if next_lower >= lower_end {
            return Some((start_orig.unwrap_or(orig), next_orig));
        }
        orig = next_orig;
        lower_at = next_lower;
    }
    None
}

fn snippet_at(content: &str, byte_start: usize, byte_end: usize) -> String {
    let chars: Vec<char> = content.chars().collect();
    let char_pos = content[..byte_start].chars().count();
    let match_chars = content[byte_start..byte_end].chars().count();
    let start = char_pos.saturating_sub(SNIPPET_RADIUS);
    let end = (char_pos + match_chars + SNIPPET_RADIUS).min(chars.len());
    let mut out: String = chars[start..end].iter().collect();
    out = out.replace('\n', " ").trim().to_string();
    if start > 0 {
        out = format!("…{out}");
    }
    if end < chars.len() {
        out = format!("{out}…");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn title_hits_rank_first() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let a = create_note(dir.path(), "", "apple pie").unwrap();
        write_note(dir.path(), &a, "crust and filling").unwrap();
        let b = create_note(dir.path(), "", "groceries").unwrap();
        write_note(dir.path(), &b, "buy apple and milk").unwrap();

        let hits = search_notes(dir.path(), "apple", 10).unwrap();
        assert_eq!(hits.len(), 2);
        assert!(hits[0].title_match);
        assert_eq!(hits[0].title, "apple pie");
        assert!(hits[1].snippet.contains("apple"));
        assert_eq!(hits[1].term, "apple");
    }

    #[test]
    fn multi_term_queries_intersect_across_title_and_content() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let both_title = create_note(dir.path(), "", "apple pie").unwrap();
        write_note(&dir.path(), &both_title, "sweet dessert").unwrap();
        let split = create_note(dir.path(), "", "recipes").unwrap();
        write_note(dir.path(), &split, "an apple and a pie chart").unwrap();
        let partial = create_note(dir.path(), "", "basket").unwrap();
        write_note(dir.path(), &partial, "just an apple here").unwrap();

        let hits = search_notes(dir.path(), "apple pie", 10).unwrap();
        assert_eq!(hits.len(), 2);
        // Both terms in the title beats one title + one content match.
        assert_eq!(hits[0].title, "apple pie");
        assert_eq!(hits[1].title, "recipes");
        assert_eq!(hits[1].term, "apple");
        assert!(hits[1].snippet.contains("apple"));
    }

    #[test]
    fn chinese_terms_match_by_substring() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let a = create_note(dir.path(), "", "工作计划").unwrap();
        write_note(dir.path(), &a, "本周重点：完成搜索功能").unwrap();

        let hits = search_notes(dir.path(), "搜索", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].rel, a);
        assert_eq!(hits[0].term, "搜索");
    }

    #[test]
    fn missing_term_excludes_the_note() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let a = create_note(dir.path(), "", "apple pie").unwrap();
        write_note(dir.path(), &a, "sweet dessert").unwrap();

        let hits = search_notes(dir.path(), "apple rhubarb", 10).unwrap();
        assert!(hits.is_empty());
    }

    #[test]
    fn empty_query_returns_nothing() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        assert!(search_notes(dir.path(), "  ", 10).unwrap().is_empty());
    }

    #[test]
    fn unicode_snippet_no_panic() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let a = create_note(dir.path(), "", "emoji").unwrap();
        write_note(dir.path(), &a, "🎉🎉🎉 find ünïcode here 🎉🎉🎉").unwrap();
        let hits = search_notes(dir.path(), "ünïcode", 10).unwrap();
        assert_eq!(hits.len(), 1);
    }

    #[test]
    fn casefold_that_changes_width_does_not_panic() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let a = create_note(dir.path(), "", "letters").unwrap();
        // İ lowercases to two chars; ﬁ lowercases to a shorter "fi".
        let body = format!("{}找到了 ﬁnd needle", "İ".repeat(10));
        write_note(dir.path(), &a, &body).unwrap();
        let hits = search_notes(dir.path(), "找到了", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("找到了"));
        let hits = search_notes(dir.path(), "needle", 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains("needle"));
    }

    #[test]
    fn cjk_snippet_window_counts_chars() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let a = create_note(dir.path(), "", "长").unwrap();
        let word = "编".repeat(20);
        let body = format!("{}{word}{}MARKER", "啊".repeat(10), "呀".repeat(70));
        write_note(dir.path(), &a, &body).unwrap();
        let hits = search_notes(dir.path(), &word, 10).unwrap();
        assert_eq!(hits.len(), 1);
        assert!(hits[0].snippet.contains('编'));
        assert!(!hits[0].snippet.contains("MARKER"));
    }
}
