//! Reader threads for the AssistantPi sidecar: stdout events, OAuth flow,
//! tool-bridge requests and stderr logging.

use super::*;

pub(super) fn stream_oauth_stdout(
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

pub(super) fn stream_stdout(
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

pub(super) fn handle_tool_request(app: &AppHandle, value: &Value) {
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

pub(super) fn emit_event(app: &AppHandle, event: Value) {
    let _ = app.emit("ornata-agent-event", event);
}

pub(super) fn string_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_string)
}

pub(super) fn stream_stderr(
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
