# Ornata — agent guide

Local-first markdown notes app for macOS and Windows. Tauri 2 (Rust) + React 19 + Vite + Tailwind v4 + Tiptap 3 + Zustand. The marketing site lives in `site/` (Next 16 on Cloudflare Workers via OpenNext).

## Planning — read this first

**All feature planning comes from one document in the user's Ornata vault: `10-项目/产品/Ornata/Ornata 开发规划.md`** (on disk: `~/Documents/notes/10-项目/产品/Ornata/Ornata 开发规划.md`). When asked what to build next, what is pending, or to "read the plan", read that note — through the Ornata MCP (`read_note` with that rel path) when it is connected, otherwise straight from the file. Do not plan from memory, from this file, or from other notes in that folder (`Ornata版本规划.md`, `Ornata 更新日志.md`, …).

- Unchecked `- [ ]` items are the to-do list; sections are grouped by version or date, newest last. Re-read the note at the start of a planning task — the user edits it between sessions.
- When an item ships, tick it (`- [x]`) in that note; add a short line under it if something notable was decided or left out. Never delete or reword the user's items.
- The old in-repo `docs/功能规划.md` (work up to 0.9.0) was removed; it is only history now, still readable with `git show 9b16a0d:docs/功能规划.md`. Don't recreate a plan file in the repo.

## Commands

- `bun tauri dev` — run the app (vite on port 1420 + cargo)
- `bun run build` — typecheck (tsc) + vite production build
- `bunx tsc --noEmit` — typecheck only
- `bun test` — frontend tests (`tests/`, incl. the app smoke test and `accent-contrast`)
- `cd src-tauri && cargo test` — Rust unit tests
- `cd site && bun run deploy` — build and deploy the site (see Releasing)

## Architecture

Rust owns the filesystem; the frontend is UI + state only. All IO goes through typed Tauri commands (`src/lib/ipc.ts` is the only file that touches `invoke`).

### Vault model

User picks any folder as a vault:

- `<vault>/notes/` — plain `.md` files, filename = title, no IDs. Folders are real folders. Portable plain-markdown. The app never *authors* frontmatter, but preserves and renders any that external tools (e.g. web clippers) added — see below.
- `<vault>/.ornata/` — app data: `assets/` (pasted images). Legacy `todos.json`/`bookmarks.json` are converted once into `Todos.md`/`Bookmarks.md` notes and renamed `*.archived` (`legacy.rs`).
- App settings persist in the app config dir (`config.json`): vault path, theme mode, the light and dark palettes, language, editor toggles, image upload, PDF export, per-vault agent access, the MCP server. Old keys are migrated on load (`config.rs`), never silently dropped.

Notes are addressed by path relative to `notes/` (e.g. `projects/app.md`), never by ID. Deletes go to OS trash. External edits are picked up on window focus (dirty editor wins).

### Rust (`src-tauri/src/`)

One module per concern, each with unit tests; keep files under ~300 lines:

- `error.rs` — `AppError`/`AppResult`, serialized as `{kind, message}` to the frontend
- `vault.rs` — layout, tree scan, rel-path resolution (rejects traversal)
- `notes.rs` — CRUD, rename/move with collision suffixing ("name 2")
- `search.rs` — case-insensitive title+content search, title hits ranked first
- `backlinks.rs` — notes linking to a given note (markdown + `[[wiki]]` links)
- `tasks.rs` — vault-wide open `- [ ]` tasks; ticks a line only if it still matches
- `issues.rs` — task lines as issues: status from the box (`[ ]` todo, `[/]` doing, `[x]` done, `[-]` canceled), inline `#tag` `!urgent|!high|!medium|!low` `@YYYY-MM-DD`, plain bullets indented under a task = its notes (no milestones: a heading just ends the open task) and the times `◷YYYY-MM-DDTHH:MM` created / `✓…` done / `✗…` canceled — stamped by the app and agent tools (`new_issue_text`, `restamped`), by ticking the box in the editor (`taskStatus.ts`), never by hand-typing; day-only `✓` stamps from older lines still parse; `set_issue_status` / `set_issue_priority` rewrite the box / the `!level` token only if the line still matches
- `cli/project_tools.rs` — the project space as MCP/CLI tools (`list_projects`, `list_issues`, `next_issue`, `claim_issue`, `set_issue_status`, `set_issue_priority`, `add_decision`, `add_issue`); an agent claim is the inline token `+name` (the agent's own MCP client name from `initialize` — `mcp::handle` injects it into `claim_issue`; set by `claim_issue`, dropped when the status leaves doing); agent writes keep history snapshots.
- `projects.rs` — a project is a folder holding a hidden `.ornata-project` marker (moves with the folder); its issues are the task lines of its notes, minus nested projects'. Nothing about issues is stored outside the markdown
- `legacy.rs` — one-time conversion of retired todo/bookmark stores into notes
- `assets.rs` — save pasted images into `.ornata/assets/`
- `cli/` — the `ornata` command line and MCP server (stdio), the same executable as the app: `main.rs` calls `try_cli()` first and only starts the UI when no subcommand was given. `tools.rs` is the one tool set behind both `ornata <cmd>` and MCP, built on `agent_tools`/`notes`/`search`/`tasks`/`backlinks` (writes keep history snapshots). What a vault allows (`CliAccess`: off / read-only / read & write / full) lives in `config.json` and is chosen in Settings → Agents; launch flags (`--access`) may only lower it. (This bounds agents that work through the tools; one with shell access can edit `config.json` like any other file, so don't claim more than that in copy.) `http.rs` is the same MCP over HTTP on 127.0.0.1, served from inside the app and switched on/off from the MCP panel (Connect / Disconnect; `config.mcpServer` remembers it); it checks `Host` and `Origin` on every request and re-reads access settings per request. `presence.rs` writes a per-process file in the app config dir so the app can show who is on stdio. `app_api.rs` holds its Tauri commands.
- `history.rs` (note snapshots), `graph.rs`, `mentions.rs`, `tags.rs`, `templates.rs`, `external_notes.rs` (notes opened from outside the vault), `pdf_export.rs`/`print_export.rs`/`pdf_outline.rs`, `upload.rs`/`image_source.rs`, `settings_window.rs`, `config.rs` (settings + migrations)
- `vault_guard.rs` — keeps *agents* (MCP, CLI) inside the vault by real path; the app's own UI is deliberately not bound by it
- `backup.rs` / `backup_commands.rs` — dated zips of `notes/` + `.ornata/` (minus `history/`) into a user-chosen folder, e.g. in iCloud Drive / Dropbox; 7 daily + 4 weekly + 6 monthly kept, only files named `<Vault>-<stamp>.zip` are ever pruned; the folder may not be inside the vault; run when due (24h) by a scheduler thread per active vault, outcome in `config.backup.last` and the `ornata-backup` event. Restore = unzip; there is deliberately no in-app restore.
- `watcher.rs` — watches `notes/` only (never `.ornata/`) and emits `ornata-vault-changed` after a debounce. `SelfWrites` remembers files the app just saved (size + mtime) so an autosave is not reported back as an external change; any command that writes a note must `record` it (`write_note` does)
- `commands.rs` — thin `#[tauri::command]` wrappers only; `lib.rs` — wiring only

Blocking work must not run on the main thread, where a sync command executes: dialogs (`blocking_pick_folder`) deadlock the app, and anything that reads every note (tree scan, backlinks, search, mentions, tasks, tags, graph, unused assets) freezes the window. Make such commands `async` and run them through `off_main` (`spawn_blocking`) in `commands.rs`.

### Frontend (`src/`)

- `stores/` — zustand: `vault` (tree, view, theme mode, light/dark palettes, recents), `locale`, `mcp`, `updater`, `projects` (project listing, selected project, sidebar notes/projects mode — persisted per vault in localStorage), `tabs` (open tabs as `TabRef` = note `NoteRef`, the graph tab or the projects tab; active = derived from `vault.view`; also the split layout and every pane's own back/forward history — the pure model is `lib/split.ts`'s `PaneState`, saved with the session by `lib/paneSession.ts`), `ui` (panel/dialog flags, focus mode, the status-bar slot)
- `components/` — by feature: `layout/`, `tree/`, `editor/`, `graph/`, `palette/`, `settings/`, `welcome/`, `ui/`
- Editor: Tiptap with `contentType: "markdown"`; images stored as vault-relative paths, rendered via asset protocol. Saving: a keystroke only marks the pane dirty (`pending = DIRTY`) — serialising the whole document per key is far too slow in long notes. `takePending()` (`useNoteContent.ts`) produces the markdown on demand: the 500ms autosave, flush, note switch, delete/export and editor destroy all go through it, and it also refreshes the word count. Don't call `editor.getMarkdown()` from `onUpdate`.
- Vault-wide derived views (backlinks, unlinked mentions, graphs) refetch on `vault.vaultVersion`, which bumps only when the tree is reloaded from disk or a save changes a note's links — not on every autosave. Don't key them on the `tree` object.
- Status bar (`layout/ShortcutBar.tsx`) spans the whole window: shortcut hints on the left; on the right the update hint, a slot that the active note portals its cursor line/col, history button and word count into (`ui.statusInfoEl`; floats bottom-right in focus mode), the MCP plug, the theme switcher (`ThemeSwitcher`) and Settings.
- Tabs: `NotesWorkspace` keeps one live pane per open tab — a `NoteEditor` per note, `GraphView` for the graph tab — with inactive panes hidden via `visibility:hidden` — tab switch is a CSS toggle, never a remount/re-parse. Keep it that way. `NoteRef` stays note-only (IPC, editors); only tab/view code deals in `TabRef` / `View`.
- First project made seeds PRD / Bug report templates (`templates::seed_project_templates`, once per vault).
- Task statuses: `editor/taskStatus.ts` adds `[/]` doing and `[-]` canceled to Tiptap task items (a `status` attr beside `checked`; the stock tokenizer only knows `[ xX]`, so markers are swapped for a private-use sentinel before it runs). Typing `[/] ` / `[-] ` at a line start creates one (`TaskStatusInput`, like `starTask.ts` for `* `); the slash menu has both too.
- Projects: `components/projects/` — `ProjectsView` (the projects tab: list view = issues grouped by note, or `BoardView` = status columns (In progress is ordered by priority, the rest by note order — `lib/issueOrder.ts`) with @dnd-kit drag to change status and a "+" per column that adds a task in that status to the project's `Tasks.md` (just where the line is stored; a project that already has a `Backlog.md` keeps using it); status click cycles todo → doing → done, right-click on a row or card picks any status or priority) and `ProjectsSidebar` (sidebar in project mode). Folder context menu marks/unmarks a project. Right-click an issue → "Turn into issue page" (`lib/promoteIssue.ts`: `create_issue_note` makes `<project>/issues/<title>.md`, `replace_issue_text` turns the line into a link to it). Selection toolbar "Create issue" (`lib/captureIssue.ts` + `projects::add_issue`) appends `- [ ] text [Note](href)` to `<project>/Tasks.md`; a note outside every project gets `IssuePicker`.
- Graph: `components/graph/` — `GraphView` (full graph tab: search, drag, folder regions) and `LocalGraph` (note footer), sharing `graphPaint.ts` (drawing, eased hover, labels) and `graphCanvas.ts` (sizing, fit, hit-test, fade loop).
- Session: `lib/session.ts` persists per-vault UI layout (open tabs, active view) to localStorage keyed by vault root, restoring it on launch.
- Page links: internal note links are plain markdown links whose href is a vault-relative note path (`[Title](projects/app.md)`). `lib/noteLinks.ts` converts href↔rel and rewrites `[[wiki]]`/`[[target|alias]]` syntax (on type + on load) into those markdown links; clicking one opens the note; `/link` slash command + `NoteLinkPicker` also insert them.
- Frontmatter: `lib/frontmatter.ts` splits a leading `---` YAML block off the body on load and re-attaches it verbatim on save (so metadata round-trips), and parses it for the read-only `NoteProperties` panel shown above the editor. The editor body never contains the raw YAML.

## UI conventions

- Monochrome with one accent: only the semantic tokens in `styles.css` (`bg`, `panel`, `sunken`, `ink`, `muted`, `faint`, `line`, `hover`, `active`, `invert`, `accent`…). The `accent` (teal in the default palette; each palette has its own, with `accent-ink` for the tick on it) is for exactly these: note links, checked tasks, the text caret and selection, and the quote bar — nothing else, and never as a fill for chrome. Its contrast on `--bg` is pinned by `tests/accent-contrast.test.ts`. `panel` is the chrome surface (sidebar and tab strip); `sunken` is the recessed surface (segmented controls, code wells), darker than `panel`. Never hardcode colors; `danger` is the exception for destructive actions, and the link graph's folder colors (`--graph-1…4`, graph only) are the other. Those four hues are validated all-pairs for color-blind and normal vision on `--bg` in both themes — don't add a fifth or reuse them elsewhere; extra folders stay gray.
- Palettes: a colour scheme is chosen separately for light and for dark mode (`config.lightPalette` / `config.darkPalette`, Settings → Appearance cards; registry + card swatches in `lib/palettes.ts`). `lib/theme.ts` puts the one for the current mode on `<html data-palette>` (absent = default). Light: `paper`, `paper-textured` (same colours, hand-drawn rules and block caret; the textured one adds the grain overlay). Dark: `basalt`, `tokyo-techno`, `early-ember`, `neon-noir`. Each is a block of overrides in `styles.css`; a palette may carry its own accent (still one accent per palette, same uses) and must keep the contrast pinned in `tests/accent-contrast.test.ts`. Adding one = a CSS block, a registry entry, a Rust enum variant, an i18n label and a line in that test.
- The green `success` token is for state that is literally "on": the MCP plug in the status bar while the MCP server is running or an agent is on stdio (gray otherwise).
- Dark mode = `.dark` class on `<html>`; mode is system/light/dark, and the palette is a separate `data-palette` attribute (above). Print and export windows always render the neutral palette.
- Icons are Tabler (`@tabler/icons-react`, named `Icon…`, sized by `size` and `stroke`); don't add another icon library. Palette cards in Settings and the status-bar switcher use the literal swatches in `lib/palettes.ts`.
- Settings pages (`components/settings/`): General (language, vault), Appearance (mode + light/dark palette cards), Editor (toggles, image upload), Export, Agents (MCP), Shortcuts, About (version, updates). Prefer folding a new setting into one of these over adding a page.
- Active/selected rows use inverted style (`bg-invert text-invert-ink`) — the signature look.
- Motion: 100–160ms ease-out only. Fonts: Inter Variable (UI), Cascadia Code (editor body + titles, CJK falls back to PingFang), Fira Code (code).
- No autocorrect anywhere: global `focusin` hook in `main.tsx` handles inputs; editor sets its own attrs.
- The caret is drawn by `editor/cursorMotion.ts` (animated SVG path, rounded in block mode); palettes switch it between a bar and a translucent block through `--caret*` tokens. With "cursor animation" off the native caret shows, as a thin bar.
- Website feature additions must use the animated product-behavior demos established in `site/components/FeaturesBento.tsx` (for example, “Link ideas together”). Do not add static feature-card/checklist grids, and do not promote small release details as standalone homepage features.

- Website languages: English at the root, 简体中文 under `/zh` (`site/app/(en)` and `site/app/zh` are two root layouts sharing `app/shell.tsx`). Page copy lives in `site/lib/copy.ts` (+ `faq.ts`, `releases.ts` with optional `zh`, and `components/docs/*.zh.tsx`); components read it with `useCopy()`. A new user-facing string needs both languages. The product-demo mock UIs stay English.

## Releasing

Releases are run by hand from the maintainer's Mac (Developer ID + Apple notarization + Tauri updater key; `bun run release:preflight` checks them). Windows installers are built and published separately on a Windows machine, so a macOS release must not claim them.

1. Update `CHANGELOG.md` (new `## [x.y.z] - date` above the last one) and add an entry to `site/lib/releases.ts` (English plus `zh`). `bun run changelog:note` then mirrors CHANGELOG.md into the vault note `10-项目/产品/Ornata/Ornata 更新日志.md` (hand-written v0.1.x entries are kept, 0.2.0+ is regenerated); `bun run release` also runs it. Run it whenever CHANGELOG.md changes outside a release.
2. `bun run release x.y.z "<notes>"` — version sync, signed build, notarization, staged in `release/x.y.z/`. Commit and push the version bump it makes.
3. `bun run release:publish -- x.y.z --confirm` — uploads to R2 and switches the stable channel (what the in-app updater reads). This is not undoable; check the staged files first.
4. Only after step 3, `cd site && bun run deploy`: the site's download links are built from the version number.

## The website (`site/`)

- Next 16 + OpenNext on Cloudflare Workers; `bun run deploy` builds and deploys, `bunx wrangler rollback` undoes it. If OpenNext refuses the Next version, upgrade Next rather than passing `--dangerouslyUseUnsupportedNextVersion`.
- When a feature or UI change ships, bring the site along in the same pass, in both languages: `lib/copy.ts`, `faq.ts`, `components/docs/*` (+ `.zh`), `app/llms.txt/route.ts`, and the README feature list. The hero demo (`components/AppDemo.tsx`) mirrors the real window — sidebar, tabs, pane headers, status bar — so update it when that chrome changes. Features worth a section get an animated demo (e.g. `ThemesDemo.tsx`), numbered `NN / TOTAL` in `FeaturesBento.tsx`.

## Adding beui components

Animated components come from the beui registry (the user's own library). A compatibility layer is already in place so pulled components inherit our monochrome theme unchanged:

- `src/lib/utils.ts` exports `cn()` (clsx + tailwind-merge) — what beui/shadcn files import. Our own components use `cx()`.
- `src/lib/ease.ts` — shared motion tokens (`SPRING_PANEL`, `EASE_OUT`, …). `styles.css` mirrors `--ease-out` and defines the `.press` utility.
- `styles.css` maps shadcn semantic tokens (`--color-background`, `--color-foreground`, `--color-card`, `--color-border`, `--color-muted-foreground`, `--color-destructive`, `--color-border-strong`, …) onto our palette, so `bg-background`, `border-border`, `text-muted-foreground` etc. resolve to our monochrome look in both themes.
- `components.json` registers the `@beui` registry (`https://beui.dev/r/{name}.json`).

Two ways to add one:
1. **beui MCP** (preferred): `get_component <slug>` returns every file's contents; write them under `src/components/…`. Shared files (`lib/ease.ts`, `lib/utils.ts`) already exist — don't overwrite.
2. **shadcn CLI**: `bunx --bun shadcn add @beui/<slug>`.

Our `Modal` (`components/ui/Modal.tsx`) is built on the same tokens; keep new dialogs on it for one motion language.

## Rules

- Never add "Co-Authored-By" or any AI attribution to commits or PRs.
- After finishing each discrete task (feature, fix, or reviewable unit of work): commit with a conventional message and `git push` to the remote tracking branch (usually `origin/main`). Do not leave completed work only on the local machine.
- Commit messages: conventional commits, subject ≤50 chars where possible.
- Block drag handles were tried and pulled (Tauri swallowed in-page HTML5 drag-and-drop, so drops did nothing). Keyboard moves (⌥↑/⌥↓) stay. If redone, don't rely on native HTML5 drag: drag with mouse events, draw the drop line, auto-scroll at edges, move a folded heading's whole section, and keep clear of the heading fold arrow and the empty-line “+”. Tiptap's collaboration packages drag in yjs (+163 kB).
- Don't reintroduce: sticky notes, note IDs, plugin-fs, standalone todos/bookmarks. Don't *author* frontmatter (external frontmatter is preserved/rendered, not written by us). `[[wiki]]` is accepted as input but stored as standard markdown `[title](path.md)` links.

## X运营
- 每次发布新版本之后,提取本次版本中核心、主要、或者你认为不错的实用卖点来准备一条X推文,最好是包含配图,推文放在ornata中的产品-Ornata-X推文这个文档中。
