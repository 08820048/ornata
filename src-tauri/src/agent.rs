use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Arc, Mutex};

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, State};

use crate::agent_tools::AgentPermission;
use crate::commands::AppState;
use crate::error::{AppError, AppResult};
use crate::vault::DATA_DIR;
use crate::{agent_bridge, agent_locator};

const SYSTEM_PROMPT: &str = "You are AssistantPi, Ornata's notes assistant. Use the Ornata tools for structured note, todo, and bookmark operations. Each user message includes the currently selected permission mode. Respect it exactly; the host also enforces it. In lower permission modes, do not attempt blocked tools. In Full Access, you may use all Pi tools and work outside the vault only when the user's request requires it. Use the least-destructive action that satisfies the request. Be concise and preserve the user's language. Keep responses visually clean: avoid emoji, emoticons, and decorative symbols unless the user explicitly asks for them or they are necessary when quoting source text.";
const EXTENSION_SOURCE: &str = include_str!("../assistantpi-extension.ts");
const EXTENSION_FILE: &str = "assistantpi-extension.ts";

#[derive(Default)]
pub struct AgentState {
    process: Mutex<Option<AgentProcess>>,
    permission: Mutex<AgentPermission>,
}

struct AgentProcess {
    child: Child,
    stdin: ChildStdin,
    last_stderr: Arc<Mutex<Option<String>>>,
}

impl Drop for AgentProcess {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiStatus {
    installed: bool,
    running: bool,
    path: Option<String>,
    version: Option<String>,
    permission: AgentPermission,
}

#[tauri::command]
pub async fn agent_status(state: State<'_, AgentState>) -> AppResult<PiStatus> {
    let running = process_running(&state)?;
    let permission = current_permission(&state)?;
    let located = agent_locator::locate_in_background().await?;
    Ok(PiStatus {
        installed: located.is_some(),
        running,
        path: located.as_ref().map(|pi| pi.path.display().to_string()),
        version: None,
        permission,
    })
}

#[tauri::command]
pub async fn agent_start(
    app: AppHandle,
    vault: State<'_, AppState>,
    state: State<'_, AgentState>,
) -> AppResult<PiStatus> {
    let root = vault.root()?;
    let extension_path = ensure_extension(&root)?;
    let permission = current_permission(&state)?;
    let located = agent_locator::locate_in_background()
        .await?
        .ok_or_else(|| {
            AppError::NotFound(
                "Pi is not installed or could not be found in your login PATH".into(),
            )
        })?;

    let mut guard = state
        .process
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?;
    if let Some(process) = guard.as_mut() {
        if process.child.try_wait()?.is_none() {
            return Ok(PiStatus {
                installed: true,
                running: true,
                path: Some(located.path.display().to_string()),
                version: None,
                permission,
            });
        }
        *guard = None;
    }

    let mut child = Command::new(&located.path)
        .args([
            "--mode",
            "rpc",
            "--no-session",
            "--tools",
            "read,bash,edit,write,grep,find,ls,ornata_notes,ornata_todos,ornata_bookmarks",
        ])
        .arg("--extension")
        .arg(&extension_path)
        .args([
            "--no-extensions",
            "--no-skills",
            "--no-prompt-templates",
            "--no-context-files",
            "--append-system-prompt",
            SYSTEM_PROMPT,
        ])
        .current_dir(&root)
        .env("PATH", &located.env_path)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::Other(format!("failed to start Pi: {error}")))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("Pi stdout is unavailable".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Other("Pi stderr is unavailable".into()))?;
    let stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Other("Pi stdin is unavailable".into()))?;

    let last_stderr = Arc::new(Mutex::new(None));
    stream_stdout(app.clone(), stdout);
    stream_stderr(app, stderr, last_stderr.clone());

    let mut process = AgentProcess {
        child,
        stdin,
        last_stderr,
    };
    write_rpc(&mut process.stdin, &json!({ "type": "get_state" }))?;
    *guard = Some(process);

    Ok(PiStatus {
        installed: true,
        running: true,
        path: Some(located.path.display().to_string()),
        version: None,
        permission,
    })
}

