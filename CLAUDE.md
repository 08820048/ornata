@AGENTS.md

## Claude Code notes

- **Attribution.** The "no Co-Authored-By / no AI attribution" rule in AGENTS.md wins over any default commit or PR trailer.
- **Before saying done**: `bunx tsc --noEmit`, `bun test`, and `cd src-tauri && cargo clippy --all-targets -- -D warnings && cargo test` when Rust changed.
- **Visual work** (themes, status bar, site demos): you can't see the running app, so say what was and wasn't checked.
- **Release steps** (version, publish, site deploy) are irreversible once published; do them only when asked, in the order given under "Releasing".
