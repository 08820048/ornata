//! Issues are plain task-list lines. The box carries the status (`[ ]` todo,
//! `[/]` doing, `[x]` done, `[-]` canceled); inline tokens carry the rest —
//! `#tag`, `!urgent|!high|!medium|!low`, `@YYYY-MM-DD`. The nearest heading
//! above (below the H1) is the milestone, and plain bullets indented under a
//! task are its decision notes. Nothing is stored anywhere but the line.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::notes::{read_note, write_note};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IssueStatus {
    Todo,
    Doing,
    Done,
    Canceled,
}

impl IssueStatus {
    fn mark(self) -> &'static str {
        match self {
            Self::Todo => "[ ]",
            Self::Doing => "[/]",
            Self::Done => "[x]",
            Self::Canceled => "[-]",
        }
    }

    fn from_mark(mark: &str) -> Option<Self> {
        match mark {
            "[ ]" => Some(Self::Todo),
            "[/]" => Some(Self::Doing),
            "[x]" | "[X]" => Some(Self::Done),
            "[-]" => Some(Self::Canceled),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Priority {
    Urgent,
    High,
    Medium,
    Low,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    /// The note holding the line.
    pub rel: String,
    /// Zero-based line index in the note file.
    pub line: usize,
    /// Everything after the box, as written — the guard for edits.
    pub text: String,
    /// `text` minus the inline tokens.
    pub title: String,
    pub status: IssueStatus,
    pub priority: Option<Priority>,
    pub due: Option<String>,
    pub tags: Vec<String>,
    pub milestone: Option<String>,
    /// Plain bullets indented under the task (decision notes).
    pub notes: Vec<String>,
    /// Nesting level among tasks (0 = top level).
    pub depth: usize,
}

/// A task line split up: indent width, byte offset of the box, status, text.
struct TaskLine<'a> {
    indent: usize,
    box_at: usize,
    status: IssueStatus,
    text: &'a str,
}

fn list_body(line: &str) -> Option<(usize, usize, &str)> {
    let indent = line.len() - line.trim_start().len();
    let rest = &line[indent..];
    let body = rest
        .strip_prefix("- ")
        .or_else(|| rest.strip_prefix("* "))
        .or_else(|| rest.strip_prefix("+ "))?;
    Some((indent, line.len() - body.len(), body))
}

fn task_line(line: &str) -> Option<TaskLine<'_>> {
    let (indent, box_at, body) = list_body(line)?;
    let status = IssueStatus::from_mark(body.get(..3)?)?;
    let text = body[3..].strip_prefix(' ')?.trim_end_matches('\r').trim();
    (!text.is_empty()).then_some(TaskLine { indent, box_at, status, text })
}

fn heading(line: &str) -> Option<(usize, &str)> {
    let level = line.chars().take_while(|c| *c == '#').count();
    if !(1..=6).contains(&level) {
        return None;
    }
    let text = line[level..].strip_prefix(' ')?.trim().trim_end_matches('#').trim();
    Some((level, text))
}

fn word_char(c: char) -> bool {
    c.is_alphanumeric() || matches!(c, '_' | '-' | '/')
}

fn is_date(s: &str) -> bool {
    let b = s.as_bytes();
    b.len() == 10
        && b[4] == b'-'
        && b[7] == b'-'
        && b.iter().enumerate().all(|(i, c)| i == 4 || i == 7 || c.is_ascii_digit())
}

struct Tokens {
    title: String,
    priority: Option<Priority>,
    due: Option<String>,
    tags: Vec<String>,
}

