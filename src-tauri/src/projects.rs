//! A project is a folder of notes marked by a hidden `.ornata-project` file,
//! which travels with the folder on rename/move. Its issues are the task lines
//! of every note inside it, except those of nested projects (they are theirs).

use std::fs;
use std::path::Path;

use serde::Serialize;

use crate::error::{AppError, AppResult};
use crate::issues::{parse_issues, Issue, IssueStatus, Priority};
use crate::notes::{create_note, write_note};
use crate::vault::{notes_root, rel_of, resolve_rel};

pub const MARKER: &str = ".ornata-project";

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub rel: String,
    pub name: String,
    pub todo: usize,
    pub doing: usize,
    pub done: usize,
    pub canceled: usize,
}

fn is_project(dir: &Path) -> bool {
    dir.join(MARKER).is_file()
}

fn visible_entries(dir: &Path) -> Vec<fs::DirEntry> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut out: Vec<_> = entries
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .collect();
    out.sort_by_key(|e| e.file_name().to_string_lossy().to_lowercase());
    out
}

/// Every marked folder in the vault, with issue counts by status.
pub fn list_projects(root: &Path) -> AppResult<Vec<ProjectSummary>> {
    fn walk(root: &Path, dir: &Path, out: &mut Vec<ProjectSummary>) -> AppResult<()> {
        for entry in visible_entries(dir) {
            let path = entry.path();
            if !path.is_dir() {
                continue;
            }
            if is_project(&path) {
                let rel = rel_of(root, &path)?;
                let mut summary = ProjectSummary {
                    name: entry.file_name().to_string_lossy().to_string(),
                    ..Default::default()
                };
                for issue in issues_in(root, &path)? {
                    match issue.status {
                        IssueStatus::Todo => summary.todo += 1,
                        IssueStatus::Doing => summary.doing += 1,
                        IssueStatus::Done => summary.done += 1,
                        IssueStatus::Canceled => summary.canceled += 1,
                    }
                }
                summary.rel = rel;
                out.push(summary);
            }
            walk(root, &path, out)?;
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(root, &notes_root(root), &mut out)?;
    Ok(out)
}

fn project_dir(root: &Path, rel: &str) -> AppResult<std::path::PathBuf> {
    if rel.trim_matches('/').is_empty() {
        return Err(AppError::InvalidInput("the notes root cannot be a project".into()));
    }
    let dir = resolve_rel(root, rel)?;
    if !dir.is_dir() {
        return Err(AppError::NotFound(rel.to_string()));
    }
    Ok(dir)
}

/// All issues of the project at `rel`, ordered by note path then line.
pub fn project_issues(root: &Path, rel: &str) -> AppResult<Vec<Issue>> {
    let dir = project_dir(root, rel)?;
    if !is_project(&dir) {
        return Err(AppError::NotFound(rel.to_string()));
    }
    issues_in(root, &dir)
}

fn issues_in(root: &Path, dir: &Path) -> AppResult<Vec<Issue>> {
    fn walk(root: &Path, dir: &Path, top: bool, out: &mut Vec<Issue>) -> AppResult<()> {
        if !top && is_project(dir) {
            return Ok(());
        }
        let (folders, files): (Vec<_>, Vec<_>) =
            visible_entries(dir).into_iter().partition(|e| e.path().is_dir());
        for entry in files {
            let path = entry.path();
            if path.extension().is_none_or(|e| e != "md") {
                continue;
            }
            let content = fs::read_to_string(&path).unwrap_or_default();
            out.extend(parse_issues(&rel_of(root, &path)?, &content));
        }
        for entry in folders {
            walk(root, &entry.path(), false, out)?;
        }
        Ok(())
    }
    let mut out = Vec::new();
    walk(root, dir, true, &mut out)?;
    Ok(out)
}

/// Mark (or unmark) the folder at `rel` as a project.
pub fn set_project(root: &Path, rel: &str, on: bool) -> AppResult<()> {
    let marker = project_dir(root, rel)?.join(MARKER);
    match (on, marker.is_file()) {
        (true, false) => fs::write(marker, "")?,
        (false, true) => fs::remove_file(marker)?,
        _ => {}
    }
    Ok(())
}

/// The issue to work on next: anything already in progress first, then open
/// ones by priority, due date, and document order.
pub fn next_issue(issues: Vec<Issue>) -> Option<Issue> {
    issues
        .into_iter()
        .filter(|i| matches!(i.status, IssueStatus::Todo | IssueStatus::Doing))
        .min_by_key(|i| {
            (
                i.status != IssueStatus::Doing,
                Priority::rank(i.priority),
                i.due.clone().unwrap_or_else(|| "9999".into()),
            )
        })
}

/// The note that holds a project's loose tasks, those added without a plan.
pub const TASKS_NOTE: &str = "Tasks";
/// What this note used to be called; projects that already have one keep using it.
const LEGACY_TASKS_NOTE: &str = "Backlog";

/// Append a task with `status` to the project's `Tasks.md` (created on first
/// use). It only says where the line is stored — the status is the box. Returns the note's
/// rel path.
pub fn add_issue(root: &Path, project_rel: &str, text: &str, status: IssueStatus) -> AppResult<String> {
    let text = text.trim();
    if text.is_empty() || text.contains('\n') {
        return Err(AppError::InvalidInput("invalid task text".into()));
    }
    let dir = project_dir(root, project_rel)?;
    if !is_project(&dir) {
        return Err(AppError::NotFound(project_rel.to_string()));
    }
    let legacy = dir.join(format!("{LEGACY_TASKS_NOTE}.md"));
    let (name, file) = if legacy.is_file() {
        (LEGACY_TASKS_NOTE, legacy)
    } else {
        (TASKS_NOTE, dir.join(format!("{TASKS_NOTE}.md")))
    };
    let rel = rel_of(root, &file)?;
    let mut content = if file.is_file() {
        fs::read_to_string(&file)?
    } else {
        create_note(root, project_rel, name)?;
        format!("# {name}\n\n")
    };
    if !content.is_empty() && !content.ends_with('\n') {
        content.push('\n');
    }
    content.push_str(&format!("- {} {}\n", status.mark(), crate::issues::new_issue_text(text, status)));
    write_note(root, &rel, &content)?;
    Ok(rel)
}

/// Create a note named `title` with `content` in `<project>/<folder>/`
/// (the folder is made if missing). Returns its rel path, suffixed if the
/// name was taken.
pub fn create_project_doc(
    root: &Path,
    project_rel: &str,
    folder: &str,
    title: &str,
    content: &str,
) -> AppResult<String> {
    let dir = project_dir(root, project_rel)?;
    if !is_project(&dir) {
        return Err(AppError::NotFound(project_rel.to_string()));
    }
    if folder.is_empty() || folder.contains(['/', '\\']) || folder.starts_with('.') {
        return Err(AppError::InvalidInput("invalid folder".into()));
    }
    let target = dir.join(folder);
    if !target.is_dir() {
        fs::create_dir(&target)?;
    }
    let rel = create_note(root, &rel_of(root, &target)?, title)?;
    write_note(root, &rel, content)?;
    Ok(rel)
}

/// The page for an issue promoted out of a task line: a note named after it
/// in the project's `issues/` folder, starting with its title and then `body`.
pub fn create_issue_note(root: &Path, project_rel: &str, title: &str, body: &str) -> AppResult<String> {
    let body = body.trim();
    let tail = if body.is_empty() { String::new() } else { format!("{body}\n\n") };
    create_project_doc(root, project_rel, "issues", title, &format!("# {}\n\n{tail}", title.trim()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn lists_marked_folders_and_keeps_nested_projects_apart() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let app = create_folder(root, "", "App").unwrap();
        let sub = create_folder(root, &app, "Sub").unwrap();
        create_folder(root, "", "Plain").unwrap();
        let plan = create_note(root, &app, "Plan").unwrap();
        write_note(root, &plan, "- [ ] a\n- [/] b\n- [x] c\n").unwrap();
        let inner = create_note(root, &sub, "Inner").unwrap();
        write_note(root, &inner, "- [-] d\n").unwrap();

        assert!(list_projects(root).unwrap().is_empty());
        set_project(root, &app, true).unwrap();
        set_project(root, &app, true).unwrap();
        let list = list_projects(root).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!((list[0].todo, list[0].doing, list[0].done, list[0].canceled), (1, 1, 1, 1));

        set_project(root, &sub, true).unwrap();
        let list = list_projects(root).unwrap();
        let names: Vec<_> = list.iter().map(|p| (p.name.as_str(), p.canceled)).collect();
        assert_eq!(names, [("App", 0), ("Sub", 1)]);
        assert_eq!(project_issues(root, &app).unwrap().len(), 3);

        let page = create_issue_note(root, &app, "Fix: graph/search", "").unwrap();
        assert_eq!(page, "App/issues/Fix graph search.md");
        assert_eq!(create_issue_note(root, &app, "Fix: graph/search", "Source: x").unwrap(), "App/issues/Fix graph search 2.md");
        assert_eq!(crate::notes::read_note(root, &page).unwrap(), "# Fix: graph/search\n\n");
        assert!(create_issue_note(root, "Plain", "x", "").is_err());
        let review = create_project_doc(root, &app, "Reviews", "Review", "# R\n").unwrap();
        assert_eq!(review, "App/Reviews/Review.md");
        assert!(create_project_doc(root, &app, "../x", "t", "").is_err());
        assert!(create_project_doc(root, &app, "a/b", "t", "").is_err());

        let all = project_issues(root, &app).unwrap();
        let next = next_issue(all.clone()).unwrap();
        assert_eq!(next.title, "b");
        let mut by_priority = all.clone();
        by_priority[0].priority = Some(Priority::Urgent);
        by_priority[1].status = IssueStatus::Todo;
        assert_eq!(next_issue(by_priority).unwrap().title, "a");
        assert!(next_issue(all.into_iter().filter(|i| i.status == IssueStatus::Done).collect()).is_none());

        let backlog = add_issue(root, &app, "first", IssueStatus::Todo).unwrap();
        assert_eq!(backlog, "App/Tasks.md");
        add_issue(root, &app, " second ", IssueStatus::Todo).unwrap();
        let written = crate::notes::read_note(root, &backlog).unwrap();
        let tasks = parse_issues(&backlog, &written);
        assert_eq!(tasks.iter().map(|t| t.title.as_str()).collect::<Vec<_>>(), ["first", "second"]);
        assert!(tasks.iter().all(|t| t.created.is_some() && t.closed.is_none()));
        assert!(written.starts_with("# Tasks\n\n- [ ] first ◷"));
        add_issue(root, &app, "going", IssueStatus::Doing).unwrap();
        add_issue(root, &app, "finished", IssueStatus::Done).unwrap();
        let tail = crate::notes::read_note(root, &backlog).unwrap();
        let tail = parse_issues(&backlog, &tail);
        assert_eq!((tail[2].status, tail[2].closed.is_none()), (IssueStatus::Doing, true));
        assert_eq!((tail[3].status, tail[3].closed.is_some()), (IssueStatus::Done, true));
        assert!(add_issue(root, &app, "a\nb", IssueStatus::Todo).is_err());
        assert!(add_issue(root, "Plain", "x", IssueStatus::Todo).is_err());

        let old = create_folder(root, "", "Old").unwrap();
        set_project(root, &old, true).unwrap();
        let legacy = create_note(root, &old, "Backlog").unwrap();
        write_note(root, &legacy, "# Backlog\n").unwrap();
        assert_eq!(add_issue(root, &old, "kept", IssueStatus::Todo).unwrap(), "Old/Backlog.md");
        assert!(!root.join("notes/Old/Tasks.md").exists());

        set_project(root, &app, false).unwrap();
        assert!(project_issues(root, &app).is_err());
        assert!(set_project(root, "", true).is_err());
        assert!(set_project(root, "../x", true).is_err());
    }
}
