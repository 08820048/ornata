//! `ornata` on the command line: the same executable as the app, run with a
//! subcommand. It gives any external agent (over MCP) or script the vault
//! without the UI — search, read, tasks, daily notes, and, when Settings
//! allows it, writes. See `tools` for the shared tool set.

mod commands;
pub(crate) mod app_api;
mod mcp;
pub(crate) mod presence;
mod tools;
mod vault_path;



/// Runs a CLI subcommand if the process was started with one. Returns the
/// exit code, or `None` to start the app normally.
pub fn try_run() -> Option<i32> {
    let args: Vec<String> = std::env::args().skip(1).collect();
    commands::dispatch(&args)
}
