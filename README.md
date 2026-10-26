# Ornata

**Local-first notes for people who write.**

Ornata is a macOS-first notes app built for developers and content creators who care about speed, privacy, and ownership.

No accounts.
No cloud.
No sync (for now).

Your notes live on your Mac as plain `.md` files. Ornata simply makes writing and finding them fast.

---

## Installing on macOS

Download the latest `.dmg` from [ornata.app](https://ornata.app) and drag Ornata to Applications.

Production downloads are signed with an Apple Developer ID certificate and notarized by Apple before distribution.

---

## Features

- **WYSIWYG markdown editor** — write in a rich editor, saved as clean markdown on disk
- **Folders & subfolders** — organize notes in real, Finder-visible folders
- **⌘K command palette** — jump to any note or folder instantly
- **Instant search** — title + content, ranked, in milliseconds
- **Quiet UI, your theme** — light, dark, or follow the system, with a colour scheme for each (Default, Paper, Paper Textured; Default, Basalt Bedrock, Tokyo Techno, Early Ember, Neon Noir), switchable from the status bar; one accent per theme for links, checked tasks, and the caret
- **Portable vault** — plain files, no IDs, no frontmatter, no lock-in
- **Split view** — up to four notes side by side, each with its own header; drag the dividers to resize
- **Projects and a board** — mark a folder as a project and the tasks in its notes become issues, on a list or a board; statuses, priority and dates live on the task line, and agents can claim and finish issues
- **Works with any AI agent** — an MCP server and a command line, with access you set per vault (see below)

---

## Vault model

Pick any folder on disk as your vault:

```
<vault>/
├── notes/          plain .md files — filename is the title, folders are real folders
└── .ornata/         app data: pasted images
```

Notes are addressed by path, never by ID. Deletes go to the OS trash. Edit notes externally (vim, VS Code, whatever) — Ornata picks up changes on window focus.

---

## Command line & MCP

Ornata can be driven by any AI agent that speaks [MCP](https://modelcontextprotocol.io) (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Claude Desktop, …) and from a terminal. The tools are the same either way: list, read, and search notes, backlinks, open tasks, daily notes; and, if you allow it, create, update, append, tick tasks, rename, move, and delete.

**Connect an agent.** Click the plug in the status bar (or ⌘K → "MCP settings"), press **Connect**, and copy the line for your agent. It carries the access token the server requires, for example:

```bash
claude mcp add ornata --transport http http://127.0.0.1:13200/mcp --header "Authorization: Bearer <token>"
```

The server runs inside the app on `127.0.0.1` only, so Ornata has to be open. To work with Ornata closed, let the agent start it over stdio instead — the executable is the app itself:

```bash
claude mcp add ornata -- "/Applications/Ornata.app/Contents/MacOS/Ornata" mcp
```

**What an agent may do** is set per vault in Settings → Agents (or the MCP panel): *off*, *read only* (the default), *read & write*, or *full access* (adds rename, move, delete). It is set only in Ornata — an agent's launch options can only lower it. (An agent that can run shell commands can edit any of your files, Ornata's settings included; the level is a boundary for agents that work only through these tools.) Edits keep the previous version in the note's history; deletes go to the OS trash. Every request must carry the token (regenerate it from the panel if it leaks), and its `Host` and `Origin` are checked so web pages can't reach the server. Agents only ever see notes that really live in the vault: a symlink in `notes/` that points elsewhere is refused.

**From a terminal**, install the `ornata` command from the MCP panel (it links to `~/.local/bin`), then:

```bash
ornata search "roadmap"
ornata tasks
echo "ship it" | ornata journal add     # append to today's note
ornata help
```

Code lives in `src-tauri/src/cli/`: `tools.rs` is the shared tool set, `mcp.rs` the protocol, `http.rs` the local server, `commands.rs` the CLI.

---

## Getting started

Requirements: [Bun](https://bun.sh), [Rust](https://rustup.rs), and Xcode Command Line Tools.

```bash
bun install
bun tauri dev      # run the app
```

Build a local development bundle:

```bash
bun tauri build    # produces a .app and .dmg under src-tauri/target/release/bundle
```

### Signed releases

Releases use two independent signatures: Apple Developer ID signing and notarization for macOS trust, plus the Tauri updater signature for update integrity. Configure these environment variables outside the repository:

```bash
export APPLE_SIGNING_IDENTITY="Developer ID Application: ..."
export TAURI_SIGNING_PRIVATE_KEY="/secure/path/to/ornata.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="..." # when applicable
```

For notarization, provide either App Store Connect API credentials:

```bash
export APPLE_API_ISSUER="..."
export APPLE_API_KEY="..."
export APPLE_API_KEY_PATH="/secure/path/to/AuthKey_....p8"
```

Or Apple ID credentials:

```bash
export APPLE_ID="..."
export APPLE_PASSWORD="..."
export APPLE_TEAM_ID="..."
```

Then stage and publish a release:

```bash
bun run release:preflight
bun run release -- 0.1.5 "Release notes"
bun run release:publish -- 0.1.5            # dry run
bun run release:publish -- 0.1.5 --confirm  # upload to R2
```

The release script refuses ad-hoc signing, verifies the Apple signature and stapled notarization ticket, verifies the archived updater app, and stages artifacts under `release/<version>/`. Publishing uploads immutable artifacts to the existing `ornata` R2 bucket and writes the stable `latest.json` pointer last.

See [AGENTS.md](./AGENTS.md) for architecture details, or [CONTRIBUTING.md](./CONTRIBUTING.md) to send a PR.

---

## Data & Privacy

- Notes are stored locally as user-owned files
- No analytics, tracking, accounts, or note-content uploads
- Automatic updates use the signed release feed at
  `download.ornata.app/products/ornata-markd/channels/stable/latest.json`
- Export your notes anytime — they're already just files

---

## Status

Ornata is under active development.
Sync, encryption, and publishing may be added later — without compromising local-first performance.

## License

[MIT](./LICENSE)

Ornata is based on [Markd](https://github.com/starc007/markd). The original
copyright notice and MIT license are preserved in [LICENSE](./LICENSE).

---

**Ornata**
_Write at the speed of thought._
