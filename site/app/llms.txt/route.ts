import { DMG, VERSION } from "@/lib/config";
import { FAQS } from "@/lib/faq";

// llms.txt — a plain index for AI crawlers and answer engines.
// Spec: https://llmstxt.org
export const dynamic = "force-static";

export function GET() {
  const body = `# Ornata

> Ornata is a free, local-first Markdown notes app for macOS. Notes are plain .md files in a folder you own — no account, no proprietary database — with an optional local AI assistant (AssistantPi) that only acts with your permission.

Ornata is built on the principle that notes should outlive the app: plain Markdown files, real folders, and frontmatter preserved verbatim. The vault can be opened in Finder, edited in any text editor, and shared with tools like Obsidian and git.

## Pages

- [Home](https://ornata.app): Product overview, feature walkthroughs, and FAQ
- [Docs](https://ornata.app/docs): How to use every part of the app, including MCP, the command line, and shortcuts
- [Updates](https://ornata.app/updates): Release notes for every version
- [Download ${VERSION} (Apple Silicon DMG)](${DMG}): Latest signed and notarized build

## Key facts

- Platform: macOS 12+, Apple Silicon
- Format: plain .md files in real folders; wikilinks are stored as standard Markdown links
- Storage: any folder the user chooses, on their Mac; syncs via iCloud Drive, Dropbox, or git
- Pricing: free
- Account: not required
- AI: AssistantPi runs as a local Pi sidecar; permission-gated (read-only by default), user chooses the model and provider
- Compatibility: works on the same plain-Markdown vault as Obsidian; preserves external frontmatter
- Linking: backlinks and unlinked mentions per note; a link graph tab (folder regions, search, link direction) and a local graph under each note
- Workspace: open tabs, plus split view — up to four notes side by side, each pane with its own header, draggable dividers, ⌘1–⌘4 to jump between panes; focus mode; back/forward through visited notes; headings fold; @ inserts a link to a daily note
- Search: ⌘K command palette searches titles and content, and finds titles from shorthand (e.g. "prjroad" → "project roadmap")
- Agents: Ornata serves MCP, so outside agents (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Claude Desktop) can search, read, and edit notes. Connect from MCP Settings; HTTP on localhost (http://127.0.0.1:13200/mcp, with a bearer token shown in MCP Settings) or stdio (the command "ornata mcp", works with the app closed). Access is set per vault in Settings (off, read only, read & write, full) and the agent cannot raise it. The same tools are a command line: ornata search, read, tasks, backlinks, daily, journal add, capture, create, append
- Export: PDF with a heading bookmark outline and paper/margin settings, standalone HTML, or the Markdown file itself
- Extras: LaTeX math (KaTeX), Mermaid diagrams, full-text search, vault-wide open tasks
- Updates: signed update feed; Developer ID signed and notarized builds
- Languages: English, Simplified Chinese
- License: MIT

## Questions

${FAQS.map((item) => `- **${item.q}**\n  ${item.a}`).join("\n")}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
