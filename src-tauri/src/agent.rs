use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{mpsc, Arc, Mutex};
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State};

use crate::agent_connection::{self, AgentConnectionConfig};
use crate::agent_tools;
use crate::agent_tools::AgentPermission;
use crate::agent_undo::{self, UndoLog};
use crate::commands::AppState;
use crate::error::{AppError, AppResult};

const PROTOCOL_VERSION: u8 = 1;
const SIDECAR_NAME: &str = "ornata-agent";

#[derive(Default)]
pub struct AgentState {
    backend: Mutex<Option<PiBackend>>,
    permission: Mutex<AgentPermission>,
    approvals: Mutex<HashMap<String, mpsc::SyncSender<bool>>>,
    oauth: Mutex<Option<OAuthBackend>>,
    undo: UndoLog,
}

trait AgentBackend {
    fn send(&mut self, message: &Value) -> AppResult<()>;
    fn running(&mut self) -> AppResult<bool>;
    fn abort(&mut self) -> AppResult<()>;
    fn shutdown(&mut self);
}

struct PiBackend {
    child: Child,
    stdin: ChildStdin,
    last_stderr: Arc<Mutex<Option<String>>>,
    connection_key: String,
}

struct OAuthBackend {
    child: Child,
    stdin: ChildStdin,
}

impl Drop for OAuthBackend {
    fn drop(&mut self) {
        let _ = write_jsonl(&mut self.stdin, &json!({ "type": "shutdown" }));
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
    }
}

impl AgentBackend for PiBackend {
    fn send(&mut self, message: &Value) -> AppResult<()> {
        write_jsonl(&mut self.stdin, message)
    }

    fn running(&mut self) -> AppResult<bool> {
        Ok(self.child.try_wait()?.is_none())
    }

    fn abort(&mut self) -> AppResult<()> {
        self.send(&json!({
            "type": "abort",
            "requestId": uuid::Uuid::new_v4().to_string(),
        }))
    }

    fn shutdown(&mut self) {
        let _ = self.send(&json!({ "type": "shutdown" }));
        if self.child.try_wait().ok().flatten().is_none() {
            let _ = self.child.kill();
        }
        let _ = self.child.wait();
    }
}

