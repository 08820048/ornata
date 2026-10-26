//! The project space as agent tools: issues are the task lines of a project's
//! notes (see `issues.rs`); every write keeps a history snapshot.

use std::path::Path;

use serde_json::{json, Value};

use super::tools::{arg, object, opt, Level, Tool};
use crate::error::{AppError, AppResult};
use crate::issues::{self, Issue, IssueStatus};
use crate::{projects, vault_guard};

pub fn definitions() -> Vec<Tool> {
    let path = json!({ "type": "string", "description": "Note path of the issue, from list_issues" });
    let line = json!({ "type": "integer", "description": "Line from list_issues" });
    let text = json!({ "type": "string", "description": "The issue's `text` from list_issues; refused if the line changed" });
    let project = json!({ "type": "string", "description": "Project folder path from list_projects; default is all projects" });
    let status = json!({ "type": "string", "enum": ["todo", "doing", "done", "canceled"] });
    let tool = |name, description, needs, schema| Tool { name, description, needs, schema };
    vec![
        tool("list_projects", "List projects (folders marked as projects) with issue counts by status.", Level::ReadOnly, object(json!({}), &[])),
        tool("list_issues", "List issues — the task lines of a project's notes — with status, priority, due date, tags, milestone and decision notes.", Level::ReadOnly,
            object(json!({ "project": project, "status": status }), &[])),
        tool("next_issue", "The issue to work on next: in-progress first, then by priority and due date.", Level::ReadOnly, object(json!({ "project": project }), &[])),
        tool("claim_issue", "Mark an issue as in progress and show on the board that this agent is working on it.", Level::Write,
            object(json!({ "path": path, "line": line, "text": text, "agent": { "type": "string", "description": "Your name, e.g. claude-code; letters, digits, - _ /" } }), &["path", "line", "text"])),
        tool("set_issue_status", "Change an issue's status (todo, doing, done, canceled). Leaving doing releases the claim.", Level::Write,
            object(json!({ "path": path, "line": line, "text": text, "status": status }), &["path", "line", "text", "status"])),
        tool("add_decision", "Record a one-line decision or progress note under an issue.", Level::Write,
            object(json!({ "path": path, "line": line, "text": text, "decision": { "type": "string" } }), &["path", "line", "text", "decision"])),
        tool("add_issue", "Add an issue to a project's Backlog.md.", Level::Write,
            object(json!({ "project": project, "text": { "type": "string", "description": "One line; may include #tag !high @2026-11-10" } }), &["project", "text"])),
    ]
}

fn line_of(args: &Value) -> AppResult<usize> {
    args.get("line")
        .and_then(Value::as_u64)
        .map(|n| n as usize)
        .ok_or_else(|| AppError::InvalidInput("line is required".into()))
}

fn status_of(value: &str) -> AppResult<IssueStatus> {
    serde_json::from_value(json!(value))
        .map_err(|_| AppError::InvalidInput("status must be todo, doing, done or canceled".into()))
}

fn scoped(root: &Path, args: &Value) -> AppResult<Vec<Issue>> {
    let project = opt(args, "project").trim_matches('/');
    let rels = if project.is_empty() {
        projects::list_projects(root)?.into_iter().map(|p| p.rel).collect()
    } else {
        vec![project.to_string()]
    };
    let mut out = Vec::new();
    for rel in rels.iter().filter(|rel| vault_guard::rel_inside(root, rel)) {
        out.extend(projects::project_issues(root, rel)?);
    }
    out.retain(|issue| vault_guard::rel_inside(root, &issue.rel));
    Ok(out)
}

/// Run a project tool; `None` when `name` is not one of them.
pub fn call(root: &Path, name: &str, args: &Value) -> Option<AppResult<Value>> {
    Some(match name {
        "list_projects" => projects::list_projects(root)
            .map(|list| list.into_iter().filter(|p| vault_guard::rel_inside(root, &p.rel)).collect::<Vec<_>>())
            .and_then(|list| Ok(serde_json::to_value(list)?)),
        "list_issues" => scoped(root, args).and_then(|mut list| {
            let status = opt(args, "status");
            if !status.is_empty() {
                let want = status_of(status)?;
                list.retain(|i| i.status == want);
            }
            Ok(serde_json::to_value(list)?)
        }),
        "next_issue" => scoped(root, args).and_then(|list| Ok(json!({ "issue": projects::next_issue(list) }))),
        "claim_issue" => (|| {
            let agent = Some(opt(args, "agent")).filter(|a| !a.is_empty()).unwrap_or("agent");
            issues::claim_issue(root, arg(args, "path")?, line_of(args)?, arg(args, "text")?, agent, true)?;
            Ok(json!({ "claimed": true }))
        })(),
        "set_issue_status" => (|| {
            let status = status_of(arg(args, "status")?)?;
            issues::set_issue_status(root, arg(args, "path")?, line_of(args)?, arg(args, "text")?, status, true)?;
            Ok(json!({ "updated": true }))
        })(),
        "add_decision" => (|| {
            issues::add_issue_note(root, arg(args, "path")?, line_of(args)?, arg(args, "text")?, arg(args, "decision")?, true)?;
            Ok(json!({ "added": true }))
        })(),
        "add_issue" => (|| {
            let path = projects::add_issue(root, arg(args, "project")?, arg(args, "text")?)?;
            Ok(json!({ "path": path }))
        })(),
        _ => return None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_folder, create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn an_agent_can_claim_work_and_finish_an_issue() {
        let dir = tempdir().unwrap();
        let root = dir.path();
        ensure_layout(root).unwrap();
        let app = create_folder(root, "", "App").unwrap();
        projects::set_project(root, &app, true).unwrap();
        let plan = create_note(root, &app, "Plan").unwrap();
        write_note(root, &plan, "## V1\n- [ ] Low #x !low\n- [ ] Fix graph !high\n").unwrap();

        let call = |name: &str, args: Value| call(root, name, &args).unwrap().unwrap();
        assert_eq!(call("list_projects", json!({}))[0]["todo"], 2);
        let next = call("next_issue", json!({ "project": "App" }));
        assert_eq!(next["issue"]["title"], "Fix graph");

        let (line, text) = (next["issue"]["line"].clone(), next["issue"]["text"].clone());
        call("claim_issue", json!({ "path": plan, "line": line, "text": text, "agent": "claude-code" }));
        let doing = call("list_issues", json!({ "status": "doing" }));
        assert_eq!(doing[0]["agent"], "claude-code");

        let text = doing[0]["text"].clone();
        call("add_decision", json!({ "path": plan, "line": line, "text": text, "decision": "fixed in 3aafa5c" }));
        let text = call("list_issues", json!({ "status": "doing" }))[0]["text"].clone();
        call("set_issue_status", json!({ "path": plan, "line": line, "text": text, "status": "done" }));
        let all = call("list_issues", json!({ "project": "App" }));
        assert_eq!(all[1]["status"], "done");
        assert_eq!(all[1]["agent"], Value::Null);
        assert_eq!(all[1]["notes"][0], "fixed in 3aafa5c");

        assert!(super::call(root, "set_issue_status", &json!({ "path": plan, "line": line, "text": "x", "status": "done" })).unwrap().is_err());
        assert!(super::call(root, "set_issue_status", &json!({ "path": plan, "line": line, "text": "x", "status": "bogus" })).unwrap().is_err());
        assert!(super::call(root, "nope", &json!({})).is_none());
    }
}
