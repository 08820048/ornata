//! Issues are plain task-list lines. The box carries the status (`[ ]` todo,
//! `[/]` doing, `[x]` done, `[-]` canceled); inline tokens carry the rest —
//! `#tag`, `!urgent|!high|!medium|!low`, `@YYYY-MM-DD`. A heading ends any
//! open task, and plain bullets indented under a task are its decision notes. Nothing is stored anywhere but the line.

use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};
use crate::notes::{read_note, write_note, write_note_forced_snapshot};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum IssueStatus {
    Todo,
    Doing,
    Done,
    Canceled,
}

impl IssueStatus {
    pub fn mark(self) -> &'static str {
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

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
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
    /// Who is working on it: an inline `+name` token, set when an agent claims it.
    pub agent: Option<String>,
    /// Who finished it: an inline `✓by:name` token, left behind when a claimed task is marked done.
    pub done_by: Option<String>,
    /// When it was created, `YYYY-MM-DDTHH:MM` (inline `◷…`), if it was made through the app or an agent.
    pub created: Option<String>,
    /// When it was marked done or canceled (inline `✓…` / `✗…`); older lines carry only the day.
    pub closed: Option<String>,
    /// Plain bullets indented under the task (decision notes).
    pub notes: Vec<String>,
    /// Nesting level among tasks (0 = top level).
    pub depth: usize,
}

/// A task line split up: indent width, byte offset of the box, status, text.
pub(crate) struct TaskLine<'a> {
    pub(crate) indent: usize,
    box_at: usize,
    status: IssueStatus,
    pub(crate) text: &'a str,
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

pub(crate) fn task_line(line: &str) -> Option<TaskLine<'_>> {
    let (indent, box_at, body) = list_body(line)?;
    let status = IssueStatus::from_mark(body.get(..3)?)?;
    let text = body[3..].strip_prefix(' ')?.trim_end_matches('\r').trim();
    (!text.is_empty()).then_some(TaskLine { indent, box_at, status, text })
}

fn heading(line: &str) -> Option<()> {
    let level = line.chars().take_while(|c| *c == '#').count();
    ((1..=6).contains(&level) && line[level..].starts_with(' ')).then_some(())
}

/// `!urgent` `!high` `!medium` (or `!med`) `!low`, in any case.
fn priority_token(word: &str) -> Option<Priority> {
    match word.to_lowercase().as_str() {
        "!urgent" => Some(Priority::Urgent),
        "!high" => Some(Priority::High),
        "!medium" | "!med" => Some(Priority::Medium),
        "!low" => Some(Priority::Low),
        _ => None,
    }
}

impl Priority {
    fn token(self) -> &'static str {
        match self {
            Self::Urgent => "!urgent",
            Self::High => "!high",
            Self::Medium => "!medium",
            Self::Low => "!low",
        }
    }

    /// 0 for urgent down to 4 for none: the order issues are listed in.
    pub fn rank(priority: Option<Self>) -> u8 {
        priority.map_or(4, |p| p as u8)
    }
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
    agent: Option<String>,
    done_by: Option<String>,
    created: Option<String>,
    closed: Option<String>,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Stamp {
    Created,
    Done,
    Canceled,
}

impl Stamp {
    fn glyph(self) -> char {
        match self {
            Self::Created => '◷',
            Self::Done => '✓',
            Self::Canceled => '✗',
        }
    }

    /// The stamp that goes with a task that has just been marked `status`.
    fn closing(status: IssueStatus) -> Option<Self> {
        match status {
            IssueStatus::Done => Some(Self::Done),
            IssueStatus::Canceled => Some(Self::Canceled),
            _ => None,
        }
    }
}

/// `YYYY-MM-DD` or `YYYY-MM-DDTHH:MM`.
fn is_stamp_time(s: &str) -> bool {
    s.is_ascii()
        && match s.len() {
            10 => is_date(s),
            16 => {
                let b = s.as_bytes();
                is_date(&s[..10])
                    && b[10] == b'T'
                    && b[11..13].iter().chain(&b[14..16]).all(u8::is_ascii_digit)
                    && b[13] == b':'
            }
            _ => false,
        }
}

/// `◷2026-10-26T14:30` created, `✓…` done, `✗…` canceled.
fn stamp_token(word: &str) -> Option<(Stamp, &str)> {
    [Stamp::Created, Stamp::Done, Stamp::Canceled]
        .into_iter()
        .find_map(|kind| word.strip_prefix(kind.glyph()).filter(|t| is_stamp_time(t)).map(|t| (kind, t)))
}