impl Drop for PiBackend {
    fn drop(&mut self) {
        self.shutdown();
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentStatus {
    configured: bool,
    running: bool,
    provider: Option<String>,
    model: Option<String>,
    runtime_version: &'static str,
    permission: AgentPermission,
}

#[derive(Debug, Clone)]
struct ReadyInfo {
    provider: String,
    model: String,
}

#[tauri::command]
pub fn agent_status(app: AppHandle, state: State<'_, AgentState>) -> AppResult<AgentStatus> {
    let running = backend_running(&state)?;
    let permission = current_permission(&state)?;
    let connection = agent_connection::active(&app)?;
    Ok(status(connection.as_ref(), running, permission))
}

#[tauri::command]
pub fn agent_start(
    app: AppHandle,
    vault: State<'_, AppState>,
    state: State<'_, AgentState>,
) -> AppResult<AgentStatus> {
    let root = vault.root()?;
    let connection = agent_connection::active(&app)?.ok_or_else(|| {
        AppError::NotFound("No AssistantPi model connection is configured".into())
    })?;
    connection.validate()?;
    let credential = agent_connection::credential(&connection)?;
    if connection.needs_stored_credential() && credential.is_none() {
        return Err(AppError::NotFound(
            "The model credential is missing from macOS Keychain".into(),
        ));
    }
    let connection_key = serde_json::to_string(&connection)?;

    {
        let mut guard = state
            .backend
            .lock()
            .map_err(|_| AppError::Other("agent state lock poisoned".into()))?;
        if let Some(backend) = guard.as_mut() {
            if backend.running()? && backend.connection_key == connection_key {
                return Ok(status(Some(&connection), true, current_permission(&state)?));
            }
        }
        guard.take();
    }

    let executable = sidecar_path()?;
    let mut child = Command::new(&executable)
        .current_dir(&root)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::Other(format!(
                "failed to start bundled AssistantPi runtime at {}: {error}",
                executable.display()
            ))
        })?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("AssistantPi stdout is unavailable".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Other("AssistantPi stderr is unavailable".into()))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Other("AssistantPi stdin is unavailable".into()))?;

    let last_stderr = Arc::new(Mutex::new(None));
    let (ready_tx, ready_rx) = mpsc::sync_channel(1);
    stream_stdout(app.clone(), stdout, ready_tx, Some(connection.slug.clone()));
    stream_stderr(app.clone(), stderr, last_stderr.clone());

    write_jsonl(
        &mut stdin,
        &json!({
            "type": "init",
            "protocolVersion": PROTOCOL_VERSION,
            "vaultRoot": root,
            "provider": connection.provider,
            "model": connection.model,
            "authType": connection.auth_type,
            "credential": credential,
            "baseUrl": connection.base_url,
            "endpointApi": connection.endpoint_api,
            "thinkingLevel": "medium",
        }),
    )?;

    let ready = match ready_rx.recv_timeout(Duration::from_secs(20)) {
        Ok(Ok(ready)) => ready,
        Ok(Err(error)) => {
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Other(error));
        }
        Err(_) => {
            let detail = last_stderr.lock().ok().and_then(|value| value.clone());
            let _ = child.kill();
            let _ = child.wait();
            return Err(AppError::Other(detail.unwrap_or_else(|| {
                "AssistantPi runtime did not become ready within 20 seconds".into()
            })));
        }
    };

    let backend = PiBackend {
        child,
        stdin,
        last_stderr,
        connection_key,
    };
    *state
        .backend
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))? = Some(backend);

    let mut result = status(Some(&connection), true, current_permission(&state)?);
    result.provider = Some(ready.provider);
    result.model = Some(ready.model);
    Ok(result)
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
    with_backend(&state, |backend| {
        backend.send(&json!({
            "type": "prompt",
            "requestId": uuid::Uuid::new_v4().to_string(),
            "message": wrapped,
        }))
    })
}

/// Start a fresh conversation; the previous one stays saved in the vault.
#[tauri::command]
pub fn agent_new_chat(state: State<'_, AgentState>) -> AppResult<()> {
    send_request(&state, "newChat", json!({}))
}

/// Ask for the saved conversations; they arrive as a `chats` event.
#[tauri::command]
pub fn agent_list_chats(state: State<'_, AgentState>) -> AppResult<()> {
    send_request(&state, "listChats", json!({}))
}

/// Reopen a saved conversation (the sidecar only accepts this vault's).
#[tauri::command]
pub fn agent_open_chat(path: String, state: State<'_, AgentState>) -> AppResult<()> {
    send_request(&state, "openChat", json!({ "path": path }))
}

fn send_request(state: &State<'_, AgentState>, kind: &str, fields: Value) -> AppResult<()> {
    let mut message = json!({ "type": kind, "requestId": uuid::Uuid::new_v4().to_string() });
    if let (Some(target), Some(extra)) = (message.as_object_mut(), fields.as_object()) {
        target.extend(extra.clone());
    }
    with_backend(state, |backend| backend.send(&message))
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
    if let Ok(mut approvals) = state.approvals.lock() {
        for (_, sender) in approvals.drain() {
            let _ = sender.send(false);
        }
    }
    with_backend(&state, AgentBackend::abort)
}

#[tauri::command]
pub fn agent_respond_approval(
    id: String,
    allow: bool,
    state: State<'_, AgentState>,
) -> AppResult<()> {
    let sender = state
        .approvals
        .lock()
        .map_err(|_| AppError::Other("agent approval lock poisoned".into()))?
        .remove(&id)
        .ok_or_else(|| AppError::NotFound("Agent approval request expired".into()))?;
    sender
        .send(allow)
        .map_err(|_| AppError::Other("Agent approval request is no longer active".into()))
}

#[tauri::command]
pub fn agent_stop(state: State<'_, AgentState>) -> AppResult<()> {
    state
        .backend
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?
        .take();
    Ok(())
}

