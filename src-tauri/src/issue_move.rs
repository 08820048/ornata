//! Moving issue lines around. Reordering: a task moves, with the lines indented
//! under it, to just before or after another task of the same note — order is
//! only ever the order of the lines, nothing is stored elsewhere. Promoting a
//! task to its own page takes the decision notes under it along.

use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::issues::{gone, read_lines, save, task_line};

/// The task at `line` plus everything indented under it: `line..end`.
fn block_end(lines: &[String], line: usize, indent: usize) -> usize {
    let mut end = line + 1;
    while let Some(l) = lines.get(end) {
        let trimmed = l.trim_start();
        if trimmed.is_empty() || l.len() - trimmed.len() <= indent {
            break;
        }
        end += 1;
    }
    end
}

/// Move the task at `line` (still reading `text`) next to the task at
/// `target_line` (still reading `target_text`): after it when `after`, else
/// before. Both must be top-level in the same way (same indent), and the
/// target may not sit inside the moved block. `forced` keeps a history snapshot.
#[allow(clippy::too_many_arguments)]
pub fn move_issue(
    root: &Path,
    rel: &str,
    line: usize,
    text: &str,
    target_line: usize,
    target_text: &str,
    after: bool,
    forced: bool,
) -> AppResult<()> {
    let mut lines = read_lines(root, rel)?;
    let task = lines.get(line).and_then(|l| task_line(l)).filter(|t| t.text == text).ok_or_else(gone)?;
    let target = lines
        .get(target_line)
        .and_then(|l| task_line(l))
        .filter(|t| t.text == target_text)
        .ok_or_else(gone)?;
    if task.indent != target.indent {
        return Err(AppError::InvalidInput("tasks are nested differently".into()));
    }
    let end = block_end(&lines, line, task.indent);
    if (line..end).contains(&target_line) {
        return Err(AppError::InvalidInput("cannot move a task into itself".into()));
    }
    let target_end = block_end(&lines, target_line, target.indent);
    let at = if after { target_end } else { target_line };
    // Already there: just before it, or just after it.
    if at == line || at == end {
        return Ok(());
    }
    let block: Vec<String> = lines.drain(line..end).collect();
    let at = if at > line { at - block.len() } else { at };
    lines.splice(at..at, block);
    save(root, rel, &lines, forced)
}

/// Remove the decision notes under the task at `line` (still reading `text`):
/// the plain bullets and text indented beneath it. Sub-tasks and what is
/// under them stay. Returns how many lines were removed.
pub fn remove_issue_notes(root: &Path, rel: &str, line: usize, text: &str) -> AppResult<usize> {
    let mut lines = read_lines(root, rel)?;
    let task = lines.get(line).and_then(|l| task_line(l)).filter(|t| t.text == text).ok_or_else(gone)?;
    let end = block_end(&lines, line, task.indent);
    let mut keep = vec![true; lines.len()];
    let mut skip_until = line + 1;
    for i in line + 1..end {
        if i < skip_until {
            continue;
        }
        if task_line(&lines[i]).is_some() {
            skip_until = block_end(&lines, i, task_line(&lines[i]).map_or(0, |t| t.indent));
        } else {
            keep[i] = false;
        }
    }
    let removed = keep.iter().filter(|k| !**k).count();
    if removed == 0 {
        return Ok(0);
    }
    let mut it = keep.iter();
    lines.retain(|_| *it.next().unwrap());
    save(root, rel, &lines, false)?;
    Ok(removed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_note, read_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    const PLAN: &str = "# Plan\n- [ ] A\n  - note a\n- [ ] B\n- [ ] C\n  - [ ] C sub\n- [ ] D";

    fn run(line: usize, text: &str, target: usize, target_text: &str, after: bool) -> (AppResult<()>, String) {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let rel = create_note(dir.path(), "", "p").unwrap();
        write_note(dir.path(), &rel, PLAN).unwrap();
        let out = move_issue(dir.path(), &rel, line, text, target, target_text, after, false);
        (out, read_note(dir.path(), &rel).unwrap())
    }

    #[test]
    fn moves_a_task_with_its_notes_before_another() {
        let (out, md) = run(1, "A", 6, "D", false);
        out.unwrap();
        assert_eq!(md, "# Plan\n- [ ] B\n- [ ] C\n  - [ ] C sub\n- [ ] A\n  - note a\n- [ ] D");
    }

    #[test]
    fn moves_up_after_a_task_and_carries_sub_tasks() {
        let (out, md) = run(4, "C", 1, "A", true);
        out.unwrap();
        assert_eq!(md, "# Plan\n- [ ] A\n  - note a\n- [ ] C\n  - [ ] C sub\n- [ ] B\n- [ ] D");
    }

    #[test]
    fn no_change_when_already_in_place() {
        let (out, md) = run(3, "B", 4, "C", false);
        out.unwrap();
        assert_eq!(md, PLAN);
    }

    #[test]
    fn refuses_stale_nested_or_self_targets() {
        assert!(run(1, "A", 6, "changed", false).0.is_err());
        assert!(run(1, "A", 5, "C sub", false).0.is_err());
        assert!(run(4, "C", 5, "C sub", true).0.is_err());
    }

    #[test]
    fn removes_notes_but_keeps_sub_tasks() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let rel = create_note(dir.path(), "", "p").unwrap();
        write_note(dir.path(), &rel, "- [ ] A\n  - note a\n    - deeper\n  - [ ] sub\n    - sub note\n  - note b\n- [ ] B\n  - note of b").unwrap();
        assert_eq!(remove_issue_notes(dir.path(), &rel, 0, "A").unwrap(), 3);
        assert_eq!(read_note(dir.path(), &rel).unwrap(), "- [ ] A\n  - [ ] sub\n    - sub note\n- [ ] B\n  - note of b");
        assert!(remove_issue_notes(dir.path(), &rel, 0, "changed").is_err());
    }
}
