# Ornata — agent guide

Local-first markdown notes app for macOS. Tauri 2 (Rust) + React 19 + Vite + Tailwind v4 + Tiptap 3 + Zustand.

## Commands

- `bun tauri dev` — run the app (vite on port 1420 + cargo)
- `bun run build` — typecheck (tsc) + vite production build
- `bunx tsc --noEmit` — typecheck only
- `cd src-tauri && cargo test` — Rust unit tests
- `bun run release` — full signed release (scripts/release.sh)

## Architecture

Rust owns the filesystem; the frontend is UI + state only. All IO goes through typed Tauri commands (`src/lib/ipc.ts` is the only file that touches `invoke`).

### Vault model

User picks any folder as a vault:

- `<vault>/notes/` — plain `.md` files, filename = title, no IDs. Folders are real folders. Portable plain-markdown. The app never *authors* frontmatter, but preserves and renders any that external tools (e.g. web clippers) added — see below.
- `<vault>/.ornata/` — app data: `assets/` (pasted images). Legacy `todos.json`/`bookmarks.json` are converted once into `Todos.md`/`Bookmarks.md` notes and renamed `*.archived` (`legacy.rs`).
- Vault path + theme persist in the app config dir (`config.json`).

Notes are addressed by path relative to `notes/` (e.g. `projects/app.md`), never by ID. Deletes go to OS trash. External edits are picked up on window focus (dirty editor wins).

### Rust (`src-tauri/src/`)

One module per concern, each with unit tests; keep files under ~300 lines:

