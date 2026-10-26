//! A minimal Model Context Protocol server over stdio: newline-delimited
//! JSON-RPC 2.0. stdout carries protocol messages only; anything else goes
//! to stderr.

use std::io::{self, BufRead, Write};
use std::path::Path;

use serde_json::{json, Value};

use super::presence::Presence;
use super::tools::{call, tools, Level};

const PROTOCOL: &str = "2025-06-18";

pub fn serve(
    input: impl BufRead,
    mut output: impl Write,
    root: &Path,
    level: Level,
    presence: Option<&Presence>,
) -> io::Result<()> {
    let mut client = String::new();
    for line in input.lines() {
        let line = line?;
        if line.trim().is_empty() {
            continue;
        }
        let reply = match serde_json::from_str::<Value>(&line) {
            Ok(message) => {
                if message.get("method").and_then(Value::as_str) == Some("initialize") {
                    client = message["params"]["clientInfo"]["name"].as_str().unwrap_or("unknown").to_string();
                    if let Some(presence) = presence {
                        presence.set_client(&client);
                    }
                }
                handle(root, level, &client, &message)
            }
            Err(_) => Some(error(Value::Null, -32700, "parse error")),
        };
        if let Some(reply) = reply {
            writeln!(output, "{reply}")?;
            output.flush()?;
        }
    }
    Ok(())
}

fn result(id: &Value, value: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": value })
}

