use std::io::{IsTerminal, Read};

use serde_json::{json, Value};

use super::tools::{call, Level};
use super::{mcp, vault_path};

const COMMANDS: &[&str] = &[
    "mcp", "vault", "list", "read", "search", "backlinks", "tasks", "daily", "journal", "create",
    "append", "done",
];

const HELP: &str = "\
ornata — your notes vault from the command line

USAGE
  ornata <command> [options]

COMMANDS
  mcp                         Serve the vault to an AI agent over MCP (stdio)
  vault                       Show the vault and what this connection may do
  list [--folder DIR]         List notes
  read <path>                 Print a note's Markdown
  search <query…> [--limit N] Search titles and content
  backlinks <path>            Notes that link to a note
  tasks                       Every open task in the vault
  daily [--date YYYY-MM-DD]   Print a day's note
  journal add [text…]         Append to today's note (--date for another day)
  create <title> [--dir DIR] [text…]   Create a note
  append <path> [text…]       Append to a note
  done <path> <line> <text…>  Tick an open task (values from `tasks`)

Text can also be piped:  echo \"shipped\" | ornata journal add

OPTIONS
  --vault <folder>   Vault to use (default: ORNATA_VAULT, else the one Ornata last opened)
  --access <level>   Lower what this run may do: read | write | full

What a vault allows (off, read-only, read & write, full) is set in Ornata's
Settings, and options can only lower it.

AI agents:  claude mcp add ornata -- ornata mcp";

/// Flags and positional words of one invocation.
#[derive(Debug, Default, PartialEq)]
pub struct Parsed {
    pub words: Vec<String>,
    pub flags: Vec<(String, String)>,
}

impl Parsed {
    pub fn flag(&self, name: &str) -> Option<&str> {
        self.flags.iter().find(|(k, _)| k == name).map(|(_, v)| v.as_str())
    }
}

pub fn parse(args: &[String]) -> Result<Parsed, String> {
    let mut parsed = Parsed::default();
    let mut iter = args.iter();
    while let Some(arg) = iter.next() {
        match arg.strip_prefix("--") {
            Some(name) if !name.is_empty() => {
                let value = iter.next().ok_or_else(|| format!("--{name} needs a value"))?;
                parsed.flags.push((name.to_string(), value.clone()));
            }
            _ => parsed.words.push(arg.clone()),
        }
    }
    Ok(parsed)
}

pub fn dispatch(args: &[String]) -> Option<i32> {
    let first = args.first()?.as_str();
    if matches!(first, "help" | "--help" | "-h") {
        println!("{HELP}");
        return Some(0);
    }
    if matches!(first, "version" | "--version" | "-V") {
        println!("ornata {}", env!("CARGO_PKG_VERSION"));
        return Some(0);
    }
    if !COMMANDS.contains(&first) {
        return None;
    }
    Some(match run(first, &args[1..]) {
        Ok(()) => 0,
        Err(message) => {
            eprintln!("ornata: {message}");
            1
        }
    })
}

fn run(command: &str, args: &[String]) -> Result<(), String> {
    let parsed = parse(args)?;
    let ceiling = match parsed.flag("access") {
        Some(value) => Some(Level::parse(value).ok_or("--access must be read, write, or full")?),
        None => None,
    };
    let target = vault_path::resolve(parsed.flag("vault"), ceiling).map_err(|e| e.to_string())?;
    if command == "mcp" {
        eprintln!("ornata mcp: {} ({})", target.root.display(), target.level.label());
        let stdin = std::io::stdin();
        let presence = vault_path::config_dir()
            .and_then(|dir| super::presence::Presence::start(&super::presence::sessions_dir(&dir), &target.root));
        return mcp::serve(stdin.lock(), std::io::stdout().lock(), &target.root, target.level, presence.as_ref())
            .map_err(|e| e.to_string());
    }
    let stdin_text = || {
        let mut piped = String::new();
        if !std::io::stdin().is_terminal() {
            let _ = std::io::stdin().read_to_string(&mut piped);
        }
        piped
    };
    println!("{}", execute(command, &parsed, &target.root, target.level, &stdin_text)?);
    Ok(())
}

/// Text from the words after the command, else from piped stdin.
fn text(words: &[String], stdin: &dyn Fn() -> String) -> Result<String, String> {
    let joined = words.join(" ");
    let text = if joined.trim().is_empty() { stdin() } else { joined };
    if text.trim().is_empty() {
        Err("no text given (pass it as arguments or pipe it in)".into())
    } else {
        Ok(text)
    }
}

