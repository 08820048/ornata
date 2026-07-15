use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager};

use crate::agent::{current_permission, send_rpc, AgentState};
use crate::agent_tools::{self, BridgeRequest};
use crate::commands::AppState;
use crate::error::{AppError, AppResult};

const BRIDGE_TITLE: &str = "__ORNATA_BRIDGE__";

pub fn handle(app: &AppHandle, value: &Value) -> bool {
    if value.get("type").and_then(Value::as_str) != Some("extension_ui_request")
        || value.get("method").and_then(Value::as_str) != Some("input")
        || value.get("title").and_then(Value::as_str) != Some(BRIDGE_TITLE)
    {
        return false;
    }

    let Some(id) = value.get("id").and_then(Value::as_str) else {
        return true;
    };
    let result = (|| -> AppResult<agent_tools::BridgeOutcome> {
        let raw = value
            .get("placeholder")
            .and_then(Value::as_str)
            .ok_or_else(|| AppError::InvalidInput("missing agent tool request".into()))?;
        let request: BridgeRequest = serde_json::from_str(raw)?;
        let vault = app.state::<AppState>();
        let state = app.state::<AgentState>();
        agent_tools::execute(&vault.root()?, current_permission(&state)?, request)
    })();

    let (payload, mutation) = match result {
        Ok(outcome) => (
            json!({ "ok": true, "value": outcome.value }),
            outcome.mutation,
        ),
        Err(error) => (json!({ "ok": false, "error": error }), None),
    };
    let response = json!({
        "type": "extension_ui_response",
        "id": id,
        "value": payload.to_string(),
    });
    let state = app.state::<AgentState>();
    if let Err(error) = send_rpc(&state, &response) {
        let _ = app.emit("pi-agent-stderr", error.to_string());
    } else if let Some(kind) = mutation {
        let _ = app.emit("ornata-agent-mutated", kind);
    }
    true
}
