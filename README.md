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

Ornata is signed but **not yet notarized**, so on the first launch macOS asks to verify it. Open it once, either way:

**Terminal**

```bash
xattr -dr com.apple.quarantine /Applications/Ornata.app
```

Then open Ornata normally.

**Or via Settings**

Double-click Ornata → click **Done** → **System Settings → Privacy & Security** → **Open Anyway** → authenticate. macOS remembers the choice after that.

> Notarization (which removes this prompt entirely) needs an active Apple Developer account and is planned for a future release.

---

## Features

- **WYSIWYG markdown editor** — write in a rich editor, saved as clean markdown on disk
- **Folders & subfolders** — organize notes in real, Finder-visible folders
- **Todos** — a standalone task list with tags and filtering
- **Bookmarks** — save links with auto-fetched title, image, and favicon; tag and filter them too
- **⌘K command palette** — jump to any note, folder, or page instantly
- **Instant search** — title + content, ranked, in milliseconds
- **Monochrome UI** — light, dark, or system theme; no color noise
- **Portable vault** — plain files, no IDs, no frontmatter, no lock-in

---

## Vault model

Pick any folder on disk as your vault:

```
<vault>/
├── notes/          plain .md files — filename is the title, folders are real folders
└── .ornata/         app data: todos, bookmarks, tags, pasted images
```

Notes are addressed by path, never by ID. Deletes go to the OS trash. Edit notes externally (vim, VS Code, whatever) — Ornata picks up changes on window focus.

---

## Getting started

Requirements: [Bun](https://bun.sh), [Rust](https://rustup.rs), and Xcode Command Line Tools.

```bash
bun install
bun tauri dev      # run the app
```

Build a release bundle:

```bash
bun tauri build    # produces a .app and .dmg under src-tauri/target/release/bundle
```

See [AGENTS.md](./AGENTS.md) for architecture details, or [CONTRIBUTING.md](./CONTRIBUTING.md) to send a PR.

---

## Data & Privacy

- Notes are stored locally as user-owned files
- No analytics, tracking, accounts, or note-content uploads
- Automatic updates are disabled in this development fork until Ornata has its
  own signing key and release feed
- Saving a bookmark fetches that page's title, preview image, and favicon
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
