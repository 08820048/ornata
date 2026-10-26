//! MCP over HTTP, served from inside the app on 127.0.0.1 (the "Streamable
//! HTTP" transport, minus server-sent events: every request gets one JSON
//! reply). Same tools and permissions as `ornata mcp`; the app starts and
//! stops it from the MCP panel.
//!
//! A local port can be reached by web pages, other programs, and other user
//! accounts on the Mac, so every request is checked: `Host` must name this
//! server (DNS rebinding), any `Origin` must be a localhost one (cross-site
//! requests), and it must carry the bearer token from the app's settings.
//! The token and the access level are read per request, so changes in the
//! panel apply at once.

use std::collections::{HashMap, VecDeque};
use std::io::Read;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Serialize;
use serde_json::{json, Value};
use tiny_http::{Header, Method, Request, Response, Server};

use crate::error::{AppError, AppResult};

use super::mcp;
use super::vault_path::Target;

const ENDPOINT: &str = "/mcp";
const MAX_BODY: u64 = 2 * 1024 * 1024;
const SESSION_HEADER: &str = "Mcp-Session-Id";
/// How many ports above the preferred one to try when it is taken.
const PORT_TRIES: u16 = 10;
/// Sessions kept; past this the oldest is forgotten (it can initialize again).
const MAX_SESSIONS: usize = 64;

/// Where the served vault and its access level come from, asked per request.
pub type Provider = Arc<dyn Fn() -> Option<Target> + Send + Sync>;
/// The bearer token requests must carry, asked per request.
pub type TokenSource = Arc<dyn Fn() -> String + Send + Sync>;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Activity {
    /// The agent that most recently initialized a session, e.g. "claude-code".
    pub last_client: String,
    pub last_seen_ms: u64,
    pub sessions: usize,
}

#[derive(Default)]
struct Sessions {
    clients: HashMap<String, String>,
    order: VecDeque<String>,
    activity: Activity,
}

impl Sessions {
    fn add(&mut self, id: String, client: String) {
        while self.order.len() >= MAX_SESSIONS {
            if let Some(old) = self.order.pop_front() {
                self.clients.remove(&old);
            }
        }
        self.order.push_back(id.clone());
        self.clients.insert(id, client);
    }

    fn remove(&mut self, id: &str) {
        self.clients.remove(id);
        self.order.retain(|known| known != id);
    }
}

pub struct ServerHandle {
    port: u16,
    stop: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
    state: Arc<Mutex<Sessions>>,
}

impl ServerHandle {
    pub fn port(&self) -> u16 {
        self.port
    }

    pub fn activity(&self) -> Activity {
        self.state.lock().map(|s| s.activity.clone()).unwrap_or_default()
    }

    /// Stop listening; returns once the port is released.
    pub fn stop(mut self) {
        self.stop.store(true, Ordering::SeqCst);
        if let Some(thread) = self.thread.take() {
            let _ = thread.join();
        }
    }
}