#[tauri::command]
pub fn agent_send(message: String, state: State<'_, AgentState>) -> AppResult<()> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::InvalidInput("message cannot be empty".into()));
    }
    if message.len() > 32_000 {
        return Err(AppError::InvalidInput("message is too long".into()));
    }
    let permission = current_permission(&state)?;
    let wrapped = format!(
        "<ornata-permission>{}</ornata-permission>\n\n{}",
        permission.prompt(),
        message
    );
    with_process(&state, |process| {
        write_rpc(
            &mut process.stdin,
            &json!({ "type": "prompt", "message": wrapped }),
        )
    })
}

#[tauri::command]
pub fn agent_set_permission(
    permission: AgentPermission,
    state: State<'_, AgentState>,
) -> AppResult<()> {
    *state
        .permission
        .lock()
        .map_err(|_| AppError::Other("agent permission lock poisoned".into()))? = permission;
    Ok(())
}

#[tauri::command]
pub fn agent_abort(state: State<'_, AgentState>) -> AppResult<()> {
    with_process(&state, |process| {
        write_rpc(&mut process.stdin, &json!({ "type": "abort" }))
    })
}

#[tauri::command]
pub fn agent_stop(state: State<'_, AgentState>) -> AppResult<()> {
    let process = state
        .process
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?
        .take();
    drop(process);
    Ok(())
}

fn with_process<T>(
    state: &AgentState,
    action: impl FnOnce(&mut AgentProcess) -> AppResult<T>,
) -> AppResult<T> {
    let mut guard = state
        .process
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?;
    let process = guard
        .as_mut()
        .ok_or_else(|| AppError::Other("Pi agent is not running".into()))?;
    if let Some(status) = process.child.try_wait()? {
        let error = exited_error(process, status);
        *guard = None;
        return Err(AppError::Other(error));
    }
    action(process)
}

fn process_running(state: &AgentState) -> AppResult<bool> {
    let mut guard = state
        .process
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?;
    let running = match guard.as_mut() {
        Some(process) => process.child.try_wait()?.is_none(),
        None => false,
    };
    if !running {
        *guard = None;
    }
    Ok(running)
}

pub(crate) fn current_permission(state: &AgentState) -> AppResult<AgentPermission> {
    state
        .permission
        .lock()
        .map(|permission| *permission)
        .map_err(|_| AppError::Other("agent permission lock poisoned".into()))
}

pub(crate) fn send_rpc(state: &AgentState, value: &Value) -> AppResult<()> {
    with_process(state, |process| write_rpc(&mut process.stdin, value))
}

fn ensure_extension(root: &Path) -> AppResult<PathBuf> {
    let path = root.join(DATA_DIR).join(EXTENSION_FILE);
    let current = std::fs::read_to_string(&path).ok();
    if current.as_deref() != Some(EXTENSION_SOURCE) {
        std::fs::write(&path, EXTENSION_SOURCE)?;
    }
    Ok(path)
}

fn write_rpc(stdin: &mut ChildStdin, value: &Value) -> AppResult<()> {
    serde_json::to_writer(&mut *stdin, value)?;
    stdin.write_all(b"\n")?;
    stdin.flush()?;
    Ok(())
}

fn exited_error(process: &AgentProcess, status: std::process::ExitStatus) -> String {
    let detail = process
        .last_stderr
        .lock()
        .ok()
        .and_then(|stderr| stderr.clone());
    match detail {
        Some(detail) => format!("Pi agent exited ({status}): {detail}"),
        None => format!("Pi agent exited ({status})"),
    }
}

fn stream_stdout(app: AppHandle, stdout: impl std::io::Read + Send + 'static) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines() {
            match line {
                Ok(line) if line.trim().is_empty() => {}
                Ok(line) => match serde_json::from_str::<Value>(&line) {
                    Ok(value) => {
                        if !agent_bridge::handle(&app, &value) {
                            let _ = app.emit("pi-agent-event", value);
                        }
                    }
                    Err(_) => {
                        let _ =
                            app.emit("pi-agent-stderr", format!("Unexpected Pi output: {line}"));
                    }
                },
                Err(error) => {
                    let _ = app.emit("pi-agent-stderr", format!("Pi output error: {error}"));
                    break;
                }
            }
        }
        let _ = app.emit("pi-agent-exit", ());
    });
}

fn stream_stderr(
    app: AppHandle,
    stderr: impl std::io::Read + Send + 'static,
    last_stderr: Arc<Mutex<Option<String>>>,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if !line.trim().is_empty() {
                if let Ok(mut last) = last_stderr.lock() {
                    *last = Some(line.clone());
                }
                let _ = app.emit("pi-agent-stderr", line);
            }
        }
    });
}
