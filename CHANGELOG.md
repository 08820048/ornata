# Changelog

All notable changes to Ornata are documented in this file.

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
