# Changelog

All notable changes to Ornata are documented in this file.

## [Unreleased]

### Added

- Split view: open notes side by side, up to four panes. Each pane has its own header with history arrows, breadcrumb, and actions. Drag the dividers to resize; adding or closing a pane shares the width evenly again.
- Open a note to the side from the command palette (⌘↵), a tab's or file's context menu, or by ⌘-clicking a link. The pane menu can split, swap with the next pane, or jump to a pane; ⌘1–⌘4 and ⌘. move between panes.
- Back and forward through the notes you visited, with ⌘[ and ⌘].
- Focus mode (⌘⇧F) hides the sidebar and fades the tab strip and header until you point at them.
- Fold a heading's section with the arrow beside it.
- Type `@` to insert a link to today's, tomorrow's, or yesterday's daily note. A daily note that doesn't exist yet is created from your daily template when you open the link.
- Search finds titles from shorthand: `prjroad` matches "project roadmap". Exact matches still rank first.
- A shortcut bar along the bottom shows the keys that matter for the current view. Hide or show it from the command palette.
- The sidebar has quick rows for daily notes and tasks.
- Let any AI agent work on your vault without opening Ornata. `ornata mcp` is an MCP server over stdio (Claude Code, Codex, Gemini CLI, Cursor, and others), and the same tools are available as commands: `ornata search`, `read`, `tasks`, `backlinks`, `daily`, `journal add`, `capture`, `create`, `append`, `done`. Text can be piped in.
- Ornata can serve MCP itself on a local port. Connect and Disconnect from MCP Settings, then add it to an agent with one line, e.g. `claude mcp add ornata --transport http http://127.0.0.1:13200/mcp` — no command line tool to install. Requests from web pages are refused, and the port only listens on 127.0.0.1.
- The plug in the status bar turns green while the server is on or an agent is connected over stdio, and opens MCP Settings. Settings has a matching Agents page with setup commands for Claude Code, Codex, Gemini CLI, Cursor, and Claude Desktop, and an optional install of `ornata` into `~/.local/bin`.
- Agent access is set per vault in Settings — off, read only, read & write, or full access — and defaults to read only. An agent can't raise it, and launch options can only lower it. Edits keep the previous version in the note's history; deletes go to the Trash.
- Type `* ` at the start of a line to start a to-do. `- ` and `+ ` still make bullets, and inside a list nothing changes.

### Changed

- Editor text and note titles use Space Grotesk; Chinese falls back to the system font.
- The sidebar toggle is a round arrow on the sidebar's edge instead of a button in the tab strip.
- The note's top-right buttons share one quiet style. Copy path moved into the ··· menu, which also has Focus mode.
- The shortcut list in Settings is complete.

## [0.7.0] - 2026-09-28

### Added

- AssistantPi keeps the conversation for each vault. Start a new chat, or reopen an earlier one.
- One-click undo for notes AssistantPi edited or created. If you changed the note after that, undo refuses and points you at history.
- Type `@` to attach another note. Linked notes can also include the notes this one links to and from, as paths and titles only.
- Summarize, Suggest links, and Extract tasks appear when a note is attached and the composer is empty. Suggest links and Extract tasks only propose changes.

### Fixed

- AssistantPi's read, grep, find, and ls stay inside the vault, including paths that follow a symlink out of it.
- Approval cards show the shell command, a before/after diff for an edit, the body of a new note, and the path for delete, rename, and move.

### Changed

- The editor tab strip uses the same panel tone as the sidebar.

## [0.6.0] - 2026-09-28

### Added

- Relationship graph: open the vault graph in a tab, or the current note's neighborhood at the bottom of the note. Folder colors, drag, search, and link direction.
- Export a note to PDF, HTML, or rich text. PDFs include heading bookmarks, paper size and margin settings, and Show in Finder when the export finishes.
- Per-note history snapshots, with a diff and restore.
- Multi-term vault search, plus find and replace in the open note.
- Tags, daily notes, templates, and pinned notes.
- Heading links (`path.md#heading`) and link rewrites when a note is renamed or moved.
- Global quick capture into Inbox.
- Open tasks: one list of every unchecked `- [ ]` item across your notes, from the sidebar or ⌘K. Tick a task to mark it done in its note, or click it to open the note.
- Linked mentions: the bottom of each note lists the notes that link to it (markdown or `[[wiki]]` links), including unlinked mentions, with the linking line as context.
- Sort the note tree by modified time.
- Cleanup of unreferenced images in the vault.

