use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

use crate::error::{AppError, AppResult};
use crate::{notes, search, vault, vault_guard};

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
            Self::ReadOnly => "READ ONLY. Pi may use read, grep, find, ls, web_search, and web_fetch. Ornata data may only be listed, searched, and read. Shell commands are blocked.",
            Self::ReadWrite => "ASK TO EDIT. Read operations, web search, and web fetch run automatically. Every mutation — including any shell command — requires explicit user approval from the Ornata host.",
            Self::FullAccess => "AUTO. Ornata CRUD actions and shell commands may run without per-action approval. Use destructive actions only when required by the user's request.",
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
            ("notes", "list" | "search" | "read") | ("permission", _)
        )
    }
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum MutationKind {
    Notes,
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
        "bash" => execute_bash(root, permission, &request.action, &request.args),
        "permission" => execute_permission(permission, &request.action, &request.args),
        _ => Err(AppError::InvalidInput("unknown agent resource".into())),
    }
}

/// Run a shell command inside the vault working directory. Treated as
/// destructive: full-access only. Output is capped so a runaway command
/// can't flood the model context.
fn execute_bash(
    root: &Path,
    permission: AgentPermission,
    action: &str,
    args: &Value,
) -> AppResult<BridgeOutcome> {
    if action != "run" {
        return Err(AppError::InvalidInput(format!(
            "unknown bash action: {action}"
        )));
    }
    require(permission, PermissionRequirement::Destructive, action)?;
    let command = required_string(args, "command")?;
    if command.len() > 8_000 {
        return Err(AppError::InvalidInput("command is too long".into()));
    }
    let timeout = args
        .get("timeout")
        .and_then(Value::as_u64)
        .unwrap_or(30)
        .clamp(1, 120);

    use std::process::{Command, Stdio};
    use std::time::Instant;
    let mut child = Command::new("/bin/zsh")
        .arg("-c")
        .arg(command)
        .current_dir(root)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::Other(format!("failed to spawn shell: {error}")))?;

    // Drain pipes on threads so a chatty command can't fill the OS pipe
    // buffer and deadlock while we poll for exit.
    let stdout_handle = child.stdout.take().map(spawn_drain);
    let stderr_handle = child.stderr.take().map(spawn_drain);

    let deadline = Instant::now() + std::time::Duration::from_secs(timeout);
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() >= deadline => {
                let _ = child.kill();
                let _ = child.wait();
                // Join drains so the threads never leak.
                if let Some(handle) = stdout_handle {
                    let _ = handle.join();
                }
                if let Some(handle) = stderr_handle {
                    let _ = handle.join();
                }
                return Err(AppError::Other(format!(
                    "command timed out after {timeout}s"
                )));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(error) => {
                return Err(AppError::Other(format!("shell wait failed: {error}")))
            }
        }
    };
    let stdout = stdout_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    let stderr = stderr_handle
        .and_then(|handle| handle.join().ok())
        .unwrap_or_default();
    let exit_code = status.code().unwrap_or(-1);
    Ok(BridgeOutcome {
        value: json!({
            "exitCode": exit_code,
            "stdout": stdout,
            "stderr": stderr,
        }),
        mutation: Some(MutationKind::All),
    })
}

/// Read a child pipe to end on a helper thread, returning the (clipped) text.
fn spawn_drain(
    pipe: impl std::io::Read + Send + 'static,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut text = String::new();
        let mut reader = pipe;
        let _ = std::io::Read::read_to_string(&mut reader, &mut text);
        let mut result: String = text.chars().take(20_000).collect();
        if text.chars().count() > 20_000 {
            result.push_str("\n…[truncated]");
        }
        result
    })
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
                "read" | "grep" | "find" | "ls" | "web_fetch" | "web_search" => {
                    PermissionRequirement::Read
                }
                "edit" | "write" => PermissionRequirement::Write,
                "bash" | "ornata_bash" => PermissionRequirement::Destructive,
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
                "bash" | "ornata_bash" => Some(MutationKind::All),
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
    // Agents only ever touch notes that really live in the vault: a symlink in
    // notes/ pointing elsewhere is refused (see vault_guard).
    if let Some(path) = args.get("path").and_then(Value::as_str) {
        vault_guard::contained_rel(root, path)?;
    }
    let directory = optional_string(args, "directory");
    if !directory.is_empty() {
        vault_guard::contained_rel(root, directory)?;
    }
    let (value, mutation) = match action {
        "list" => (
            serde_json::to_value(vault_guard::retain_tree(root, vault::scan_tree(root)?))?,
            None,
        ),
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
            (serde_json::to_value(hits)?, None)
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
                notes::write_note_forced_snapshot(root, &rel, content)?;
            }
            (json!({ "path": rel }), Some(MutationKind::Notes))
        }
        "update" => {
            require(permission, PermissionRequirement::Write, action)?;
            let path = required_string(args, "path")?;
            notes::write_note_forced_snapshot(root, path, required_string(args, "content")?)?;
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