fn is_closing_stamp(word: &str) -> bool {
    matches!(stamp_token(word), Some((Stamp::Done | Stamp::Canceled, _)))
}

/// Now, to the minute, in local time.
pub fn now_stamp() -> String {
    chrono::Local::now().format("%Y-%m-%dT%H:%M").to_string()
}

/// A new task line's text: `text` plus its creation time, and for a task
/// that starts out done or canceled the matching closing time too.
pub fn new_issue_text(text: &str, status: IssueStatus) -> String {
    let now = now_stamp();
    let mut out = format!("{} {}{now}", text.trim(), Stamp::Created.glyph());
    if let Some(closing) = Stamp::closing(status) {
        out.push_str(&format!(" {}{now}", closing.glyph()));
    }
    out
}

/// `text` as it should read once the task has become `status`: the closing
/// time of that status is kept if there already, added if not; the other
/// closing time goes; a claim goes unless the task is in progress, and becomes
/// `✓by:name` when the task is done (that token only stays while it is done).
fn restamped(text: &str, status: IssueStatus) -> String {
    let words: Vec<&str> = text.split_whitespace().collect();
    let finisher = (status == IssueStatus::Done).then(|| {
        words.iter().find_map(|w| agent_token(w).or_else(|| done_by_token(w))).map(|name| format!("{DONE_BY}{name}"))
    });
    let keep_closing = Stamp::closing(status).and_then(|want| {
        words.iter().find(|w| stamp_token(w).is_some_and(|(kind, _)| kind == want)).map(|w| w.to_string())
    });
    let mut out: Vec<String> = words
        .iter()
        .filter(|w| !is_closing_stamp(w))
        .filter(|w| done_by_token(w).is_none() && (status == IssueStatus::Doing || agent_token(w).is_none()))
        .map(|w| w.to_string())
        .collect();
    if let Some(closing) = Stamp::closing(status) {
        out.push(keep_closing.unwrap_or_else(|| format!("{}{}", closing.glyph(), now_stamp())));
    }
    out.extend(finisher.flatten());
    out.join(" ")
}

/// `+claude-code`: a plus, a letter, then word characters.
fn agent_token(word: &str) -> Option<&str> {
    let name = word.strip_prefix('+')?;
    let mut chars = name.chars();
    (chars.next()?.is_alphabetic() && chars.all(word_char)).then_some(name)
}

const DONE_BY: &str = "✓by:";

/// `✓by:claude-code`: who finished the task.
fn done_by_token(word: &str) -> Option<&str> {
    let name = word.strip_prefix(DONE_BY)?;
    let mut chars = name.chars();
    (chars.next()?.is_alphabetic() && chars.all(word_char)).then_some(name)
}