#[tauri::command]
pub async fn agent_providers_list() -> AppResult<Value> {
    tauri::async_runtime::spawn_blocking(|| {
        utility_request(
            json!({
                "type": "listProviders",
                "requestId": uuid::Uuid::new_v4().to_string(),
            }),
            "providers",
            "providers",
        )
    })
    .await
    .map_err(|error| AppError::Other(format!("provider discovery task failed: {error}")))?
}

#[tauri::command]
pub async fn agent_models_list(provider: String) -> AppResult<Value> {
    if provider.trim().is_empty() || provider.len() > 100 {
        return Err(AppError::InvalidInput("invalid model provider".into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
        utility_request(
            json!({
                "type": "listModels",
                "requestId": uuid::Uuid::new_v4().to_string(),
                "provider": provider,
            }),
            "models",
            "models",
        )
    })
    .await
    .map_err(|error| AppError::Other(format!("model discovery task failed: {error}")))?
}

#[tauri::command]
pub fn agent_oauth_start(
    app: AppHandle,
    provider: String,
    slug: String,
    state: State<'_, AgentState>,
) -> AppResult<String> {
    if provider.trim().is_empty()
        || provider.len() > 100
        || slug.trim().is_empty()
        || !slug
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || "-_".contains(character))
    {
        return Err(AppError::InvalidInput(
            "provider and connection slug are required".into(),
        ));
    }
    let executable = sidecar_path()?;
    let mut child = Command::new(&executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| AppError::Other(format!("failed to start OAuth runtime: {error}")))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("OAuth runtime stdout is unavailable".into()))?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| AppError::Other("OAuth runtime stderr is unavailable".into()))?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Other("OAuth runtime stdin is unavailable".into()))?;
    let flow_id = uuid::Uuid::new_v4().to_string();
    write_jsonl(
        &mut stdin,
        &json!({ "type": "oauthStart", "requestId": flow_id, "provider": provider }),
    )?;
    stream_oauth_stdout(app.clone(), stdout, slug, flow_id.clone());
    stream_stderr(app, stderr, Arc::new(Mutex::new(None)));
    *state
        .oauth
        .lock()
        .map_err(|_| AppError::Other("OAuth state lock poisoned".into()))? =
        Some(OAuthBackend { child, stdin });
    Ok(flow_id)
}

#[tauri::command]
pub fn agent_oauth_respond(
    request_id: String,
    value: Option<String>,
    error: Option<String>,
    state: State<'_, AgentState>,
) -> AppResult<()> {
    let mut guard = state
        .oauth
        .lock()
        .map_err(|_| AppError::Other("OAuth state lock poisoned".into()))?;
    let oauth = guard
        .as_mut()
        .ok_or_else(|| AppError::NotFound("No OAuth flow is active".into()))?;
    write_jsonl(
        &mut oauth.stdin,
        &json!({
            "type": "oauthPromptResponse",
            "requestId": request_id,
            "value": value,
            "error": error,
        }),
    )
}

#[tauri::command]
pub fn agent_oauth_cancel(state: State<'_, AgentState>) -> AppResult<()> {
    state
        .oauth
        .lock()
        .map_err(|_| AppError::Other("OAuth state lock poisoned".into()))?
        .take();
    Ok(())
}

fn status(
    connection: Option<&AgentConnectionConfig>,
    running: bool,
    permission: AgentPermission,
) -> AgentStatus {
    AgentStatus {
        configured: connection.is_some(),
        running,
        provider: connection.map(|value| value.provider.clone()),
        model: connection.map(|value| value.model.clone()),
        runtime_version: env!("CARGO_PKG_VERSION"),
        permission,
    }
}

fn with_backend<T>(
    state: &AgentState,
    action: impl FnOnce(&mut PiBackend) -> AppResult<T>,
) -> AppResult<T> {
    let mut guard = state
        .backend
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?;
    let backend = guard
        .as_mut()
        .ok_or_else(|| AppError::Other("AssistantPi is not running".into()))?;
    if !backend.running()? {
        let error = exited_error(backend);
        *guard = None;
        return Err(AppError::Other(error));
    }
    action(backend)
}

