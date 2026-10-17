use std::path::Path;
use std::process::Command;

use serde_json::{json, Value};

use crate::agent_tools::{self, AgentPermission, BridgeRequest};
use crate::config::CliAccess;
use crate::error::{AppError, AppResult};
use crate::{backlinks, notes, tasks, templates, vault};

/// What a connection may do, lowest to highest. A tool needs a level and is
/// refused below it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    Off,
    ReadOnly,
    Write,
    Destructive,
}

impl From<CliAccess> for Level {
    fn from(access: CliAccess) -> Self {
        match access {
            CliAccess::Off => Self::Off,
            CliAccess::ReadOnly => Self::ReadOnly,
            CliAccess::ReadWrite => Self::Write,
            CliAccess::Full => Self::Destructive,
        }
    }
}

impl Level {
    pub fn label(self) -> &'static str {
        match self {
            Self::Off => "off",
            Self::ReadOnly => "read-only",
            Self::Write => "read & write",
            Self::Destructive => "full access",
        }
    }

    pub fn parse(value: &str) -> Option<Self> {
        match value {
            "off" => Some(Self::Off),
            "read" | "read-only" | "readonly" => Some(Self::ReadOnly),
            "write" | "read-write" | "readwrite" => Some(Self::Write),
            "full" | "destructive" => Some(Self::Destructive),
            _ => None,
        }
    }

    fn permission(self) -> AgentPermission {
        match self {
            Self::Off | Self::ReadOnly => AgentPermission::ReadOnly,
            Self::Write => AgentPermission::ReadWrite,
            Self::Destructive => AgentPermission::FullAccess,
        }
    }
}

pub struct Tool {
    pub name: &'static str,
    pub description: &'static str,
    pub needs: Level,
    pub schema: Value,
}

fn object(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

pub fn tools() -> Vec<Tool> {
    let path = json!({ "type": "string", "description": "Note path relative to the vault's notes folder, e.g. projects/app.md" });
    let text = json!({ "type": "string", "description": "Markdown text" });
    let date = json!({ "type": "string", "description": "YYYY-MM-DD; defaults to today" });
    let tool = |name, description, needs, schema| Tool { name, description, needs, schema };
    vec![
        tool("vault_info", "Describe the vault: folder, note count, and what this connection may do.", Level::ReadOnly, object(json!({}), &[])),
        tool("list_notes", "List notes (path, title, modified time), optionally under one folder.", Level::ReadOnly,
            object(json!({ "folder": { "type": "string", "description": "Folder path prefix, e.g. projects" } }), &[])),
        tool("read_note", "Read a note's full Markdown, including any frontmatter.", Level::ReadOnly, object(json!({ "path": path }), &["path"])),
        tool("search_notes", "Search titles and content. Title matches rank first; titles also match from shorthand.", Level::ReadOnly,
            object(json!({ "query": { "type": "string" }, "limit": { "type": "integer", "description": "Default 20, max 100" } }), &["query"])),
        tool("get_backlinks", "Notes that link to a note, with the linking lines.", Level::ReadOnly, object(json!({ "path": path }), &["path"])),
        tool("list_tasks", "Every open `- [ ]` task across the vault, with note path and line.", Level::ReadOnly, object(json!({}), &[])),
        tool("get_daily_note", "Read a day's note (journal/YYYY-MM-DD.md). Reports exists:false when there is none.", Level::ReadOnly, object(json!({ "date": date }), &[])),
        tool("create_note", "Create a note, optionally with Markdown content.", Level::Write,
            object(json!({ "title": { "type": "string" }, "directory": { "type": "string", "description": "Folder path; default is the notes root" }, "content": text }), &["title"])),
        tool("update_note", "Replace a note's whole content. The previous text is kept in the note's history.", Level::Write,
            object(json!({ "path": path, "content": text }), &["path", "content"])),
        tool("append_to_note", "Append Markdown to the end of a note.", Level::Write, object(json!({ "path": path, "content": text }), &["path", "content"])),
        tool("add_to_daily_note", "Append Markdown to a day's note, creating it from the daily template if needed.", Level::Write,
            object(json!({ "text": text, "date": date }), &["text"])),
        tool("capture", "Add one timestamped line to Inbox.md.", Level::Write, object(json!({ "text": { "type": "string" } }), &["text"])),
        tool("complete_task", "Tick an open task. Pass the path, line, and text from list_tasks; refused if the line changed.", Level::Write,
            object(json!({ "path": path, "line": { "type": "integer" }, "text": { "type": "string" } }), &["path", "line", "text"])),
        tool("create_folder", "Create a folder.", Level::Write, object(json!({ "name": { "type": "string" }, "directory": { "type": "string" } }), &["name"])),
        tool("rename_note", "Rename a note or folder. Links that point to it are rewritten.", Level::Destructive,
            object(json!({ "path": path, "title": { "type": "string", "description": "New name" } }), &["path", "title"])),
        tool("move_note", "Move a note or folder into another folder. Links that point to it are rewritten.", Level::Destructive,
            object(json!({ "path": path, "directory": { "type": "string", "description": "Target folder; empty for the notes root" } }), &["path"])),
        tool("delete_note", "Move a note or folder to the system Trash.", Level::Destructive, object(json!({ "path": path }), &["path"])),
    ]
}

fn arg<'a>(args: &'a Value, key: &str) -> AppResult<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|v| !v.trim().is_empty())
        .ok_or_else(|| AppError::InvalidInput(format!("{key} is required")))
}