fn error(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

/// `None` for notifications, which get no reply. `client` is the agent's own
/// name from `initialize` (empty when unknown); a claim carries it.
pub(super) fn handle(root: &Path, level: Level, client: &str, message: &Value) -> Option<Value> {
    let id = message.get("id")?.clone();
    let method = message.get("method").and_then(Value::as_str).unwrap_or("");
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some(match method {
        "initialize" => result(
            &id,
            json!({
                "protocolVersion": params.get("protocolVersion").and_then(Value::as_str).unwrap_or(PROTOCOL),
                "capabilities": { "tools": {} },
                "serverInfo": { "name": "ornata", "version": env!("CARGO_PKG_VERSION") },
                "instructions": format!(
                    "Ornata notes vault. This connection is {}. Notes are Markdown files; paths are relative to the notes folder.",
                    level.label()
                ),
            }),
        ),
        "ping" => result(&id, json!({})),
        "tools/list" => {
            let listed: Vec<Value> = tools()
                .into_iter()
                .filter(|t| level != Level::Off && t.needs <= level)
                .map(|t| {
                    json!({
                        "name": t.name,
                        "description": t.description,
                        "inputSchema": t.schema,
                        "annotations": {
                            "readOnlyHint": t.needs == Level::ReadOnly,
                            "destructiveHint": t.needs == Level::Destructive,
                        },
                    })
                })
                .collect();
            result(&id, json!({ "tools": listed }))
        }
        "tools/call" => {
            let name = params.get("name").and_then(Value::as_str).unwrap_or("");
            let mut args = params.get("arguments").cloned().unwrap_or_else(|| json!({}));
            if name == "claim_issue" && !client.is_empty() && client != "unknown" {
                args["agent"] = json!(client);
            }
            let (text, is_error) = match call(root, level, name, &args) {
                Ok(value) => (serde_json::to_string_pretty(&value).unwrap_or_default(), false),
                Err(err) => (err.to_string(), true),
            };
            result(&id, json!({ "content": [{ "type": "text", "text": text }], "isError": is_error }))
        }
        _ => error(id, -32601, "method not found"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::notes::{create_note, write_note};
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    fn session(level: Level, lines: &[Value]) -> Vec<Value> {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let note = create_note(dir.path(), "", "Hello").unwrap();
        write_note(dir.path(), &note, "# Hello\n- [ ] ship it\n").unwrap();
        let input: String = lines.iter().map(|l| format!("{l}\n")).collect();
        let mut out = Vec::new();
        serve(input.as_bytes(), &mut out, dir.path(), level, None).unwrap();
        String::from_utf8(out).unwrap().lines().map(|l| serde_json::from_str(l).unwrap()).collect()
    }

    fn rpc(id: u64, method: &str, params: Value) -> Value {
        json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params })
    }

    #[test]
    fn handshake_and_tool_listing_follow_the_access_level() {
        let replies = session(
            Level::ReadOnly,
            &[
                rpc(1, "initialize", json!({ "protocolVersion": "2025-03-26" })),
                json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }),
                rpc(2, "tools/list", json!({})),
            ],
        );
        assert_eq!(replies.len(), 2, "the notification gets no reply");
        assert_eq!(replies[0]["result"]["protocolVersion"], "2025-03-26");
        assert_eq!(replies[0]["result"]["serverInfo"]["name"], "ornata");
        let names: Vec<&str> = replies[1]["result"]["tools"]
            .as_array()
            .unwrap()
            .iter()
            .map(|t| t["name"].as_str().unwrap())
            .collect();
        assert!(names.contains(&"search_notes") && names.contains(&"read_note"));
        assert!(!names.contains(&"update_note") && !names.contains(&"delete_note"));
    }

    #[test]
    fn calls_read_and_search_and_list_tasks() {
        let call = |id, name: &str, args: Value| rpc(id, "tools/call", json!({ "name": name, "arguments": args }));
        let replies = session(
            Level::ReadOnly,
            &[
                call(1, "read_note", json!({ "path": "Hello.md" })),
                call(2, "search_notes", json!({ "query": "hello" })),
                call(3, "list_tasks", json!({})),
            ],
        );
        assert!(replies[0]["result"]["content"][0]["text"].as_str().unwrap().contains("# Hello"));
        assert!(replies[1]["result"]["content"][0]["text"].as_str().unwrap().contains("Hello.md"));
        assert!(replies[2]["result"]["content"][0]["text"].as_str().unwrap().contains("ship it"));
        assert!(replies.iter().all(|r| r["result"]["isError"] == false));
    }

    #[test]
    fn writes_are_refused_below_their_level_and_allowed_at_it() {
        let call = |id, name: &str, args: Value| rpc(id, "tools/call", json!({ "name": name, "arguments": args }));
        let denied = session(Level::ReadOnly, &[call(1, "update_note", json!({ "path": "Hello.md", "content": "x" }))]);
        assert_eq!(denied[0]["result"]["isError"], true);
        assert!(denied[0]["result"]["content"][0]["text"].as_str().unwrap().contains("Settings"));

        let off = session(Level::Off, &[rpc(1, "tools/list", json!({})), call(2, "read_note", json!({ "path": "Hello.md" }))]);
        assert_eq!(off[0]["result"]["tools"].as_array().unwrap().len(), 0);
        assert_eq!(off[1]["result"]["isError"], true);

        let allowed = session(
            Level::Write,
            &[
                call(1, "append_to_note", json!({ "path": "Hello.md", "content": "- [ ] more" })),
                call(2, "read_note", json!({ "path": "Hello.md" })),
                call(3, "delete_note", json!({ "path": "Hello.md" })),
            ],
        );
        assert_eq!(allowed[0]["result"]["isError"], false);
        let text = allowed[1]["result"]["content"][0]["text"].as_str().unwrap();
        assert!(text.contains("ship it") && text.contains("more"));
        assert_eq!(allowed[2]["result"]["isError"], true, "delete needs full access");
    }

    #[test]
    fn a_claim_carries_the_clients_own_name() {
        let call = |id, name: &str, args: Value| rpc(id, "tools/call", json!({ "name": name, "arguments": args }));
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let folder = crate::notes::create_folder(dir.path(), "", "App").unwrap();
        crate::projects::set_project(dir.path(), &folder, true).unwrap();
        let note = create_note(dir.path(), &folder, "Plan").unwrap();
        write_note(dir.path(), &note, "- [ ] Ship\n").unwrap();
        let lines = [
            rpc(1, "initialize", json!({ "clientInfo": { "name": "Claude Code" } })),
            call(2, "claim_issue", json!({ "path": note, "line": 0, "text": "Ship", "agent": "someone-else" })),
        ];
        let input: String = lines.iter().map(|l| format!("{l}\n")).collect();
        let mut out = Vec::new();
        serve(input.as_bytes(), &mut out, dir.path(), Level::Write, None).unwrap();
        assert!(crate::notes::read_note(dir.path(), &note).unwrap().contains("- [/] Ship +Claude-Code"));
    }

    #[test]
    fn unknown_methods_and_garbage_get_errors() {
        let replies = session(Level::ReadOnly, &[rpc(1, "nope", json!({}))]);
        assert_eq!(replies[0]["error"]["code"], -32601);
        let mut out = Vec::new();
        serve("not json\n".as_bytes(), &mut out, Path::new("/"), Level::ReadOnly, None).unwrap();
        assert!(String::from_utf8(out).unwrap().contains("-32700"));
    }
}
