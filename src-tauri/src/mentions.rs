use std::fs;
use std::ops::Range;
use std::path::Path;

use serde::Serialize;

use crate::backlinks::{snippet, strip_md};
use crate::error::{AppError, AppResult};
use crate::notes::{read_note, write_note};
use crate::vault::{note_files, rel_of};

/// A note that mentions another note's title in plain text without linking.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Mention {
    pub rel: String,
    pub title: String,
    /// The first few mentioning lines.
    pub lines: Vec<MentionLine>,
    /// Total number of mentioning lines.
    pub count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MentionLine {
    /// Zero-based line index in the note file.
    pub line: usize,
    /// Display snippet (raw markdown, list markers trimmed). Also the guard
    /// `link_mention` checks so a stale list never rewrites the wrong line.
    pub text: String,
}

const LINES_PER_NOTE: usize = 5;
/// Shorter titles ("a", "x") would match almost everywhere.
const MIN_TITLE_CHARS: usize = 2;

/// Notes whose prose mentions `target`'s title outside any link, inline code
/// or URL (case-insensitive; whole words for Latin titles), sorted by title.
pub fn unlinked_mentions(root: &Path, target: &str) -> AppResult<Vec<Mention>> {
    let title = title_of(target);
    if title.chars().count() < MIN_TITLE_CHARS {
        return Ok(Vec::new());
    }
    let target_key = strip_md(target).to_lowercase();
    let mut hits = Vec::new();
    for path in note_files(root) {
        let rel = rel_of(root, &path)?;
        if strip_md(&rel).to_lowercase() == target_key {
            continue;
        }
        let content = fs::read_to_string(&path).unwrap_or_default();
        let lines: Vec<MentionLine> = prose_lines(&content)
            .filter(|(_, line)| find_unlinked(line, &title).is_some())
            .map(|(line, text)| MentionLine {
                line,
                text: snippet(text),
            })
            .collect();
        if lines.is_empty() {
            continue;
        }
        let count = lines.len();
        hits.push(Mention {
            title: title_of(&rel),
            rel,
            lines: lines.into_iter().take(LINES_PER_NOTE).collect(),
            count,
        });
    }
    hits.sort_by_key(|hit| hit.title.to_lowercase());
    Ok(hits)
}

/// Turn the first unlinked mention of `target`'s title on `line` of `rel`
/// into `[mention](href)`, keeping the mention's original casing. Fails if
/// the line no longer reads `text` or no longer holds an unlinked mention.
pub fn link_mention(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    target: &str,
    href: &str,
) -> AppResult<()> {
    if href.trim().is_empty() || href.contains(['\n', '\r']) {
        return Err(AppError::InvalidInput("invalid link target".into()));
    }
    let stale = || AppError::InvalidInput("the mention has changed since it was listed".into());
    let content = read_note(root, rel)?;
    if !prose_lines(&content).any(|(index, raw)| index == line && snippet(raw) == text) {
        return Err(stale());
    }
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let current = &lines[line];
    let range = find_unlinked(current, &title_of(target)).ok_or_else(stale)?;
    let linked = format!(
        "{}[{}]({href}){}",
        &current[..range.start],
        &current[range.clone()],
        &current[range.end..]
    );
    lines[line] = linked;
    write_note(root, rel, &lines.join("\n"))
}

fn title_of(rel: &str) -> String {
    let stem = strip_md(rel);
    stem.rsplit('/').next().unwrap_or(stem).to_string()
}

/// `(index, line)` for lines outside a leading frontmatter block and fenced
/// code, with any trailing `\r` removed.
fn prose_lines(content: &str) -> impl Iterator<Item = (usize, &str)> {
    let mut in_front = content.split('\n').next().map(str::trim_end) == Some("---");
    let mut fenced = false;
    content.split('\n').enumerate().filter_map(move |(index, raw)| {
        let line = raw.trim_end_matches('\r');
        if in_front {
            if index > 0 && (line.trim_end() == "---" || line.trim_end() == "...") {
                in_front = false;
            }
            return None;
        }
        let trimmed = line.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fenced = !fenced;
            return None;
        }
        (!fenced).then_some((index, line))
    })
}

/// Byte range of the first mention of `title` in `line` that sits outside
/// links, inline code and bare URLs.
fn find_unlinked(line: &str, title: &str) -> Option<Range<usize>> {
    let masked = masked_ranges(line);
    let overlaps = |range: &Range<usize>| {
        masked
            .iter()
            .any(|m| range.start < m.end && m.start < range.end)
    };
    line.char_indices().find_map(|(start, _)| {
        let end = match_at(line, start, title)?;
        let range = start..end;
        (is_word_bounded(line, &range, title) && !overlaps(&range)).then_some(range)
    })
}

/// Case-insensitive match of `title` starting at byte `start`; returns the end.
fn match_at(line: &str, start: usize, title: &str) -> Option<usize> {
    let mut hay = line[start..].char_indices();
    let mut end = start;
    for wanted in title.chars() {
        let (offset, found) = hay.next()?;
        if found != wanted && !found.to_lowercase().eq(wanted.to_lowercase()) {
            return None;
        }
        end = start + offset + found.len_utf8();
    }
    Some(end)
}