fn opt<'a>(args: &'a Value, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or("")
}

/// `date` with a format; the local time zone needs no extra dependency.
fn local(format: &str) -> String {
    Command::new("date")
        .arg(format)
        .output()
        .ok()
        .and_then(|out| String::from_utf8(out.stdout).ok())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "1970-01-01".into())
}

fn day(args: &Value) -> AppResult<String> {
    let date = opt(args, "date");
    if date.is_empty() {
        return Ok(local("+%Y-%m-%d"));
    }
    let ok = date.len() == 10
        && date.char_indices().all(|(i, c)| if i == 4 || i == 7 { c == '-' } else { c.is_ascii_digit() });
    ok.then(|| date.to_string())
        .ok_or_else(|| AppError::InvalidInput("date must look like 2026-10-18".into()))
}

fn bridge(root: &Path, level: Level, action: &str, args: Value) -> AppResult<Value> {
    let request = BridgeRequest { resource: "notes".into(), action: action.into(), args };
    Ok(agent_tools::execute(root, level.permission(), request)?.value)
}

fn exists(root: &Path, rel: &str) -> bool {
    notes::read_note(root, rel).is_ok()
}

/// Append `line` to `rel`, keeping exactly one newline between the old text
/// and the new, and one at the end.
fn append(root: &Path, rel: &str, line: &str) -> AppResult<()> {
    let current = notes::read_note(root, rel)?;
    let base = current.trim_end_matches('\n');
    let next = if base.is_empty() { format!("{}\n", line.trim_end()) } else { format!("{base}\n{}\n", line.trim_end()) };
    notes::write_note_forced_snapshot(root, rel, &next)
}

/// Make sure `rel` (`dir/Name.md`) exists, creating the folder and the note.
fn ensure_note(root: &Path, dir: &str, name: &str, initial: &str) -> AppResult<String> {
    let rel = if dir.is_empty() { format!("{name}.md") } else { format!("{dir}/{name}.md") };
    if exists(root, &rel) {
        return Ok(rel);
    }
    if !dir.is_empty() && vault::resolve_rel(root, dir).map(|p| !p.is_dir()).unwrap_or(true) {
        notes::create_folder(root, "", dir)?;
    }
    let created = notes::create_note(root, dir, name)?;
    if !initial.is_empty() {
        notes::write_note_forced_snapshot(root, &created, initial)?;
    }
    Ok(created)
}