pub fn execute(
    command: &str,
    parsed: &Parsed,
    root: &std::path::Path,
    level: Level,
    stdin: &dyn Fn() -> String,
) -> Result<String, String> {
    let words = &parsed.words;
    let first = || words.first().cloned().ok_or_else(|| "a path is required".to_string());
    let date = parsed.flag("date");
    let with_date = |mut args: Value| {
        if let Some(date) = date {
            args["date"] = json!(date);
        }
        args
    };
    let (tool, args) = match command {
        "vault" => ("vault_info", json!({})),
        "list" => ("list_notes", json!({ "folder": parsed.flag("folder").unwrap_or("") })),
        "read" => ("read_note", json!({ "path": first()? })),
        "search" => {
            let mut args = json!({ "query": words.join(" ") });
            if let Some(limit) = parsed.flag("limit").and_then(|v| v.parse::<u64>().ok()) {
                args["limit"] = json!(limit);
            }
            ("search_notes", args)
        }
        "backlinks" => ("get_backlinks", json!({ "path": first()? })),
        "tasks" => ("list_tasks", json!({})),
        "daily" => ("get_daily_note", with_date(json!({}))),
        "journal" => {
            if words.first().map(String::as_str) != Some("add") {
                return Err("usage: ornata journal add [text…]".into());
            }
            ("add_to_daily_note", with_date(json!({ "text": text(&words[1..], stdin)? })))
        }
        "create" => {
            let title = first()?;
            let mut args = json!({ "title": title, "directory": parsed.flag("dir").unwrap_or("") });
            if words.len() > 1 || !stdin().trim().is_empty() {
                args["content"] = json!(text(&words[1..], stdin)?);
            }
            ("create_note", args)
        }
        "append" => ("append_to_note", json!({ "path": first()?, "content": text(&words[1..], stdin)? })),
        "done" => {
            let line = words.get(1).and_then(|v| v.parse::<u64>().ok()).ok_or("usage: ornata done <path> <line> <text…>")?;
            ("complete_task", json!({ "path": first()?, "line": line, "text": words[2..].join(" ") }))
        }
        other => return Err(format!("unknown command: {other}")),
    };
    let value = call(root, level, tool, &args).map_err(|e| e.to_string())?;
    // `read` prints the note itself, not a JSON wrapper.
    if command == "read" {
        if let Some(content) = value.get("content").and_then(Value::as_str) {
            return Ok(content.trim_end_matches('\n').to_string());
        }
    }
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vault::ensure_layout;
    use tempfile::tempdir;

    fn strings(args: &[&str]) -> Vec<String> {
        args.iter().map(|s| s.to_string()).collect()
    }

    fn run_cmd(root: &std::path::Path, level: Level, command: &str, args: &[&str], piped: &str) -> Result<String, String> {
        let parsed = parse(&strings(args))?;
        let piped = piped.to_string();
        execute(command, &parsed, root, level, &move || piped.clone())
    }

    #[test]
    fn parses_flags_and_words() {
        let parsed = parse(&strings(&["a", "--vault", "/v", "b", "--limit", "5"])).unwrap();
        assert_eq!(parsed.words, ["a", "b"]);
        assert_eq!(parsed.flag("vault"), Some("/v"));
        assert_eq!(parsed.flag("limit"), Some("5"));
        assert!(parse(&strings(&["--vault"])).is_err());
    }

    #[test]
    fn only_known_subcommands_start_the_cli() {
        assert_eq!(dispatch(&strings(&["/Users/x/note.md"])), None);
        assert_eq!(dispatch(&[]), None);
        assert_eq!(dispatch(&strings(&["--version"])), Some(0));
    }

    #[test]
    fn daily_create_append_roundtrip() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let root = dir.path();
        let w = Level::Write;

        run_cmd(root, w, "journal", &["add", "met", "Ada", "--date", "2026-10-18"], "").unwrap();
        run_cmd(root, w, "journal", &["add", "--date", "2026-10-18"], "- [ ] follow up\n").unwrap();
        let daily = run_cmd(root, w, "daily", &["--date", "2026-10-18"], "").unwrap();
        assert!(daily.contains("met Ada") && daily.contains("follow up"));

        run_cmd(root, w, "create", &["Plan", "--dir", ""], "# Plan\n- [ ] ship\n").unwrap();
        run_cmd(root, w, "append", &["Plan.md", "- [ ] test"], "").unwrap();
        let plan = run_cmd(root, w, "read", &["Plan.md"], "").unwrap();
        assert!(plan.contains("ship") && plan.contains("test"));

        let tasks = run_cmd(root, w, "tasks", &[], "").unwrap();
        assert!(tasks.contains("ship") && tasks.contains("follow up"));
        let found = run_cmd(root, w, "search", &["plan"], "").unwrap();
        assert!(found.contains("Plan.md"));
    }

    #[test]
    fn writes_need_the_level_and_bad_input_is_explained() {
        let dir = tempdir().unwrap();
        ensure_layout(dir.path()).unwrap();
        let err = run_cmd(dir.path(), Level::ReadOnly, "create", &["x"], "").unwrap_err();
        assert!(err.contains("Settings"));
        assert!(run_cmd(dir.path(), Level::Write, "journal", &["add", "x", "--date", "tomorrow"], "").unwrap_err().contains("date"));
        assert!(run_cmd(dir.path(), Level::Write, "read", &["../../etc/passwd"], "").is_err());
    }
}
