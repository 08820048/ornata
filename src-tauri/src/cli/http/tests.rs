use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicU8, Ordering};

use serde_json::{json, Value};
use tempfile::tempdir;

use super::*;
use crate::cli::tools::Level;
use crate::notes::{create_note, write_note};
use crate::vault::ensure_layout;

struct Reply {
    status: u16,
    session: Option<String>,
    body: String,
}

/// One raw HTTP/1.1 request; `headers` replaces the defaults it names.
fn send(port: u16, method: &str, path: &str, extra: &[(&str, &str)], body: &str) -> Reply {
    let mut stream = TcpStream::connect(("127.0.0.1", port)).unwrap();
    let mut headers = vec![
        ("Host".to_string(), format!("127.0.0.1:{port}")),
        ("Content-Type".to_string(), "application/json".to_string()),
        ("Content-Length".to_string(), body.len().to_string()),
        ("Connection".to_string(), "close".to_string()),
    ];
    for (name, value) in extra {
        headers.retain(|(n, _)| !n.eq_ignore_ascii_case(name));
        headers.push((name.to_string(), value.to_string()));
    }
    let head: String = headers.iter().map(|(n, v)| format!("{n}: {v}\r\n")).collect();
    write!(stream, "{method} {path} HTTP/1.1\r\n{head}\r\n{body}").unwrap();
    let mut raw = String::new();
    stream.read_to_string(&mut raw).unwrap();
    let (head, body) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
    let status = head.split_whitespace().nth(1).unwrap().parse().unwrap();
    let session = head
        .lines()
        .find_map(|l| l.to_ascii_lowercase().strip_prefix("mcp-session-id: ").map(|_| l.split_once(": ").unwrap().1.to_string()));
    Reply { status, session, body: body.to_string() }
}

fn rpc(id: u64, method: &str, params: Value) -> String {
    json!({ "jsonrpc": "2.0", "id": id, "method": method, "params": params }).to_string()
}

fn serve(level: Level) -> (ServerHandle, tempfile::TempDir) {
    let dir = tempdir().unwrap();
    ensure_layout(dir.path()).unwrap();
    let note = create_note(dir.path(), "", "Hello").unwrap();
    write_note(dir.path(), &note, "# Hello\n- [ ] ship it\n").unwrap();
    let root = dir.path().to_path_buf();
    let provider: Provider = Arc::new(move || Some(Target { root: root.clone(), level }));
    (start(0, provider).unwrap(), dir)
}

fn initialize(port: u16) -> String {
    let reply = send(port, "POST", "/mcp", &[], &rpc(1, "initialize", json!({ "protocolVersion": "2025-06-18", "clientInfo": { "name": "claude-code" } })));
    assert_eq!(reply.status, 200);
    reply.session.expect("initialize hands out a session id")
}

#[test]
fn handshake_then_tools_work_over_http() {
    let (server, _dir) = serve(Level::ReadOnly);
    let port = server.port();
    let session = initialize(port);
    let auth = [("Mcp-Session-Id", session.as_str())];

    let listed = send(port, "POST", "/mcp", &auth, &rpc(2, "tools/list", json!({})));
    assert_eq!(listed.status, 200);
    assert!(listed.body.contains("search_notes") && !listed.body.contains("update_note"));

    let call = rpc(3, "tools/call", json!({ "name": "read_note", "arguments": { "path": "Hello.md" } }));
    assert!(send(port, "POST", "/mcp", &auth, &call).body.contains("ship it"));

    let note = json!({ "jsonrpc": "2.0", "method": "notifications/initialized" }).to_string();
    assert_eq!(send(port, "POST", "/mcp", &auth, &note).status, 202, "notifications get no body");

    let activity = server.activity();
    assert_eq!(activity.last_client, "claude-code");
    assert_eq!(activity.sessions, 1);
    assert!(activity.last_seen_ms > 0);
    server.stop();
}

#[test]
fn unknown_sessions_and_wrong_methods_are_refused() {
    let (server, _dir) = serve(Level::ReadOnly);
    let port = server.port();
    let stale = [("Mcp-Session-Id", "nope")];
    assert_eq!(send(port, "POST", "/mcp", &stale, &rpc(1, "tools/list", json!({}))).status, 404);
    assert_eq!(send(port, "GET", "/mcp", &[], "").status, 405);
    assert_eq!(send(port, "POST", "/elsewhere", &[], "{}").status, 404);
    assert_eq!(send(port, "POST", "/mcp", &[], "not json").status, 400);

    let session = initialize(port);
    assert_eq!(send(port, "DELETE", "/mcp", &[("Mcp-Session-Id", session.as_str())], "").status, 204);
    assert_eq!(server.activity().sessions, 0);
    server.stop();
}

#[test]
fn web_pages_and_rebinding_hosts_are_refused() {
    let (server, _dir) = serve(Level::Destructive);
    let port = server.port();
    let list = rpc(1, "tools/list", json!({}));
    // a page on another site posting to localhost
    assert_eq!(send(port, "POST", "/mcp", &[("Origin", "https://evil.example")], &list).status, 403);
    // DNS rebinding: the browser still believes the host is the attacker's
    assert_eq!(send(port, "POST", "/mcp", &[("Host", "evil.example")], &list).status, 403);
    assert_eq!(send(port, "POST", "/mcp", &[("Host", &format!("evil.example:{port}"))], &list).status, 403);
    // localhost origins and plain clients are fine
    assert_eq!(send(port, "POST", "/mcp", &[("Origin", "http://localhost:6274")], &list).status, 200);
    assert_eq!(send(port, "POST", "/mcp", &[("Host", &format!("localhost:{port}"))], &list).status, 200);
    server.stop();
}

#[test]
fn access_is_read_per_request_so_settings_apply_at_once() {
    let dir = tempdir().unwrap();
    ensure_layout(dir.path()).unwrap();
    let level = Arc::new(AtomicU8::new(1));
    let provider: Provider = {
        let (root, level) = (dir.path().to_path_buf(), level.clone());
        Arc::new(move || {
            let level = match level.load(Ordering::SeqCst) {
                0 => Level::Off,
                1 => Level::ReadOnly,
                _ => Level::Write,
            };
            Some(Target { root: root.clone(), level })
        })
    };
    let server = start(0, provider).unwrap();
    let port = server.port();
    let capture = rpc(2, "tools/call", json!({ "name": "capture", "arguments": { "text": "x" } }));
    assert!(send(port, "POST", "/mcp", &[], &capture).body.contains("\"isError\":true"));
    level.store(2, Ordering::SeqCst);
    assert!(send(port, "POST", "/mcp", &[], &capture).body.contains("\"isError\":false"));
    level.store(0, Ordering::SeqCst);
    let listed = send(port, "POST", "/mcp", &[], &rpc(3, "tools/list", json!({})));
    assert!(listed.body.contains("\"tools\":[]"));
    server.stop();
}

#[test]
fn stopping_releases_the_port_and_busy_ports_fall_through() {
    let (first, _dir) = serve(Level::ReadOnly);
    let port = first.port();
    // the preferred port is taken, so the next one is used
    let provider: Provider = Arc::new(|| None);
    let second = start(port, provider.clone()).unwrap();
    assert_ne!(second.port(), port);
    let bare = send(second.port(), "POST", "/mcp", &[], &rpc(1, "tools/list", json!({})));
    assert!(bare.body.contains("open a vault"), "no vault open: a clear error, not a crash");
    second.stop();
    first.stop();
    assert!(TcpStream::connect(("127.0.0.1", port)).is_err());
}