fn flatten(nodes: &[vault::TreeNode], folder: &str, out: &mut Vec<Value>) {
    for node in nodes {
        if let Some(children) = &node.children {
            flatten(children, folder, out);
        } else if folder.is_empty() || node.rel.starts_with(&format!("{folder}/")) {
            out.push(json!({ "path": node.rel, "title": node.name, "modifiedMs": node.modified_ms }));
        }
    }
}

pub fn call(root: &Path, level: Level, name: &str, args: &Value) -> AppResult<Value> {
    let tool = tools()
        .into_iter()
        .find(|t| t.name == name)
        .ok_or_else(|| AppError::InvalidInput(format!("unknown tool: {name}")))?;
    if level == Level::Off {
        return Err(AppError::InvalidInput("agent access to this vault is off — turn it on in Ornata Settings".into()));
    }
    if level < tool.needs {
        return Err(AppError::InvalidInput(format!(
            "{name} needs {} access, but this vault allows {} — change it in Ornata Settings",
            tool.needs.label(),
            level.label()
        )));
    }
    match name {
        "vault_info" => Ok(json!({
            "root": root,
            "notes": vault::note_files(root).len(),
            "access": level.label(),
        })),
        "list_notes" => {
            let mut out = Vec::new();
            flatten(&vault::scan_tree(root)?, opt(args, "folder").trim_matches('/'), &mut out);
            Ok(Value::Array(out))
        }
        "read_note" => bridge(root, level, "read", json!({ "path": arg(args, "path")? })),
        "search_notes" => bridge(root, level, "search", args.clone()),
        "get_backlinks" => Ok(serde_json::to_value(backlinks::backlinks(root, arg(args, "path")?)?)?),
        "list_tasks" => Ok(serde_json::to_value(tasks::open_tasks(root)?)?),
        "get_daily_note" => {
            let rel = format!("journal/{}.md", day(args)?);
            Ok(match notes::read_note(root, &rel) {
                Ok(content) => json!({ "path": rel, "exists": true, "content": content }),
                Err(_) => json!({ "path": rel, "exists": false }),
            })
        }
        "create_note" => bridge(root, level, "create", args.clone()),
        "update_note" => bridge(root, level, "update", args.clone()),
        "create_folder" => bridge(root, level, "createFolder", args.clone()),
        "rename_note" => bridge(root, level, "rename", args.clone()),
        "move_note" => bridge(root, level, "move", args.clone()),
        "delete_note" => bridge(root, level, "delete", args.clone()),
        "append_to_note" => {
            let rel = arg(args, "path")?;
            append(root, rel, arg(args, "content")?)?;
            Ok(json!({ "path": rel }))
        }
        "add_to_daily_note" => {
            let date = day(args)?;
            let template = templates::read_template(root, "daily").unwrap_or_default();
            let rel = ensure_note(root, "journal", &date, &template)?;
            append(root, &rel, arg(args, "text")?)?;
            Ok(json!({ "path": rel }))
        }
        "capture" => {
            let text = arg(args, "text")?.split_whitespace().collect::<Vec<_>>().join(" ");
            let rel = ensure_note(root, "", "Inbox", "")?;
            append(root, &rel, &format!("- [{}] {text}", local("+%Y-%m-%d %H:%M")))?;
            Ok(json!({ "path": rel }))
        }
        "complete_task" => {
            let line = args
                .get("line")
                .and_then(Value::as_u64)
                .ok_or_else(|| AppError::InvalidInput("line is required".into()))? as usize;
            tasks::complete_task(root, arg(args, "path")?, line, arg(args, "text")?)?;
            Ok(json!({ "completed": true }))
        }
        _ => Err(AppError::InvalidInput(format!("unknown tool: {name}"))),
    }
}
