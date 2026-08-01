use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::{bookmarks, notes, search, todos, vault};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum AgentPermission {
    #[default]
    ReadOnly,
    ReadWrite,
    FullAccess,
}

impl AgentPermission {
    pub fn prompt(self) -> &'static str {
        match self {
            Self::ReadOnly => "READ ONLY. Pi may use read, grep, find, and ls. Ornata data may only be listed, searched, and read.",
            Self::ReadWrite => "ASK TO EDIT. Read operations run automatically. Every mutation requires explicit user approval from the Ornata host.",
            Self::FullAccess => "AUTO. Ornata CRUD actions may run without per-action approval. Use destructive actions only when required by the user's request.",
        }
    }

    fn permits(self, requirement: PermissionRequirement) -> bool {
        match requirement {
            PermissionRequirement::Read => true,
            PermissionRequirement::Write => self != Self::ReadOnly,
            PermissionRequirement::Destructive => self == Self::FullAccess,
        }
    }
}

#[derive(Clone, Copy)]
enum PermissionRequirement {
    Read,
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

impl BridgeRequest {
    pub fn mutation(&self) -> bool {
        !matches!(
            (self.resource.as_str(), self.action.as_str()),
            ("notes", "list" | "search" | "read")
                | ("todos", "list" | "listTags")
                | ("bookmarks", "list" | "listTags")
                | ("permission", _)
        )
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MutationKind {
    Notes,
    Todos,
    Bookmarks,
    All,
}

pub struct BridgeOutcome {
    pub value: Value,
    pub mutation: Option<MutationKind>,
}

pub fn execute(
    root: &Path,
    permission: AgentPermission,
    request: BridgeRequest,
) -> AppResult<BridgeOutcome> {
    match request.resource.as_str() {
        "notes" => execute_notes(root, permission, &request.action, &request.args),
        "todos" => execute_todos(root, permission, &request.action, &request.args),
        "bookmarks" => execute_bookmarks(root, permission, &request.action, &request.args),
        "permission" => execute_permission(permission, &request.action, &request.args),
        _ => Err(AppError::InvalidInput("unknown agent resource".into())),
    }
}

fn execute_permission(
    permission: AgentPermission,
    action: &str,
    args: &Value,
) -> AppResult<BridgeOutcome> {
    match action {
        "authorizeTool" => {
            let tool = required_string(args, "tool")?;
            let needed = match tool {
                "read" | "grep" | "find" | "ls" => PermissionRequirement::Read,
                "edit" | "write" => PermissionRequirement::Write,
                "bash" => PermissionRequirement::Destructive,
                _ => PermissionRequirement::Destructive,
            };
            let allowed = permission.permits(needed);
            Ok(BridgeOutcome {
                value: json!({
                    "allowed": allowed,
                    "reason": (!allowed).then(|| format!("{tool} is blocked in the selected permission mode")),
                }),
                mutation: None,
            })
        }
        "toolCompleted" => {
            let tool = required_string(args, "tool")?;
            let mutation = match tool {
                "edit" | "write" => Some(MutationKind::Notes),
                "bash" => Some(MutationKind::All),
                _ => None,
            };
            Ok(BridgeOutcome {
                value: json!({ "recorded": true }),
                mutation,
            })
        }
        _ => Err(AppError::InvalidInput(format!(
            "unknown permission action: {action}"
        ))),
    }
}

fn execute_notes(
    root: &Path,
    permission: AgentPermission,
    action: &str,
    args: &Value,
) -> AppResult<BridgeOutcome> {
    let (value, mutation) = match action {
        "list" => (serde_json::to_value(vault::scan_tree(root))?, None),
        "search" => {
            let query = required_string(args, "query")?;
            let limit = args
                .get("limit")
                .and_then(Value::as_u64)
                .unwrap_or(20)
                .min(100) as usize;
            (
                serde_json::to_value(search::search_notes(root, query, limit)?)?,
                None,
            )
        }
        "read" => (
            json!({ "content": notes::read_note(root, required_string(args, "path")?)? }),
            None,
        ),
        "create" => {
            require(permission, PermissionRequirement::Write, action)?;
            let rel = notes::create_note(
                root,
                optional_string(args, "directory"),
                required_string(args, "title")?,
            )?;
            if let Some(content) = args.get("content").and_then(Value::as_str) {
                notes::write_note(root, &rel, content)?;
            }
            (json!({ "path": rel }), Some(MutationKind::Notes))
        }
        "update" => {
            require(permission, PermissionRequirement::Write, action)?;
            let path = required_string(args, "path")?;
            notes::write_note(root, path, required_string(args, "content")?)?;
            (json!({ "path": path }), Some(MutationKind::Notes))
        }
        "createFolder" => {
            require(permission, PermissionRequirement::Write, action)?;
            let rel = notes::create_folder(
                root,
                optional_string(args, "directory"),
                required_string(args, "name")?,
            )?;
            (json!({ "path": rel }), Some(MutationKind::Notes))
        }
        "rename" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            let rel = notes::rename_entry(
                root,
                required_string(args, "path")?,
                required_string(args, "title")?,
            )?;
            (json!({ "path": rel }), Some(MutationKind::Notes))
        }
        "move" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            let rel = notes::move_entry(
                root,
                required_string(args, "path")?,
                optional_string(args, "directory"),
            )?;
            (json!({ "path": rel }), Some(MutationKind::Notes))
        }
        "delete" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            notes::delete_entry(root, required_string(args, "path")?)?;
            (json!({ "deleted": true }), Some(MutationKind::Notes))
        }
        _ => {
            return Err(AppError::InvalidInput(format!(
                "unknown notes action: {action}"
            )))
        }
    };
    Ok(BridgeOutcome { value, mutation })
}