impl Drop for ServerHandle {
    fn drop(&mut self) {
        self.stop.store(true, Ordering::SeqCst);
    }
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

/// Listen on `preferred` (or the next free port). Port 0 picks any free one.
pub fn start(preferred: u16, token: TokenSource, provider: Provider) -> AppResult<ServerHandle> {
    let (server, port) = bind(preferred)?;
    let stop = Arc::new(AtomicBool::new(false));
    let state = Arc::new(Mutex::new(Sessions::default()));
    let thread = {
        let (stop, state) = (stop.clone(), state.clone());
        std::thread::spawn(move || {
            while !stop.load(Ordering::SeqCst) {
                match server.recv_timeout(Duration::from_millis(200)) {
                    Ok(Some(request)) => handle(request, port, &token, &provider, &state),
                    Ok(None) => {}
                    Err(_) => break,
                }
            }
        })
    };
    Ok(ServerHandle { port, stop, thread: Some(thread), state })
}

fn bind(preferred: u16) -> AppResult<(Server, u16)> {
    let mut last = String::new();
    for offset in 0..=PORT_TRIES {
        let port = if preferred == 0 { 0 } else { preferred.saturating_add(offset) };
        match Server::http(("127.0.0.1", port)) {
            Ok(server) => {
                let actual = server.server_addr().to_ip().map(|a| a.port()).unwrap_or(port);
                return Ok((server, actual));
            }
            Err(error) => last = error.to_string(),
        }
        if preferred == 0 {
            break;
        }
    }
    Err(AppError::Other(format!("could not start the MCP server: {last}")))
}

fn header(name: &'static str, value: &str) -> Header {
    Header::from_bytes(name.as_bytes(), value.as_bytes()).expect("static header names are valid")
}

fn field(request: &Request, name: &str) -> Option<String> {
    request
        .headers()
        .iter()
        .find(|h| h.field.as_str().as_str().eq_ignore_ascii_case(name))
        .map(|h| h.value.as_str().to_string())
}

fn reply(request: Request, status: u16, body: Option<String>, session: Option<&str>) {
    let mut response = match body {
        Some(body) => Response::from_string(body).with_header(header("Content-Type", "application/json")),
        None => Response::from_string(String::new()),
    }
    .with_status_code(status);
    if let Some(id) = session {
        response = response.with_header(header(SESSION_HEADER, id));
    }
    let _ = request.respond(response);
}

fn error_body(code: i64, message: &str) -> String {
    json!({ "jsonrpc": "2.0", "id": null, "error": { "code": code, "message": message } }).to_string()
}

/// `host` must be this server; an `Origin` (browsers always send one on
/// cross-site requests, MCP clients don't) must be localhost.
fn allowed(host: Option<&str>, origin: Option<&str>, port: u16) -> bool {
    let hosts = [format!("127.0.0.1:{port}"), format!("localhost:{port}"), format!("[::1]:{port}")];
    if !host.is_some_and(|h| hosts.iter().any(|ok| ok.eq_ignore_ascii_case(h))) {
        return false;
    }
    match origin {
        None => true,
        Some(origin) => {
            let rest = origin.strip_prefix("http://").unwrap_or("");
            let name = rest.split([':', '/']).next().unwrap_or("");
            matches!(name, "localhost" | "127.0.0.1" | "[::1]")
        }
    }
}

/// Compare without an early exit, so timing doesn't reveal how much matched.
fn same_secret(given: &str, expected: &str) -> bool {
    let (a, b) = (given.as_bytes(), expected.as_bytes());
    let mut diff = a.len() ^ b.len();
    for i in 0..a.len().max(b.len()) {
        diff |= (a.get(i).copied().unwrap_or(0) ^ b.get(i).copied().unwrap_or(0)) as usize;
    }
    diff == 0
}

fn authorized(header: Option<&str>, token: &str) -> bool {
    !token.is_empty() && header.and_then(|h| h.strip_prefix("Bearer ")).is_some_and(|given| same_secret(given.trim(), token))
}

fn handle(mut request: Request, port: u16, token: &TokenSource, provider: &Provider, state: &Arc<Mutex<Sessions>>) {
    if !allowed(field(&request, "host").as_deref(), field(&request, "origin").as_deref(), port) {
        return reply(request, 403, Some(error_body(-32000, "forbidden")), None);
    }
    if !authorized(field(&request, "authorization").as_deref(), &token()) {
        let _ = request.respond(
            Response::from_string(error_body(-32001, "missing or wrong token — copy the setup command from Ornata's MCP settings"))
                .with_status_code(401)
                .with_header(header("Content-Type", "application/json"))
                .with_header(header("WWW-Authenticate", "Bearer")),
        );
        return;
    }
    if request.url().split('?').next() != Some(ENDPOINT) {
        return reply(request, 404, Some(error_body(-32000, "not found")), None);
    }
    let session = field(&request, SESSION_HEADER);
    match request.method() {
        Method::Delete => {
            if let (Some(id), Ok(mut state)) = (&session, state.lock()) {
                state.remove(id);
                state.activity.sessions = state.clients.len();
            }
            return reply(request, 204, None, None);
        }
        Method::Post => {}
        _ => {
            let _ = request.respond(
                Response::from_string(error_body(-32000, "use POST"))
                    .with_status_code(405)
                    .with_header(header("Allow", "POST, DELETE")),
            );
            return;
        }
    }

    let mut body = String::new();
    if request.as_reader().take(MAX_BODY).read_to_string(&mut body).is_err() {
        return reply(request, 400, Some(error_body(-32700, "unreadable body")), None);
    }
    let Ok(message) = serde_json::from_str::<Value>(&body) else {
        return reply(request, 400, Some(error_body(-32700, "parse error")), None);
    };
    let messages: Vec<&Value> = match &message {
        Value::Array(items) => items.iter().collect(),
        other => vec![other],
    };

    // A session id is handed out at `initialize`; later requests must carry it.
    let is_initialize = messages.iter().any(|m| m.get("method").and_then(Value::as_str) == Some("initialize"));
    let mut issued = None;
    let mut client = String::new();
    if let Ok(mut state) = state.lock() {
        if is_initialize {
            let id = uuid::Uuid::new_v4().to_string();
            client = messages
                .iter()
                .find_map(|m| m["params"]["clientInfo"]["name"].as_str())
                .unwrap_or("unknown")
                .to_string();
            state.activity.last_client = client.clone();
            state.add(id.clone(), client.clone());
            issued = Some(id);
        } else if session.as_ref().is_some_and(|id| !state.clients.contains_key(id)) {
            drop(state);
            return reply(request, 404, Some(error_body(-32000, "unknown session; initialize again")), None);
        } else if let Some(known) = session.as_ref().and_then(|id| state.clients.get(id)) {
            client = known.clone();
        }
        state.activity.last_seen_ms = now_ms();
        state.activity.sessions = state.clients.len();
    }

    let Some(target) = provider() else {
        return reply(request, 200, Some(error_body(-32000, "open a vault in Ornata first")), issued.as_deref());
    };
    let replies: Vec<Value> = messages
        .into_iter()
        .filter_map(|m| mcp::handle(&target.root, target.level, &client, m))
        .collect();
    match (&message, replies.len()) {
        (_, 0) => reply(request, 202, None, issued.as_deref()),
        (Value::Array(_), _) => reply(request, 200, Some(Value::Array(replies).to_string()), issued.as_deref()),
        _ => reply(request, 200, Some(replies[0].to_string()), issued.as_deref()),
    }
}

#[cfg(test)]
mod tests;
