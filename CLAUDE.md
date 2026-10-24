@AGENTS.md

## Claude Code notes

- **Planning source.** Anything about "the plan", "what's next", or "the to-do list" means the Ornata note `10-项目/产品/Ornata/Ornata 开发规划.md` — see "Planning — read this first" in AGENTS.md. Read it with the Ornata MCP (`read_note`) if that server is connected in this session, otherwise open `~/Documents/notes/10-项目/产品/Ornata/Ornata 开发规划.md` directly. Re-read it each time; the user edits it between sessions. Tick items off in that note when they ship.
- **Attribution.** The "no Co-Authored-By / no AI attribution" rule in AGENTS.md wins over any default commit or PR trailer.
- **Before saying done**: `bunx tsc --noEmit`, `bun test`, and `cd src-tauri && cargo test` when Rust changed; then commit and push (conventional message).
- **Visual work** (themes, status bar, site demos): you can't see the running app, so say what was and wasn't checked and leave the commit for the user's go-ahead.
- **Not ours.** Leave the untracked `.commandcode/` folder alone.
- **After each release**, write the X post described in AGENTS.md ("X运营") into the vault note `10-项目/产品/Ornata/X推文.md`, with a screenshot, newest version first.
- **Release steps** (version, publish, site deploy) are irreversible once published; do them only when asked, in the order given under "Releasing".