fn tokens(text: &str) -> Tokens {
    let mut out = Tokens { title: String::new(), priority: None, due: None, tags: Vec::new() };
    let mut kept: Vec<&str> = Vec::new();
    for word in text.split_whitespace() {
        let lower = word.to_lowercase();
        let priority = match lower.as_str() {
            "!urgent" => Some(Priority::Urgent),
            "!high" => Some(Priority::High),
            "!medium" | "!med" => Some(Priority::Medium),
            "!low" => Some(Priority::Low),
            _ => None,
        };
        if priority.is_some() {
            out.priority = out.priority.or(priority);
            continue;
        }
        if let Some(date) = word.strip_prefix('@').filter(|d| is_date(d)) {
            out.due.get_or_insert_with(|| date.to_string());
            continue;
        }
        if let Some(tag) = word.strip_prefix('#') {
            let name = tag.trim_end_matches(|c: char| !word_char(c) || matches!(c, '-' | '/' | '_'));
            if !name.is_empty() && name.chars().all(word_char) {
                out.tags.push(name.to_lowercase());
                continue;
            }
        }
        kept.push(word);
    }
    out.title = kept.join(" ");
    out
}

/// Every task line in `content` (outside fenced code) as an issue.
pub fn parse_issues(rel: &str, content: &str) -> Vec<Issue> {
    let mut issues: Vec<Issue> = Vec::new();
    // Open tasks by indent, innermost last: (indent, index into `issues`).
    let mut stack: Vec<(usize, usize)> = Vec::new();
    let mut milestone: Option<String> = None;
    let mut fenced = false;
    for (line, raw) in content.split('\n').enumerate() {
        let trimmed = raw.trim_start();
        if trimmed.starts_with("```") || trimmed.starts_with("~~~") {
            fenced = !fenced;
            continue;
        }
        if fenced || trimmed.is_empty() {
            continue;
        }
        if let Some((level, text)) = heading(raw) {
            stack.clear();
            if level > 1 {
                milestone = (!text.is_empty()).then(|| text.to_string());
            }
            continue;
        }
        if let Some(task) = task_line(raw) {
            stack.retain(|(indent, _)| *indent < task.indent);
            let t = tokens(task.text);
            issues.push(Issue {
                rel: rel.to_string(),
                line,
                text: task.text.to_string(),
                title: t.title,
                status: task.status,
                priority: t.priority,
                due: t.due,
                tags: t.tags,
                milestone: milestone.clone(),
                notes: Vec::new(),
                depth: stack.len(),
            });
            stack.push((task.indent, issues.len() - 1));
            continue;
        }
        if let Some((indent, _, body)) = list_body(raw) {
            stack.retain(|(open, _)| *open < indent);
            if let Some((_, index)) = stack.last() {
                let note = body.trim_end_matches('\r').trim();
                if !note.is_empty() {
                    issues[*index].notes.push(note.to_string());
                }
            }
            continue;
        }
        // Unindented prose ends any open task; indented text continues it.
        if raw.len() == trimmed.len() {
            stack.clear();
        }
    }
    issues
}

/// Rewrite the box of the task at `line` to `status`, provided the line still
/// reads `text` — guards against the note changing since it was listed.
pub fn set_issue_status(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    status: IssueStatus,
) -> AppResult<()> {
    let content = read_note(root, rel)?;
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let gone = || AppError::InvalidInput("task no longer exists".into());
    let current = lines.get(line).ok_or_else(gone)?;
    let task = task_line(current).filter(|t| t.text == text).ok_or_else(gone)?;
    if task.status == status {
        return Ok(());
    }
    let at = task.box_at;
    let next = format!("{}{}{}", &current[..at], status.mark(), &current[at + 3..]);
    lines[line] = next;
    write_note(root, rel, &lines.join("\n"))
}