- `error.rs` — `AppError`/`AppResult`, serialized as `{kind, message}` to the frontend
- `vault.rs` — layout, tree scan, rel-path resolution (rejects traversal)
- `notes.rs` — CRUD, rename/move with collision suffixing ("name 2")
- `search.rs` — case-insensitive title+content search, title hits ranked first
- `backlinks.rs` — notes linking to a given note (markdown + `[[wiki]]` links)
- `tasks.rs` — vault-wide open `- [ ]` tasks; ticks a line only if it still matches
- `legacy.rs` — one-time conversion of retired todo/bookmark stores into notes
- `assets.rs` — save pasted images into `.ornata/assets/`
- `cli/` — the `ornata` command line and MCP server (stdio), the same executable as the app: `main.rs` calls `try_cli()` first and only starts the UI when no subcommand was given. `tools.rs` is the one tool set behind both `ornata <cmd>` and MCP, built on `agent_tools`/`notes`/`search`/`tasks`/`backlinks` (writes keep history snapshots). What a vault allows (`CliAccess`: off / read-only / read & write / full) lives in `config.json` and is chosen in Settings → Agents; launch flags (`--access`) may only lower it. (This bounds agents that work through the tools; one with shell access can edit `config.json` like any other file, so don't claim more than that in copy.) `http.rs` is the same MCP over HTTP on 127.0.0.1, served from inside the app and switched on/off from the MCP panel (Connect / Disconnect; `config.mcpServer` remembers it); it checks `Host` and `Origin` on every request and re-reads access settings per request. `presence.rs` writes a per-process file in the app config dir so the app can show who is on stdio. `app_api.rs` holds its Tauri commands.
- `commands.rs` — thin `#[tauri::command]` wrappers only; `lib.rs` — wiring only

Blocking dialogs (`blocking_pick_folder`) must run in async commands via `spawn_blocking` — on the main thread they deadlock the app.

### Frontend (`src/`)

- `stores/` — zustand: `vault` (tree, view, theme, recents), `tabs` (open tabs as `TabRef` = note `NoteRef` or the graph tab; active = derived from `vault.view`; also the split layout and every pane's own back/forward history — the pure model is `lib/split.ts`'s `PaneState`, saved with the session by `lib/paneSession.ts`), `ui`, `agent`
- `components/` — by feature: `layout/`, `tree/`, `editor/`, `graph/`, `palette/`, `settings/`, `welcome/`, `ui/`
- Editor: Tiptap with `contentType: "markdown"`; autosave debounced 500ms, flush on unmount; images stored as vault-relative paths, rendered via asset protocol
- Tabs: `NotesWorkspace` keeps one live pane per open tab — a `NoteEditor` per note, `GraphView` for the graph tab — with inactive panes hidden via `visibility:hidden` — tab switch is a CSS toggle, never a remount/re-parse. Keep it that way. `NoteRef` stays note-only (IPC, editors); only tab/view code deals in `TabRef` / `View`.
- Graph: `components/graph/` — `GraphView` (full graph tab: search, drag, folder regions) and `LocalGraph` (note footer), sharing `graphPaint.ts` (drawing, eased hover, labels) and `graphCanvas.ts` (sizing, fit, hit-test, fade loop).
- Session: `lib/session.ts` persists per-vault UI layout (open tabs, active view) to localStorage keyed by vault root, restoring it on launch.
- Page links: internal note links are plain markdown links whose href is a vault-relative note path (`[Title](projects/app.md)`). `lib/noteLinks.ts` converts href↔rel and rewrites `[[wiki]]`/`[[target|alias]]` syntax (on type + on load) into those markdown links; clicking one opens the note; `/link` slash command + `NoteLinkPicker` also insert them.
- Frontmatter: `lib/frontmatter.ts` splits a leading `---` YAML block off the body on load and re-attaches it verbatim on save (so metadata round-trips), and parses it for the read-only `NoteProperties` panel shown above the editor. The editor body never contains the raw YAML.

## UI conventions

- Monochrome with one accent: only the semantic tokens in `styles.css` (`bg`, `panel`, `sunken`, `ink`, `muted`, `faint`, `line`, `hover`, `active`, `invert`, `accent`…). The teal `accent` (with `accent-ink` for the tick on it) is for exactly these: note links, checked tasks, the text caret and selection, and the quote bar — nothing else, and never as a fill for chrome. Its contrast on `--bg` is pinned by `tests/accent-contrast.test.ts`. `panel` is the chrome surface (sidebar and tab strip); `sunken` is the recessed surface (segmented controls, code wells), darker than `panel`. Never hardcode colors; `danger` is the exception for destructive actions, and the link graph's folder colors (`--graph-1…4`, graph only) are the other. Those four hues are validated all-pairs for color-blind and normal vision on `--bg` in both themes — don't add a fifth or reuse them elsewhere; extra folders stay gray.
- Palettes: `data-palette` on `<html>` (`config.palette`, Settings → Appearance) layers over light/dark mode. `paper-basalt` = Paper (light) + Basalt (dark), defined in `styles.css` as overrides of the base tokens. A palette may carry its own accent (Paper green, Basalt steel blue) — still one accent per palette, same uses — and must keep the contrast pinned in `tests/accent-contrast.test.ts`.
- The green `success` token is for state that is literally "on": the MCP plug in the status bar while the MCP server is running or an agent is on stdio (gray otherwise).
- Dark mode = `.dark` class on `<html>`; themes: system/light/dark.
- Active/selected rows use inverted style (`bg-invert text-invert-ink`) — the signature look.
- Motion: 100–160ms ease-out only. Fonts: Inter Variable (UI), Cascadia Code (editor body + titles, CJK falls back to PingFang), Fira Code (code).
- No autocorrect anywhere: global `focusin` hook in `main.tsx` handles inputs; editor sets its own attrs.
- Website feature additions must use the animated product-behavior demos established in `site/components/FeaturesBento.tsx` (for example, “Link ideas together”). Do not add static feature-card/checklist grids, and do not promote small release details as standalone homepage features.

- Website languages: English at the root, 简体中文 under `/zh` (`site/app/(en)` and `site/app/zh` are two root layouts sharing `app/shell.tsx`). Page copy lives in `site/lib/copy.ts` (+ `faq.ts`, `releases.ts` with optional `zh`, and `components/docs/*.zh.tsx`); components read it with `useCopy()`. A new user-facing string needs both languages. The product-demo mock UIs stay English.

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
- Don't reintroduce: sticky notes, note IDs, plugin-fs, standalone todos/bookmarks. Don't *author* frontmatter (external frontmatter is preserved/rendered, not written by us). `[[wiki]]` is accepted as input but stored as standard markdown `[title](path.md)` links.