### Removed

- The standalone Todos and Bookmarks pages, their sidebar previews, ⌘K entries, and AssistantPi tools. Ornata now focuses on notes; use Markdown task lists and links inside notes instead.

### Changed

- On first launch after upgrading, existing `.ornata/todos.json` and `.ornata/bookmarks.json` are converted into `Todos.md` and `Bookmarks.md` notes, and the old files are kept as `*.archived`.

## [0.5.1] - 2026-09-21

### Added

- Mouse-wheel scrolling for the editor tab strip: a vertical wheel pans the open tabs left and right, and the active tab scrolls back into view when you switch.

### Changed

- A new app icon across the app, Dock, and website.

## [0.5.0] - 2026-09-21

### Added

- **Animated cursor**: the caret glides between positions with a damped spring and a subtle four-corner deformation, adapted from Zed. Toggle it in Settings → Editor; honors reduced motion.
- **Standalone settings window**: a resizable, searchable two-pane window (General, Appearance, Editor, Image, Vault, Shortcuts, Updates) that replaces the old modal and stays in sync with the main window.
- **Custom image upload**: run your own uploader (e.g. PicGo) so pasted images are hosted automatically. The image lands locally first, then the hosted URL replaces it in place; failures keep the local copy.
- **Inline image source**: click an image to edit its Markdown `alt`/URL in a bar beneath it, Typora-style.
- A serif reading font for the note body.

### Fixed

- Pasted images now work in the macOS webview by reading `clipboardData.items` (which WKWebView uses instead of `.files`).
- Inserting a pasted image no longer silently drops it when the schema predates the transient upload attribute.

### Changed

- Removed the pointer cursor trail that interfered with text selection.

## [0.4.0] - 2026-08-29

### Added

- Smooth editor cursor trail that follows the pointer with spring physics, honoring reduced-motion settings.
- Text edit trail: short insertions and deletions animate as they land, and the caret gains a tapered line look.

## [0.3.0] - 2026-08-29

### Added

- Migrated fenced code blocks to Shiki with dual light/dark themes and syntax highlighting for 20 programming languages.

### Changed

- Refined code-block and Mermaid surfaces so they blend more naturally with the editor in both color modes.
- Kept Agent status visible above the composer, added compact Thinking Orbs for ready/connecting/working states, and removed decorative gray icon circles.
- Enlarged the settings dialog for more comfortable configuration.

## [0.2.0] - 2026-08-28

### Added

- Added an **Ask AI** action to the text-selection toolbar. It opens an inline prompt and sends the request, selected text, and current note to AssistantPi when submitted.
- **LaTeX math rendering**: inline `$…$` and block `$$…$$` formulas via KaTeX. Click a formula to edit its LaTeX source in place — Enter or clicking away re-renders, Escape cancels.
- **Mermaid diagrams**: fenced code blocks tagged `mermaid` render as flowcharts, sequence diagrams, and more, themed to match light/dark.
- **Agent tools**: AssistantPi now ships read/grep/find/ls over the vault, a host shell (permission-gated: blocked in read-only, approval in ask-to-edit, auto in full access), web search, and web fetch — so it can answer questions beyond the vault.
- **Agent presence**: thinking-orb animations mirror the in-flight tool; the current-note attachment is dismissible; the panel drops divider noise for whitespace-driven layout; run status dots read green while working.
- **Live external changes**: a file watcher now pushes vault changes to the sidebar in real time (editors, iCloud sync, git) instead of waiting for window focus.

### Fixed

- Closed a gap where ask-to-edit mode ran agent shell commands without the required approval.
- Pasted images are now capped at 20 MB.

### Changed

- Rust dependency security advisories resolved (tauri 2.11.5, quinn-proto, rustls-webpki and more); the remaining glib/rand alerts are upstream-pinned with no fix available.
- The agent trace shows the latest eight tool calls with a reveal for earlier steps, keeping long sessions fast.