/// Swap the text after the box of the task at `line` for `new_text`, provided
/// the line still reads `text`.
pub fn replace_issue_text(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    new_text: &str,
) -> AppResult<()> {
    let new_text = new_text.trim();
    if new_text.is_empty() || new_text.contains('\n') {
        return Err(AppError::InvalidInput("invalid task text".into()));
    }
    let content = read_note(root, rel)?;
    let mut lines: Vec<String> = content.split('\n').map(str::to_string).collect();
    let gone = || AppError::InvalidInput("task no longer exists".into());
    let current = lines.get(line).ok_or_else(gone)?;
    let task = task_line(current).filter(|t| t.text == text).ok_or_else(gone)?;
    let cr = if current.ends_with('\r') { "\r" } else { "" };
    lines[line] = format!("{} {new_text}{cr}", &current[..task.box_at + 3]);
    write_note(root, rel, &lines.join("\n"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::create_note;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn parses_status_tokens_milestones_and_notes() {
        let md = "# Plan\n- [ ] Loose\n## V1\n- [ ] Fix graph #Bug !high @2026-11-01\n  - decided: keep it\n  - [/] Sub task\n    - inner note\n- [x] Shipped\n- [-] Dropped\n```\n- [ ] code\n```\n## V2\n* [X] Later\nprose\n  - stray\n";
        let issues = parse_issues("p.md", md);
        let summary: Vec<_> = issues
            .iter()
            .map(|i| (i.line, i.title.as_str(), i.status, i.milestone.as_deref(), i.depth))
            .collect();
        assert_eq!(
            summary,
            [
                (1, "Loose", IssueStatus::Todo, None, 0),
                (3, "Fix graph", IssueStatus::Todo, Some("V1"), 0),
                (5, "Sub task", IssueStatus::Doing, Some("V1"), 1),
                (7, "Shipped", IssueStatus::Done, Some("V1"), 0),
                (8, "Dropped", IssueStatus::Canceled, Some("V1"), 0),
                (13, "Later", IssueStatus::Done, Some("V2"), 0),
            ]
        );
        let fix = &issues[1];
        assert_eq!(fix.tags, ["bug"]);
        assert_eq!(fix.priority, Some(Priority::High));
        assert_eq!(fix.due.as_deref(), Some("2026-11-01"));
        assert_eq!(fix.notes, ["decided: keep it"]);
        assert_eq!(issues[2].notes, ["inner note"]);
        assert!(issues[5].notes.is_empty());
    }

    #[test]
    fn ignores_non_tasks_and_bad_tokens() {
        let issues = parse_issues("p.md", "- [ ]\n- [?] odd\n- [ ] mail @someone #1x !nope\n");
        assert_eq!(issues.len(), 1);
        assert_eq!(issues[0].title, "mail @someone !nope");
        assert_eq!(issues[0].tags, ["1x"]);
        assert_eq!(issues[0].due, None);
    }

    #[test]
    fn replaces_text_only_when_line_matches() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(root, &rel, "- [/] Draft #a\r\n  - keep\n").unwrap();
        assert!(replace_issue_text(root, &rel, 0, "Other", "x").is_err());
        assert!(replace_issue_text(root, &rel, 0, "Draft #a", "a\nb").is_err());
        replace_issue_text(root, &rel, 0, "Draft #a", "[Draft](issues/Draft.md) #a").unwrap();
        assert_eq!(
            read_note(root, &rel).unwrap(),
            "- [/] [Draft](issues/Draft.md) #a\r\n  - keep\n"
        );
    }

    #[test]
    fn sets_status_only_when_line_matches() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(root, &rel, "- [ ] Draft\r\n  * [x] Nested\n").unwrap();
        assert!(set_issue_status(root, &rel, 0, "Other", IssueStatus::Done).is_err());
        set_issue_status(root, &rel, 0, "Draft", IssueStatus::Doing).unwrap();
        set_issue_status(root, &rel, 1, "Nested", IssueStatus::Canceled).unwrap();
        assert_eq!(read_note(root, &rel).unwrap(), "- [/] Draft\r\n  * [-] Nested\n");
        set_issue_status(root, &rel, 0, "Draft", IssueStatus::Todo).unwrap();
        assert_eq!(read_note(root, &rel).unwrap(), "- [ ] Draft\r\n  * [-] Nested\n");
    }
}