fn backend_running(state: &AgentState) -> AppResult<bool> {
    let mut guard = state
        .backend
        .lock()
        .map_err(|_| AppError::Other("agent state lock poisoned".into()))?;
    let running = match guard.as_mut() {
        Some(backend) => backend.running()?,
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

pub(crate) fn sidecar_path() -> AppResult<PathBuf> {
    let current_exe = std::env::current_exe()?;
    if let Some(directory) = current_exe.parent() {
        for name in [
            SIDECAR_NAME,
            &format!("{SIDECAR_NAME}-{}-apple-darwin", std::env::consts::ARCH),
        ] {
            let candidate = directory.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    let development = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!(
            "{SIDECAR_NAME}-{}-apple-darwin",
            std::env::consts::ARCH
        ));
    if development.is_file() {
        return Ok(development);
    }
    Err(AppError::NotFound(
        "The bundled AssistantPi runtime is missing; run `bun run agent:build`".into(),
    ))
}

fn utility_request(request: Value, response_type: &str, field: &str) -> AppResult<Value> {
    let executable = sidecar_path()?;
    let mut child = Command::new(&executable)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| {
            AppError::Other(format!("failed to start AssistantPi runtime: {error}"))
        })?;
    let mut stdin = child
        .stdin
        .take()
        .ok_or_else(|| AppError::Other("AssistantPi stdin is unavailable".into()))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| AppError::Other("AssistantPi stdout is unavailable".into()))?;
    write_jsonl(&mut stdin, &request)?;
    let mut result = None;
    for line in BufReader::new(stdout).lines().take(10) {
        let value: Value = serde_json::from_str(&line?)?;
        match value.get("type").and_then(Value::as_str) {
            Some(kind) if kind == response_type => {
                result = value.get(field).cloned();
                break;
            }
            Some("error") => {
                let message = string_field(&value, "message")
                    .unwrap_or_else(|| "AssistantPi utility request failed".into());
                let _ = child.kill();
                let _ = child.wait();
                return Err(AppError::Other(message));
            }
            _ => {}
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    result.ok_or_else(|| AppError::Other(format!("AssistantPi did not return {response_type}")))
}

fn stream_oauth_stdout(
    app: AppHandle,
    stdout: impl std::io::Read + Send + 'static,
    slug: String,
    flow_id: String,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            match value.get("type").and_then(Value::as_str) {
                Some("oauthComplete") => {
                    let result = value
                        .get("credential")
                        .ok_or_else(|| AppError::InvalidInput("OAuth credential missing".into()))
                        .and_then(|credential| {
                            agent_connection::store_credential(&slug, credential)
                        });
                    let event = match result {
                        Ok(()) => json!({ "type": "complete", "flowId": flow_id }),
                        Err(error) => {
                            json!({ "type": "error", "flowId": flow_id, "message": error.to_string() })
                        }
                    };
                    let _ = app.emit("ornata-agent-oauth-event", event);
                    if let Ok(mut oauth) = app.state::<AgentState>().oauth.lock() {
                        oauth.take();
                    }
                    return;
                }
                Some("oauthEvent") | Some("oauthPrompt") => {
                    let _ = app.emit("ornata-agent-oauth-event", value);
                }
                Some("error") => {
                    let _ = app.emit(
                        "ornata-agent-oauth-event",
                        json!({
                            "type": "error",
                            "flowId": flow_id,
                            "message": string_field(&value, "message").unwrap_or_else(|| "OAuth failed".into()),
                        }),
                    );
                    if let Ok(mut oauth) = app.state::<AgentState>().oauth.lock() {
                        oauth.take();
                    }
                    return;
                }
                _ => {}
            }
        }
        if let Ok(mut oauth) = app.state::<AgentState>().oauth.lock() {
            oauth.take();
        }
    });
}