fn tokens(text: &str) -> Tokens {
    let mut out = Tokens { title: String::new(), priority: None, due: None, tags: Vec::new(), agent: None, done_by: None, created: None, closed: None };
    let mut kept: Vec<&str> = Vec::new();
    for word in text.split_whitespace() {
        if let Some(priority) = priority_token(word) {
            out.priority.get_or_insert(priority);
            continue;
        }
        if let Some((kind, time)) = stamp_token(word) {
            let slot = if kind == Stamp::Created { &mut out.created } else { &mut out.closed };
            slot.get_or_insert_with(|| time.to_string());
            continue;
        }
        if let Some(name) = agent_token(word) {
            out.agent.get_or_insert_with(|| name.to_string());
            continue;
        }
        if let Some(name) = done_by_token(word) {
            out.done_by.get_or_insert_with(|| name.to_string());
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
        if heading(raw).is_some() {
            stack.clear();
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
                agent: t.agent,
                done_by: t.done_by,
                created: t.created,
                closed: t.closed,
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

pub(crate) fn gone() -> AppError {
    AppError::InvalidInput("task no longer exists".into())
}

pub(crate) fn save(root: &Path, rel: &str, lines: &[String], forced: bool) -> AppResult<()> {
    let content = lines.join("\n");
    if forced {
        write_note_forced_snapshot(root, rel, &content)
    } else {
        write_note(root, rel, &content)
    }
}

pub(crate) fn read_lines(root: &Path, rel: &str) -> AppResult<Vec<String>> {
    Ok(read_note(root, rel)?.split('\n').map(str::to_string).collect())
}

/// Rewrite the box of the task at `line` to `status`, provided the line still
/// reads `text` — guards against the note changing since it was listed.
/// Leaving "doing" drops the claim; closing a task stamps when, and reopening it removes that. `forced` keeps a history snapshot
/// of what was replaced (agent writes).
pub fn set_issue_status(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    status: IssueStatus,
    forced: bool,
) -> AppResult<()> {
    rewrite(root, rel, line, text, forced, |task| {
        let next = restamped(task.text, status);
        (status, (next != task.text).then_some(next))
    })
}

/// Mark the task as in progress and claimed by `agent` (shown on the board).
pub fn claim_issue(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    agent: &str,
    forced: bool,
) -> AppResult<()> {
    let name: String = agent.trim().replace(char::is_whitespace, "-").chars().filter(|c| word_char(*c)).collect();
    if !name.chars().next().is_some_and(char::is_alphabetic) {
        return Err(AppError::InvalidInput("agent name must start with a letter".into()));
    }
    rewrite(root, rel, line, text, forced, |task| {
        let rest: Vec<_> = task.text.split_whitespace().filter(|w| agent_token(w).is_none() && done_by_token(w).is_none() && !is_closing_stamp(w)).collect();
        (IssueStatus::Doing, Some(format!("{} +{name}", rest.join(" "))))
    })
}

/// Set the task's priority, or clear it with `None`: the `!level` token is
/// swapped on the line (placed last when new). Refused if the line changed.
pub fn set_issue_priority(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    priority: Option<Priority>,
    forced: bool,
) -> AppResult<()> {
    rewrite(root, rel, line, text, forced, |task| {
        let mut words: Vec<&str> = task.text.split_whitespace().filter(|w| priority_token(w).is_none()).collect();
        if let Some(priority) = priority {
            words.push(priority.token());
        }
        let next = words.join(" ");
        (task.status, (next != task.text).then_some(next))
    })
}

/// Shared guarded rewrite: `change` returns the new status and, if the text
/// after the box should change, the new text.
fn rewrite(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    forced: bool,
    change: impl FnOnce(&TaskLine) -> (IssueStatus, Option<String>),
) -> AppResult<()> {
    let mut lines = read_lines(root, rel)?;
    let current = lines.get(line).ok_or_else(gone)?;
    let task = task_line(current).filter(|t| t.text == text).ok_or_else(gone)?;
    let (status, new_text) = change(&task);
    if task.status == status && new_text.is_none() {
        return Ok(());
    }
    let at = task.box_at;
    let next = match new_text {
        Some(t) => {
            let cr = if current.ends_with('\r') { "\r" } else { "" };
            format!("{}{} {}{cr}", &current[..at], status.mark(), t.trim())
        }
        None => format!("{}{}{}", &current[..at], status.mark(), &current[at + 3..]),
    };
    lines[line] = next;
    save(root, rel, &lines, forced)
}

/// Add a plain bullet (a decision note) under the task at `line`, after its
/// existing notes and sub-tasks. Refused if the line changed.
pub fn add_issue_note(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    note: &str,
    forced: bool,
) -> AppResult<()> {
    let note = note.trim();
    if note.is_empty() || note.contains('\n') {
        return Err(AppError::InvalidInput("a decision must be one line".into()));
    }
    let mut lines = read_lines(root, rel)?;
    let current = lines.get(line).ok_or_else(gone)?;
    let task = task_line(current).filter(|t| t.text == text).ok_or_else(gone)?;
    let indent = task.indent;
    let mut last = line;
    for (i, l) in lines.iter().enumerate().skip(line + 1) {
        let trimmed = l.trim_start();
        if trimmed.is_empty() || l.len() - trimmed.len() <= indent {
            break;
        }
        last = i;
    }
    let cr = if current.ends_with('\r') { "\r" } else { "" };
    lines.insert(last + 1, format!("{}- {note}{cr}", " ".repeat(indent + 2)));
    save(root, rel, &lines, forced)
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

    /// `s` without any stamp words, so line shapes can be compared exactly.
    fn bare(s: &str) -> String {
        let mut out = s.to_string();
        for glyph in ['◷', '✓', '✗'] {
            while let Some(at) = out.find(glyph) {
                let rest = &out[at + glyph.len_utf8()..];
                let len = [16, 10].into_iter().find(|n| rest.get(..*n).is_some_and(is_stamp_time));
                let Some(len) = len else { break };
                let start = if out[..at].ends_with(' ') { at - 1 } else { at };
                out.replace_range(start..at + glyph.len_utf8() + len, "");
            }
        }
        out
    }

    #[test]
    fn parses_status_tokens_and_notes() {
        let md = "# Plan\n- [ ] Loose\n## V1\n- [ ] Fix graph #Bug !high @2026-11-01\n  - decided: keep it\n  - [/] Sub task\n    - inner note\n- [x] Shipped\n- [-] Dropped\n```\n- [ ] code\n```\n## V2\n* [X] Later\nprose\n  - stray\n";
        let issues = parse_issues("p.md", md);
        let summary: Vec<_> = issues
            .iter()
            .map(|i| (i.line, i.title.as_str(), i.status, i.depth))
            .collect();
        assert_eq!(
            summary,
            [
                (1, "Loose", IssueStatus::Todo, 0),
                (3, "Fix graph", IssueStatus::Todo, 0),
                (5, "Sub task", IssueStatus::Doing, 1),
                (7, "Shipped", IssueStatus::Done, 0),
                (8, "Dropped", IssueStatus::Canceled, 0),
                (13, "Later", IssueStatus::Done, 0),
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
        assert!(set_issue_status(root, &rel, 0, "Other", IssueStatus::Done, false).is_err());
        set_issue_status(root, &rel, 0, "Draft", IssueStatus::Doing, false).unwrap();
        set_issue_status(root, &rel, 1, "Nested", IssueStatus::Canceled, false).unwrap();
        assert_eq!(bare(&read_note(root, &rel).unwrap()), "- [/] Draft\r\n  * [-] Nested\n");
        set_issue_status(root, &rel, 0, "Draft", IssueStatus::Todo, false).unwrap();
        assert_eq!(bare(&read_note(root, &rel).unwrap()), "- [ ] Draft\r\n  * [-] Nested\n");
    }

    #[test]
    fn claims_and_releases_and_adds_notes() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(root, &rel, "## V1\n- [ ] Draft #a\n  - old note\n  - [ ] Sub\n- [ ] Next\n").unwrap();
        claim_issue(root, &rel, 1, "Draft #a", "claude-code", true).unwrap();
        let content = read_note(root, &rel).unwrap();
        assert!(content.contains("- [/] Draft #a +claude-code\n"));
        let issue = &parse_issues(&rel, &content)[0];
        assert_eq!((issue.agent.as_deref(), issue.title.as_str()), (Some("claude-code"), "Draft"));
        assert!(claim_issue(root, &rel, 1, "Draft #a", "x", true).is_err());

        add_issue_note(root, &rel, 1, "Draft #a +claude-code", "decided: keep it", true).unwrap();
        assert_eq!(
            read_note(root, &rel).unwrap(),
            "## V1\n- [/] Draft #a +claude-code\n  - old note\n  - [ ] Sub\n  - decided: keep it\n- [ ] Next\n"
        );
        assert!(add_issue_note(root, &rel, 1, "stale", "x", true).is_err());

        set_issue_status(root, &rel, 1, "Draft #a +claude-code", IssueStatus::Done, true).unwrap();
        let done = read_note(root, &rel).unwrap();
        assert!(bare(&done).contains("- [x] Draft #a ✓by:claude-code\n"), "{done}");
        assert!(!done.contains("+claude-code"));
        assert!(done.contains(" ✓by:claude-code\n"), "{done}");
        let issue = &parse_issues(&rel, &done)[0];
        assert_eq!((issue.agent.as_deref(), issue.done_by.as_deref(), issue.title.as_str()), (None, Some("claude-code"), "Draft"));
        let done_line = done.lines().find(|l| l.contains("✓by:")).unwrap().trim_start_matches("- [x] ").to_string();
        set_issue_status(root, &rel, 1, &done_line, IssueStatus::Canceled, true).unwrap();
        assert!(!read_note(root, &rel).unwrap().contains("by:"));
        assert!(claim_issue(root, &rel, 1, "Draft #a", "9bad", true).is_err());
    }

    #[test]
    fn stamps_follow_the_status() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(root, &rel, "- [ ] Fix #bug ◷2026-10-26T09:05 !high\n").unwrap();
        let issue = |root: &Path| parse_issues(&rel, &read_note(root, &rel).unwrap()).remove(0);
        let text = |root: &Path| issue(root).text;

        let first = issue(root);
        assert_eq!((first.created.as_deref(), first.closed.as_deref()), (Some("2026-10-26T09:05"), None));
        assert_eq!(first.title, "Fix");

        set_issue_status(root, &rel, 0, &text(root), IssueStatus::Done, false).unwrap();
        let done = issue(root);
        let closed = done.closed.clone().unwrap();
        assert_eq!(closed.len(), 16);
        assert_eq!(done.created.as_deref(), Some("2026-10-26T09:05"));
        assert!(read_note(root, &rel).unwrap().contains(&format!("✓{closed}")));

        // Done again keeps the original time; canceling swaps ✓ for ✗.
        set_issue_status(root, &rel, 0, &text(root), IssueStatus::Done, false).unwrap();
        assert_eq!(issue(root).closed, Some(closed));
        set_issue_status(root, &rel, 0, &text(root), IssueStatus::Canceled, false).unwrap();
        let note = read_note(root, &rel).unwrap();
        assert!(note.contains('✗') && !note.contains('✓'));
        assert_eq!(issue(root).status, IssueStatus::Canceled);

        // Reopening drops the closing time but keeps when it was created and the rest.
        set_issue_status(root, &rel, 0, &text(root), IssueStatus::Todo, false).unwrap();
        let reopened = issue(root);
        assert_eq!((reopened.closed, reopened.created.as_deref()), (None, Some("2026-10-26T09:05")));
        assert_eq!(reopened.priority, Some(Priority::High));
        assert_eq!(reopened.tags, ["bug"]);
    }

    #[test]
    fn older_day_only_stamps_still_count_and_stay_out_of_titles() {
        let issues = parse_issues("p.md", "- [x] Old ✓2026-09-01\n- [ ] Mixed ◷2026-10-01 ✓2026-10-02T08:00 x ✓nope\n");
        assert_eq!((issues[0].title.as_str(), issues[0].closed.as_deref()), ("Old", Some("2026-09-01")));
        assert_eq!(issues[1].title, "Mixed x ✓nope");
        assert_eq!((issues[1].created.as_deref(), issues[1].closed.as_deref()), (Some("2026-10-01"), Some("2026-10-02T08:00")));
    }

    #[test]
    fn new_tasks_are_created_stamped() {
        let open = new_issue_text(" ship it ", IssueStatus::Todo);
        assert!(open.starts_with("ship it ◷") && open.chars().count() == "ship it ◷".chars().count() + 16);
        let done = new_issue_text("ship it", IssueStatus::Done);
        let task = parse_issues("p.md", &format!("- [x] {done}\n")).remove(0);
        assert_eq!(task.title, "ship it");
        assert_eq!(task.created, task.closed);
        let canceled = parse_issues("p.md", &format!("- [-] {}\n", new_issue_text("x", IssueStatus::Canceled))).remove(0);
        assert!(canceled.created.is_some() && canceled.closed.is_some());
    }

    #[test]
    fn priority_is_swapped_cleared_and_ranked() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let rel = create_note(root, "", "Plan").unwrap();
        write_note(root, &rel, "- [ ] Fix #bug !LOW @2026-11-01\n- [/] Other\n").unwrap();
        set_issue_priority(root, &rel, 0, "Fix #bug !LOW @2026-11-01", Some(Priority::Urgent), false).unwrap();
        assert_eq!(read_note(root, &rel).unwrap(), "- [ ] Fix #bug @2026-11-01 !urgent\n- [/] Other\n");
        set_issue_priority(root, &rel, 1, "Other", Some(Priority::High), true).unwrap();
        let content = read_note(root, &rel).unwrap();
        assert!(content.ends_with("- [/] Other !high\n"));
        let issues = parse_issues(&rel, &content);
        assert_eq!((issues[0].priority, issues[1].priority), (Some(Priority::Urgent), Some(Priority::High)));
        assert!(Priority::rank(issues[0].priority) < Priority::rank(issues[1].priority));
        assert!(Priority::rank(issues[1].priority) < Priority::rank(None));

        set_issue_priority(root, &rel, 0, "Fix #bug @2026-11-01 !urgent", None, false).unwrap();
        assert!(read_note(root, &rel).unwrap().starts_with("- [ ] Fix #bug @2026-11-01\n"));
        assert!(set_issue_priority(root, &rel, 0, "stale", None, false).is_err());
    }
}