fn execute_todos(
    root: &Path,
    permission: AgentPermission,
    action: &str,
    args: &Value,
) -> AppResult<BridgeOutcome> {
    let (value, mutation) = match action {
        "list" => (serde_json::to_value(todos::list(root)?)?, None),
        "listTags" => (serde_json::to_value(todos::list_tags(root)?)?, None),
        "add" => {
            require(permission, PermissionRequirement::Write, action)?;
            let mut todo = todos::add(root, required_string(args, "text")?)?;
            if let Some(tags) = optional_strings(args, "tags")? {
                todo = todos::set_tags(root, &todo.id, tags)?;
            }
            (serde_json::to_value(todo)?, Some(MutationKind::Todos))
        }
        "update" => {
            require(permission, PermissionRequirement::Write, action)?;
            (
                serde_json::to_value(todos::update_text(
                    root,
                    required_string(args, "id")?,
                    required_string(args, "text")?,
                )?)?,
                Some(MutationKind::Todos),
            )
        }
        "toggle" => {
            require(permission, PermissionRequirement::Write, action)?;
            (
                serde_json::to_value(todos::toggle(root, required_string(args, "id")?)?)?,
                Some(MutationKind::Todos),
            )
        }
        "setTags" => {
            require(permission, PermissionRequirement::Write, action)?;
            let tags = optional_strings(args, "tags")?.unwrap_or_default();
            (
                serde_json::to_value(todos::set_tags(root, required_string(args, "id")?, tags)?)?,
                Some(MutationKind::Todos),
            )
        }
        "createTag" => {
            require(permission, PermissionRequirement::Write, action)?;
            (
                serde_json::to_value(todos::create_tag(root, required_string(args, "name")?)?)?,
                Some(MutationKind::Todos),
            )
        }
        "deleteTag" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            (
                serde_json::to_value(todos::delete_tag(root, required_string(args, "name")?)?)?,
                Some(MutationKind::Todos),
            )
        }
        "delete" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            todos::delete(root, required_string(args, "id")?)?;
            (json!({ "deleted": true }), Some(MutationKind::Todos))
        }
        "clearCompleted" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            (
                serde_json::to_value(todos::clear_completed(root)?)?,
                Some(MutationKind::Todos),
            )
        }
        _ => {
            return Err(AppError::InvalidInput(format!(
                "unknown todos action: {action}"
            )))
        }
    };
    Ok(BridgeOutcome { value, mutation })
}