/// Latin-edged titles must not be glued to other Latin letters/digits
/// ("Go" must not match "Google"); CJK text has no word spaces, so a CJK
/// edge needs no boundary.
fn is_word_bounded(line: &str, range: &Range<usize>, title: &str) -> bool {
    let glued = |edge: Option<char>, neighbor: Option<char>| {
        edge.is_some_and(|c| c.is_ascii_alphanumeric())
            && neighbor.is_some_and(|c| c.is_ascii_alphanumeric() || c == '_')
    };
    !glued(title.chars().next(), line[..range.start].chars().next_back())
        && !glued(title.chars().last(), line[range.end..].chars().next())
}

/// Regions where a title match must not count: `[text](href)`, `![alt](src)`,
/// `[[wiki]]`, `` `code` `` and bare http(s) URLs. The scanned delimiters are
/// ASCII, so every index is a char boundary.
fn masked_ranges(line: &str) -> Vec<Range<usize>> {
    let bytes = line.as_bytes();
    let mut out = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        let end = match bytes[i] {
            b'`' => {
                let run = bytes[i..].iter().take_while(|&&b| b == b'`').count();
                let fence = &line[i..i + run];
                line[i + run..].find(fence).map(|at| i + run + at + run)
            }
            b'[' => link_end(line, i),
            b'h' if line[i..].starts_with("http://") || line[i..].starts_with("https://") => {
                Some(line[i..].find(char::is_whitespace).map_or(line.len(), |at| i + at))
            }
            _ => None,
        };
        match end {
            Some(end) => {
                out.push(i..end);
                i = end;
            }
            None => i += 1,
        }
    }
    out
}

/// End (exclusive) of a `[[wiki]]` or `[text](href)` starting at `start`.
fn link_end(line: &str, start: usize) -> Option<usize> {
    if line[start..].starts_with("[[") {
        return line[start + 2..].find("]]").map(|at| start + 2 + at + 2);
    }
    let label_end = closing(line, start, b'[', b']')?;
    if line.as_bytes().get(label_end + 1) != Some(&b'(') {
        return None;
    }
    closing(line, label_end + 1, b'(', b')').map(|end| end + 1)
}

fn closing(line: &str, open: usize, left: u8, right: u8) -> Option<usize> {
    let mut depth = 0usize;
    for (offset, &byte) in line.as_bytes()[open..].iter().enumerate() {
        if byte == left {
            depth += 1;
        } else if byte == right {
            depth -= 1;
            if depth == 0 {
                return Some(open + offset);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn skips_links_code_and_urls() {
        let title = "面试宝典";
        assert_eq!(find_unlinked("复习面试宝典的内容", title), Some(6..18));
        assert_eq!(find_unlinked("[面试宝典](a/%E9.md)", title), None);
        assert_eq!(find_unlinked("[[面试宝典|别名]]", title), None);
        assert_eq!(find_unlinked("`面试宝典` and ![面试宝典](x.png)", title), None);
        assert_eq!(find_unlinked("https://x.test/面试宝典 page", title), None);
        // A linked mention does not hide a later plain one.
        assert_eq!(find_unlinked("[面试宝典](a.md) 与 面试宝典", title), Some(25..37));
    }

    #[test]
    fn latin_titles_match_whole_words_case_insensitively() {
        assert_eq!(find_unlinked("learn go today", "Go"), Some(6..8));
        assert_eq!(find_unlinked("Google it", "Go"), None);
        assert_eq!(find_unlinked("go_lang", "Go"), None);
        assert_eq!(find_unlinked("学习Go语言", "Go"), Some(6..8));
    }

    #[test]
    fn lists_mentions_outside_code_and_frontmatter() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        create_folder(root, "", "职业").unwrap();
        let target = create_note(root, "职业", "面试宝典").unwrap();
        let a = create_note(root, "", "Journal").unwrap();
        write_note(
            root,
            &a,
            "---\ntags: 面试宝典\n---\n- 今天看了面试宝典\n```\n面试宝典\n```\n[面试宝典](职业/%E9%9D%A2.md)",
        )
        .unwrap();
        let b = create_note(root, "", "Other").unwrap();
        write_note(root, &b, "nothing here").unwrap();
        write_note(root, &target, "面试宝典 self").unwrap();

        let hits = unlinked_mentions(root, &target).unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "Journal");
        assert_eq!(hits[0].count, 1);
        assert_eq!(hits[0].lines[0].line, 3);
        assert_eq!(hits[0].lines[0].text, "今天看了面试宝典");
    }

    #[test]
    fn links_a_mention_in_place() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let target = create_note(root, "", "Big Idea").unwrap();
        let a = create_note(root, "", "Log").unwrap();
        write_note(root, &a, "intro\r\n- the big idea, again\r\n").unwrap();

        link_mention(root, &a, 1, "the big idea, again", &target, "Big%20Idea.md").unwrap();
        assert_eq!(
            read_note(root, &a).unwrap(),
            "intro\r\n- the [big idea](Big%20Idea.md), again\r\n"
        );
        // Now linked: the same request is stale.
        assert!(link_mention(root, &a, 1, "the big idea, again", &target, "x.md").is_err());
        assert!(link_mention(root, &a, 9, "anything", &target, "x.md").is_err());
    }
}