fn write_jsonl(stdin: &mut ChildStdin, value: &Value) -> AppResult<()> {
    serde_json::to_writer(&mut *stdin, value)?;
    stdin.write_all(b"\n")?;
    stdin.flush()?;
    Ok(())
}

fn exited_error(backend: &PiBackend) -> String {
    backend
        .last_stderr
        .lock()
        .ok()
        .and_then(|stderr| stderr.clone())
        .map(|detail| format!("AssistantPi runtime exited: {detail}"))
        .unwrap_or_else(|| "AssistantPi runtime exited unexpectedly".into())
}

fn stream_stdout(
    app: AppHandle,
    stdout: impl std::io::Read + Send + 'static,
    ready: mpsc::SyncSender<Result<ReadyInfo, String>>,
    credential_slug: Option<String>,
) {
    std::thread::spawn(move || {
        let mut ready_sent = false;
        for line in BufReader::new(stdout).lines() {
            let line = match line {
                Ok(line) if line.trim().is_empty() => continue,
                Ok(line) => line,
                Err(error) => {
                    let message = format!("AssistantPi output error: {error}");
                    if !ready_sent {
                        let _ = ready.send(Err(message.clone()));
                        ready_sent = true;
                    }
                    emit_event(&app, json!({ "type": "runtimeError", "message": message }));
                    break;
                }
            };
            let value = match serde_json::from_str::<Value>(&line) {
                Ok(value) => value,
                Err(_) => {
                    let message = format!("Unexpected AssistantPi output: {line}");
                    if !ready_sent {
                        let _ = ready.send(Err(message.clone()));
                        ready_sent = true;
                    }
                    emit_event(&app, json!({ "type": "runtimeError", "message": message }));
                    continue;
                }
            };
            match value.get("type").and_then(Value::as_str) {
                Some("ready") => {
                    let info = ReadyInfo {
                        provider: string_field(&value, "provider").unwrap_or_default(),
                        model: string_field(&value, "model").unwrap_or_default(),
                    };
                    if !ready_sent {
                        let _ = ready.send(Ok(info.clone()));
                        ready_sent = true;
                    }
                    emit_event(
                        &app,
                        json!({
                            "type": "ready",
                            "provider": info.provider,
                            "model": info.model,
                        }),
                    );
                }
                Some("event") => {
                    if let Some(event) = value.get("event") {
                        emit_event(&app, event.clone());
                    }
                }
                Some("toolRequest") => {
                    let app = app.clone();
                    std::thread::spawn(move || handle_tool_request(&app, &value));
                }
                Some("credentialUpdated") => {
                    if let (Some(slug), Some(credential)) =
                        (credential_slug.as_deref(), value.get("credential"))
                    {
                        if let Err(error) = agent_connection::store_credential(slug, credential) {
                            emit_event(
                                &app,
                                json!({ "type": "runtimeError", "message": error.to_string() }),
                            );
                        }
                    }
                }
                Some("error") => {
                    let message = string_field(&value, "message")
                        .unwrap_or_else(|| "AssistantPi request failed".into());
                    if !ready_sent {
                        let _ = ready.send(Err(message.clone()));
                        ready_sent = true;
                    }
                    emit_event(&app, json!({ "type": "runtimeError", "message": message }));
                }
                _ => {}
            }
        }
        if !ready_sent {
            let _ = ready.send(Err("AssistantPi runtime exited during startup".into()));
        }
        emit_event(&app, json!({ "type": "runtimeExited" }));
    });
}

