//! Which `ornata mcp` processes are running. Each writes a small file while
//! it lives, so the app can show "connected" and name the agent without a
//! port: stdio MCP has no server for the app to look at.

use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub pid: u32,
    pub vault: String,
    /// The MCP client's own name (from `initialize`), e.g. "claude-code".
    pub client: String,
    pub started_ms: u64,
}

/// Folder of session files, next to the app's `config.json`.
pub fn sessions_dir(config_dir: &Path) -> PathBuf {
    config_dir.join("mcp-sessions")
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}

#[cfg(windows)]
pub fn pid_alive(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;
    Command::new("tasklist")
        .args(["/FI", &format!("PID eq {pid}"), "/NH", "/FO", "CSV"])
        .creation_flags(0x0800_0000)
        .stdin(Stdio::null())
        .stderr(Stdio::null())
        .output()
        .map(|o| String::from_utf8_lossy(&o.stdout).contains(&format!("\"{pid}\"")))
        .unwrap_or(false)
}

#[cfg(not(windows))]
pub fn pid_alive(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

/// Held for the life of an `ornata mcp` process; removes its file on drop.
pub struct Presence {
    path: PathBuf,
    session: Mutex<Session>,
}

impl Presence {
    pub fn start(dir: &Path, vault: &Path) -> Option<Self> {
        fs::create_dir_all(dir).ok()?;
        let pid = std::process::id();
        let presence = Self {
            path: dir.join(format!("{pid}.json")),
            session: Mutex::new(Session { pid, vault: vault.to_string_lossy().into(), client: String::new(), started_ms: now_ms() }),
        };
        presence.write();
        Some(presence)
    }

    pub fn set_client(&self, name: &str) {
        if let Ok(mut session) = self.session.lock() {
            session.client = name.to_string();
        }
        self.write();
    }

    fn write(&self) {
        if let Ok(session) = self.session.lock() {
            if let Ok(json) = serde_json::to_string(&*session) {
                let _ = fs::write(&self.path, json);
            }
        }
    }
}

impl Drop for Presence {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.path);
    }
}

/// Live sessions for `vault`; files left by a process that died are removed.
pub fn live_sessions(dir: &Path, vault: &str) -> Vec<Session> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut sessions: Vec<Session> = entries
        .flatten()
        .filter_map(|entry| {
            let session: Session = serde_json::from_str(&fs::read_to_string(entry.path()).ok()?).ok()?;
            if pid_alive(session.pid) {
                Some(session)
            } else {
                let _ = fs::remove_file(entry.path());
                None
            }
        })
        .filter(|session| session.vault == vault)
        .collect();
    sessions.sort_by_key(|s| s.started_ms);
    sessions
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn a_running_session_is_listed_and_removed_on_drop() {
        let dir = tempdir().unwrap();
        let vault = Path::new("/vault");
        let presence = Presence::start(dir.path(), vault).unwrap();
        presence.set_client("claude-code");
        let sessions = live_sessions(dir.path(), "/vault");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].client, "claude-code");
        assert_eq!(sessions[0].pid, std::process::id());
        assert!(live_sessions(dir.path(), "/other").is_empty());
        drop(presence);
        assert!(live_sessions(dir.path(), "/vault").is_empty());
    }

    #[test]
    fn files_from_dead_processes_are_cleaned_up() {
        let dir = tempdir().unwrap();
        // pid 2^22 + a bit is far beyond any live pid on a dev machine
        let stale = Session { pid: 4_194_000, vault: "/vault".into(), client: "x".into(), started_ms: 1 };
        let file = dir.path().join("4194000.json");
        fs::write(&file, serde_json::to_string(&stale).unwrap()).unwrap();
        fs::write(dir.path().join("junk.json"), "not json").unwrap();
        assert!(live_sessions(dir.path(), "/vault").is_empty());
        assert!(!file.exists());
    }
}
