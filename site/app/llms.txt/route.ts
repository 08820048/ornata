import { DMG, EXE, VERSION, WINDOWS_VERSION } from "@/lib/config";
import { FAQS } from "@/lib/faq";

// llms.txt — a plain index for AI crawlers and answer engines.
// Spec: https://llmstxt.org
export const dynamic = "force-static";

export function GET() {
  const body = `# Ornata

> Ornata is a free, local-first Markdown notes app for macOS and Windows. Notes are plain .md files in a folder you own — no account, no proprietary database — and an MCP server and command line so the AI agents you already use can work on the vault, only as far as you allow.

Ornata is built on the principle that notes should outlive the app: plain Markdown files, real folders, and frontmatter preserved verbatim. The vault can be opened in Finder or File Explorer, edited in any text editor, and shared with tools like Obsidian and git.

## Pages

- [Home](https://ornata.app): Product overview, feature walkthroughs, and FAQ
- [Docs](https://ornata.app/docs): How to use every part of the app, including MCP, the command line, and shortcuts
- [简体中文 / Chinese](https://ornata.app/zh): 中文首页、文档(/zh/docs)与更新日志(/zh/updates)
- [Updates](https://ornata.app/updates): Release notes for every version
- [Source code](https://github.com/08820048/ornata): MIT-licensed, on GitHub
- [Download ${VERSION} (Apple Silicon DMG)](${DMG}): Latest signed and notarized build
- [Download ${WINDOWS_VERSION} (Windows 64-bit installer)](${EXE}): Not yet code-signed; SmartScreen may warn

## Key facts

- Platform: macOS 12+ (Apple Silicon), Windows 10+ (64-bit; Ctrl replaces ⌘)
- Format: plain .md files in real folders; wikilinks are stored as standard Markdown links
- Storage: any folder the user chooses, on their computer; syncs via iCloud Drive, Dropbox, or git
- Pricing: free
- Account: not required
- AI: Ornata has no built-in model or cloud service; bring your own agent through MCP or the command line
- Compatibility: works on the same plain-Markdown vault as Obsidian; preserves external frontmatter
- Linking: backlinks and unlinked mentions per note; a link graph tab (folder regions, search, link direction) and a local graph under each note
- Workspace: open tabs, plus split view — up to four notes side by side, each pane with its own header, draggable dividers, ⌘1–⌘4 to jump between panes; focus mode with typewriter scrolling (the current line stays centred, other paragraphs dim); text size, line width and line height presets (Settings → Editor); back/forward through visited notes; headings fold; @ inserts a link to a daily note
- Library: a tab that shows the vault's folders and notes as cards — a folder card shows its most recently edited notes, a note card a miniature of the note's opening; click a folder to step into it
- Projects: right-click a folder to mark it as a project; the task lines in its notes become issues, in a list or on a board (Todo, In progress, Done, Canceled). Status is the checkbox ([ ] [/] [x] [-]), with inline #tag, !urgent/!high/!medium/!low, @date, and times — all stored in the Markdown. Drag cards to change status; "Turn into issue page" gives an issue its own note. Agents with read & write access can list, claim, update and add issues; a claimed issue shows the agent's logo and a done one shows who finished it
- Search: ⌘K command palette searches titles and content, and finds titles from shorthand (e.g. "prjroad" → "project roadmap")
- Agents: Ornata serves MCP, so outside agents (Claude Code, Codex, Gemini CLI, Cursor, VS Code, Claude Desktop) can search, read, and edit notes. Connect from MCP Settings; HTTP on localhost (http://127.0.0.1:13200/mcp, with a bearer token shown in MCP Settings) or stdio (the command "ornata mcp", works with the app closed). Access is set per vault in Settings (off, read only, read & write, full) and the agent cannot raise it. The same tools are a command line: ornata search, read, tasks, backlinks, daily, journal add, capture, create, append
- Backup: Settings › General saves a dated zip of the notes and images (not history snapshots) to a folder you choose, e.g. in iCloud Drive or Dropbox, about once a day; restore by unzipping
- Themes: light, dark, or follow the system, with a theme for each — Default / Paper / Paper Textured in light, Default / Basalt Bedrock / Tokyo Techno / Early Ember / Neon Noir in dark; switch from the status bar
- Export: PDF with a heading bookmark outline and paper/margin settings, standalone HTML, or the Markdown file itself
- Extras: LaTeX math (KaTeX), Mermaid diagrams, full-text search, vault-wide open tasks, project boards
- Updates: signed update feed; the macOS build is Developer ID signed and notarized (the Windows installer is not yet code-signed)
- Languages: English, Simplified Chinese
- License: MIT (open source: https://github.com/08820048/ornata)

## Questions

${FAQS.map((item) => `- **${item.q}**\n  ${item.a}`).join("\n")}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