fn handle_tool_request(app: &AppHandle, value: &Value) {
    let Some(request_id) = value.get("requestId").and_then(Value::as_str) else {
        return;
    };
    // Alongside the outcome: how to undo it (edits and creates), if it lands.
    let result = (|| -> AppResult<(agent_tools::BridgeOutcome, Option<agent_undo::Pending>, std::path::PathBuf)> {
        let request: agent_tools::BridgeRequest = serde_json::from_value(
            value
                .get("request")
                .cloned()
                .ok_or_else(|| AppError::InvalidInput("missing tool request".into()))?,
        )?;
        let root = app.state::<AppState>().root()?;
        let agent = app.state::<AgentState>();
        let permission = current_permission(&agent)?;
        let effective_permission = if permission == AgentPermission::ReadWrite && request.mutation()
        {
            let approval_id = uuid::Uuid::new_v4().to_string();
            let (sender, receiver) = mpsc::sync_channel(1);
            agent
                .approvals
                .lock()
                .map_err(|_| AppError::Other("agent approval lock poisoned".into()))?
                .insert(approval_id.clone(), sender);
            emit_event(
                app,
                json!({
                    "type": "approvalRequested",
                    "id": approval_id,
                    "resource": request.resource.clone(),
                    "action": request.action.clone(),
                    "args": request.args.clone(),
                }),
            );
            let allowed = receiver
                .recv_timeout(Duration::from_secs(300))
                .unwrap_or(false);
            if let Ok(mut approvals) = agent.approvals.lock() {
                approvals.remove(&approval_id);
            }
            emit_event(
                app,
                json!({ "type": "approvalResolved", "id": approval_id }),
            );
            if !allowed {
                return Err(AppError::InvalidInput(
                    "User denied this Agent action".into(),
                ));
            }
            AgentPermission::FullAccess
        } else {
            permission
        };
        let pending = agent_undo::before(&root, &request);
        let outcome = agent_tools::execute(&root, effective_permission, request)?;
        Ok((outcome, pending, root))
    })();

    let mut undo = None;
    let (response, mutation) = match result {
        Ok((outcome, pending, root)) => {
            undo = pending.and_then(|pending| agent_undo::after(&root, pending, &outcome.value));
            (
                json!({
                    "type": "toolResponse",
                    "requestId": request_id,
                    "ok": true,
                    "value": outcome.value,
                }),
                outcome.mutation,
            )
        }
        Err(error) => (
            json!({
                "type": "toolResponse",
                "requestId": request_id,
                "ok": false,
                "error": error.to_string(),
            }),
            None,
        ),
    };
    let state = app.state::<AgentState>();
    if let Err(error) = with_backend(&state, |backend| backend.send(&response)) {
        emit_event(
            app,
            json!({ "type": "runtimeError", "message": error.to_string() }),
        );
    } else if let Some(kind) = mutation {
        let _ = app.emit("ornata-agent-mutated", kind);
    }
    if let Some(record) = undo {
        let id = uuid::Uuid::new_v4().to_string();
        emit_event(
            app,
            json!({
                "type": "undoAvailable",
                "id": id,
                "action": record.action(),
                "path": record.rel(),
            }),
        );
        state.undo.insert(id, record);
    }
}

/// Reverse one of AssistantPi's edits or creates (see agent_undo).
#[tauri::command]
pub fn agent_undo(app: AppHandle, id: String, state: State<'_, AgentState>) -> AppResult<()> {
    let record = state
        .undo
        .take(&id)
        .ok_or_else(|| AppError::NotFound("This change can no longer be undone".into()))?;
    let root = app.state::<AppState>().root()?;
    if let Err(error) = agent_undo::apply(&root, &record) {
        // Keep it: the user may put the note back and try again.
        state.undo.insert(id, record);
        return Err(error);
    }
    let _ = app.emit("ornata-agent-mutated", agent_tools::MutationKind::Notes);
    Ok(())
}

fn emit_event(app: &AppHandle, event: Value) {
    let _ = app.emit("ornata-agent-event", event);
}

fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

fn stream_stderr(
    app: AppHandle,
    stderr: impl std::io::Read + Send + 'static,
    last_stderr: Arc<Mutex<Option<String>>>,
) {
    std::thread::spawn(move || {
        for line in BufReader::new(stderr).lines().map_while(Result::ok) {
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(mut last) = last_stderr.lock() {
                *last = Some(line.clone());
            }
            let _ = app.emit("assistantpi-runtime-log", line);
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_does_not_claim_configuration_without_connection() {
        let status = status(None, false, AgentPermission::ReadOnly);
        assert!(!status.configured);
        assert!(!status.running);
        assert!(status.model.is_none());
    }
}