fn execute_bookmarks(
    root: &Path,
    permission: AgentPermission,
    action: &str,
    args: &Value,
) -> AppResult<BridgeOutcome> {
    let (value, mutation) = match action {
        "list" => (serde_json::to_value(bookmarks::list(root)?)?, None),
        "listTags" => (serde_json::to_value(bookmarks::list_tags(root)?)?, None),
        "add" => {
            require(permission, PermissionRequirement::Write, action)?;
            let mut bookmark = bookmarks::add(root, required_string(args, "url")?)?;
            if let Some(tags) = optional_strings(args, "tags")? {
                bookmark = bookmarks::set_tags(root, &bookmark.id, tags)?;
            }
            (
                serde_json::to_value(bookmark)?,
                Some(MutationKind::Bookmarks),
            )
        }
        "updateTitle" => {
            require(permission, PermissionRequirement::Write, action)?;
            let bookmark = bookmarks::update(
                root,
                required_string(args, "id")?,
                Some(required_string(args, "title")?.to_string()),
                None,
                None,
                None,
            )?;
            (
                serde_json::to_value(bookmark)?,
                Some(MutationKind::Bookmarks),
            )
        }
        "setTags" => {
            require(permission, PermissionRequirement::Write, action)?;
            let tags = optional_strings(args, "tags")?.unwrap_or_default();
            (
                serde_json::to_value(bookmarks::set_tags(
                    root,
                    required_string(args, "id")?,
                    tags,
                )?)?,
                Some(MutationKind::Bookmarks),
            )
        }
        "createTag" => {
            require(permission, PermissionRequirement::Write, action)?;
            (
                serde_json::to_value(bookmarks::create_tag(root, required_string(args, "name")?)?)?,
                Some(MutationKind::Bookmarks),
            )
        }
        "deleteTag" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            (
                serde_json::to_value(bookmarks::delete_tag(root, required_string(args, "name")?)?)?,
                Some(MutationKind::Bookmarks),
            )
        }
        "delete" => {
            require(permission, PermissionRequirement::Destructive, action)?;
            bookmarks::delete(root, required_string(args, "id")?)?;
            (json!({ "deleted": true }), Some(MutationKind::Bookmarks))
        }
        _ => {
            return Err(AppError::InvalidInput(format!(
                "unknown bookmarks action: {action}"
            )))
        }
    };
    Ok(BridgeOutcome { value, mutation })
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

fn optional_strings(args: &Value, key: &str) -> AppResult<Option<Vec<String>>> {
    let Some(values) = args.get(key) else {
        return Ok(None);
    };
    let values = values
        .as_array()
        .ok_or_else(|| AppError::InvalidInput(format!("{key} must be an array")))?;
    values
        .iter()
        .map(|value| {
            value
                .as_str()
                .map(str::to_string)
                .ok_or_else(|| AppError::InvalidInput(format!("{key} must contain strings")))
        })
        .collect::<AppResult<Vec<_>>>()
        .map(Some)
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
    fn full_access_manages_todos_and_bookmarks() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        for (resource, action, args) in [
            ("todos", "add", json!({ "text": "Ship it" })),
            ("bookmarks", "add", json!({ "url": "ornata.app" })),
        ] {
            let request: BridgeRequest = serde_json::from_value(json!({
                "resource": resource, "action": action, "args": args
            }))
            .unwrap();
            assert!(execute(dir.path(), AgentPermission::FullAccess, request).is_ok());
        }
    }

    #[test]
    fn builtin_tool_permissions_match_the_three_modes() {
        let authorize = |permission, tool| {
            let request: BridgeRequest = serde_json::from_value(json!({
                "resource": "permission",
                "action": "authorizeTool",
                "args": { "tool": tool }
            }))
            .unwrap();
            execute(Path::new("/unused"), permission, request)
                .unwrap()
                .value["allowed"]
                .as_bool()
                .unwrap()
        };

        assert!(authorize(AgentPermission::ReadOnly, "read"));
        assert!(!authorize(AgentPermission::ReadOnly, "write"));
        assert!(authorize(AgentPermission::ReadWrite, "edit"));
        assert!(!authorize(AgentPermission::ReadWrite, "bash"));
        assert!(authorize(AgentPermission::FullAccess, "bash"));
    }
}
