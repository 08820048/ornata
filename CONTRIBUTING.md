# Contributing to Ornata

Thanks for considering a contribution. Ornata stays small on purpose — please open an issue before starting on anything beyond a bug fix, so we can agree on the approach first. By taking part you agree to the [code of conduct](./CODE_OF_CONDUCT.md).

## Setup

Requirements: [Bun](https://bun.sh) and [Rust](https://rustup.rs) (the toolchain is pinned in `rust-toolchain.toml` and installs itself), plus:

- **macOS:** Xcode Command Line Tools.
- **Windows:** Visual Studio Build Tools with "Desktop development with C++", and WebView2 (built into Windows 10/11).

```bash
bun install
bun tauri dev
```

## Before opening a PR

```bash
bunx tsc --noEmit                                   # typecheck
bun test                                            # frontend tests, incl. the app smoke test
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo test                          # Rust unit tests
```

CI runs the same commands on macOS and Windows; all of them must pass.

For a UI change, say in the PR what you checked by hand (light and dark, a couple of palettes, English and Chinese, a small window) and add a screenshot.

## Code conventions

See [AGENTS.md](./AGENTS.md) for the full architecture guide. The short version:

- **Rust owns the filesystem.** The frontend is UI + state only — all IO goes through typed Tauri commands in `src/lib/ipc.ts`.
- **One Rust module per concern**, each under ~300 lines, with its own unit tests. Don't collapse everything into `lib.rs`.
- **Monochrome with one accent.** Only the semantic tokens in `src/styles.css` (`bg`, `panel`, `ink`, `muted`, `faint`, `line`, `hover`, `invert`, `accent`…). Never hardcode a color.
- **Motion:** 100–160ms ease-out, nothing bouncier (the library cards are the one documented exception).
- **Both languages:** every user-facing string goes in `src/lib/i18n.ts` in English and Chinese.
- **Plain Markdown on disk.** Features must round-trip through ordinary Markdown; don't invent syntax only Ornata can read.

## Commit messages

[Conventional commits](https://www.conventionalcommits.org/), subject line ≤50 chars where possible (`feat: ...`, `fix: ...`, `chore: ...`).

## What we won't merge

- Note IDs, Ornata-authored frontmatter, sticky notes, or a plugin system — deliberately left out, see AGENTS.md.
- Built-in AI, cloud sync or accounts. Agents connect through MCP instead.
- Anything that adds a color outside the token set.
- Code copied from projects whose license isn't compatible with MIT (GPL, AGPL, no license). If you adapt MIT/BSD/Apache code, say where it came from in the PR and add it to [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).

## License of contributions

Ornata is MIT-licensed. Contributions are accepted under the same license: by opening a pull request you agree that your work is released under the [MIT License](./LICENSE).

## Reporting bugs

Use the bug report template: the Ornata version (Settings → About), your OS and version, and steps to reproduce. If it's a vault or data issue, mention whether it happens with a fresh vault folder too.

Security problems: please follow [SECURITY.md](./SECURITY.md) instead of opening an issue.
