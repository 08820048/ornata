use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::{notes, search, vault, vault_guard};

/// What a caller may do to the vault's notes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentPermission {
    #[default]
    ReadOnly,
    ReadWrite,
    FullAccess,
}

impl AgentPermission {
    fn permits(self, requirement: PermissionRequirement) -> bool {
        match requirement {
            PermissionRequirement::Write => self != Self::ReadOnly,
            PermissionRequirement::Destructive => self == Self::FullAccess,
        }
    }
}

#[derive(Clone, Copy)]
enum PermissionRequirement {
    Write,
    Destructive,
}

#[derive(Debug, Deserialize)]
pub struct BridgeRequest {
    pub(crate) resource: String,
    pub(crate) action: String,
    #[serde(default)]
    pub(crate) args: Value,
}

pub struct BridgeOutcome {
    pub value: Value,
}

pub fn execute(
    root: &Path,
    permission: AgentPermission,
    request: BridgeRequest,
) -> AppResult<BridgeOutcome> {
    match request.resource.as_str() {
        "notes" => execute_notes(root, permission, &request.action, &request.args),
        _ => Err(AppError::InvalidInput("unknown resource".into())),
    }
}

fn execute_notes(
    root: &Path,
    permission: AgentPermission,
    action: &str,
    args: &Value,
) -> AppResult<BridgeOutcome> {
    // Agents only ever touch notes that really live in the vault: a symlink in
    // notes/ pointing elsewhere is refused (see vault_guard).
    if let Some(path) = args.get("path").and_then(Value::as_str) {
        vault_guard::contained_rel(root, path)?;
    }
    let directory = optional_string(args, "directory");
    if !directory.is_empty() {
        vault_guard::contained_rel(root, directory)?;
    }
    let value = match action {
        "list" => serde_json::to_value(vault_guard::retain_tree(root, vault::scan_tree(root)?))?,
        "search" => {
            let query = required_string(args, "query")?;
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .min(100) as usize;
            let hits: Vec<_> = search::search_notes(root, query, limit)?
                .into_iter()
                .filter(|hit| vault_guard::rel_inside(root, &hit.rel))
                .collect();
            serde_json::to_value(hits)?
        }
        "read" => json!({ "content": notes::read_note(root, required_string(args, "path")?)? }),
        "create" => {
            require(permission, PermissionRequirement::Write, action)?;
            let rel = notes::create_note(
                root,
                optional_string(args, "directory"),
                required_string(args, "title")?,
            )?;
            if let Some(content) = args.get("content").and_then(Value::as_str) {
                notes::write_note_forced_snapshot(root, &rel, content)?;
            }
            json!({ "path": rel })
        }
        "update" => {
            require(permission, PermissionRequirement::Write, action)?;
            let path = required_string(args, "path")?;
            notes::write_note_forced_snapshot(root, path, required_string(args, "content")?)?;
            json!({ "path": path })
        }
        "createFolder" => {
            require(permission, PermissionRequirement::Write, action)?;
            let rel = notes::create_folder(
                root,
                optional_string(args, "directory"),
                required_string(args, "name")?,
            )?;
            json!({ "path": rel })
        }
        "rename" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            let rel = notes::rename_entry(
                root,
                required_string(args, "path")?,
                required_string(args, "title")?,
            )?;
            json!({ "path": rel })
        }
        "move" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            let rel = notes::move_entry(
                root,
                required_string(args, "path")?,
                optional_string(args, "directory"),
            )?;
            json!({ "path": rel })
        }
        "delete" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            notes::delete_entry(root, required_string(args, "path")?)?;
            json!({ "deleted": true })
        }
        _ => {
            return Err(AppError::InvalidInput(format!(
                "unknown notes action: {action}"
            )))
        }
    };
    Ok(BridgeOutcome { value })
}

fn require(
    permission: AgentPermission,
    needed: PermissionRequirement,
    action: &str,
) -> AppResult<()> {
    permission.permits(needed).then_some(()).ok_or_else(|| {
        AppError::InvalidInput(format!(
            "{action} is blocked in the selected permission mode"
        ))
    })
}

fn required_string<'a>(args: &'a Value, key: &str) -> AppResult<&'a str> {
    args.get(key)
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::InvalidInput(format!("{key} is required")))
}

fn optional_string<'a>(args: &'a Value, key: &str) -> &'a str {
    args.get(key).and_then(Value::as_str).unwrap_or("")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    #[test]
    fn read_only_blocks_mutations() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let request: BridgeRequest = serde_json::from_value(json!({
            "resource": "notes", "action": "create", "args": { "title": "Nope" }
        }))
        .unwrap();
        assert!(execute(dir.path(), AgentPermission::ReadOnly, request).is_err());
    }

    #[test]
    fn read_write_creates_but_cannot_delete() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let create: BridgeRequest = serde_json::from_value(json!({
            "resource": "notes", "action": "create", "args": { "title": "Allowed", "content": "hello" }
        })).unwrap();
        let outcome = execute(dir.path(), AgentPermission::ReadWrite, create).unwrap();
        assert_eq!(outcome.value["path"], "Allowed.md");

        let delete: BridgeRequest = serde_json::from_value(json!({
            "resource": "notes", "action": "delete", "args": { "path": "Allowed.md" }
        }))
        .unwrap();
        assert!(execute(dir.path(), AgentPermission::ReadWrite, delete).is_err());
    }

    #[test]
    fn unknown_resources_are_refused() {
        let request: BridgeRequest = serde_json::from_value(json!({
            "resource": "bash", "action": "run", "args": { "command": "ls" }
        }))
        .unwrap();
        assert!(execute(Path::new("/unused"), AgentPermission::FullAccess, request).is_err());
    }
}
