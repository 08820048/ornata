export const FAQS: { q: string; a: string }[] = [
  {
    q: "How much does Ornata cost?",
    a: "Ornata is free to download and use — no account, no subscription. Production builds are signed with an Apple Developer ID certificate and notarized by Apple.",
  },
  {
    q: "Where are my notes stored?",
    a: "On your Mac, as plain Markdown files in a folder you choose. The core editor needs no account or proprietary database, and you can open the folder in Finder at any time.",
  },
  {
    q: "Is there sync?",
    a: "Not built in yet. Because notes are just files in a folder, you can sync them today with iCloud Drive, Dropbox, or git. Native sync is on the roadmap.",
  },
  {
    q: "Does it work with Obsidian?",
    a: "Yes. Ornata uses the same plain-Markdown vault with real folders, and preserves frontmatter from other tools. Point Ornata and Obsidian at the same folder and both just work.",
  },
  {
    q: "Is there a graph view?",
    a: "Yes. The link graph opens as a tab beside your notes: folders form soft colored regions, hovering a note traces its links and their direction, and you can search, drag, and zoom. Any note can also show its own local graph beneath the text.",
  },
  {
    q: "Can I view two notes side by side?",
    a: "Yes. ⌘-click a link, press ⌘↵ on a result in the command palette, or choose Open to the side from a tab or a file's menu. You can have up to four panes, each with its own header and history arrows. Drag a divider to resize, or close a pane when you're done.",
  },
  {
    q: "Can I export my notes?",
    a: "They're already Markdown files, so there's nothing to export to keep them. To share, export a note as a PDF — with a bookmark outline built from its headings, plus your choice of paper size and margins — or as standalone HTML. Each export offers Show in Finder when it's done.",
  },
  {
    q: "Is the macOS download signed?",
    a: "Yes. Production downloads are signed with an Apple Developer ID certificate, notarized by Apple, and distributed through Ornata’s signed update feed.",
  },
  {
    q: "Windows or Linux?",
    a: "macOS first. Ornata is built on Tauri, which is cross-platform, so other platforms may follow — but macOS is where it's polished today.",
  },
  {
    q: "Can I use Claude Code, Codex, or Cursor with my notes?",
    a: "Yes. Ornata speaks MCP. Open MCP Settings from the plug in the status bar, press Connect, and add it to your agent with the one line shown there — it includes the access token the server requires. Agents that only run commands can start ornata mcp instead, which works even when Ornata is closed. The same tools are available in a terminal as ornata search, ornata journal add, ornata tasks, and more.",
  },
  {
    q: "What can an outside agent do to my notes?",
    a: "Only what you allow, per vault, in Settings: off, read only (the default), read & write, or full access. Read only lists, reads, and searches. Read & write can also create, edit, append, and tick tasks, and every edit keeps the previous version in the note's history. Full access adds rename, move, and delete, and deleted notes go to the Trash. It is set only in Ornata — an agent's own configuration can only lower it — and the server only listens on your Mac's localhost and requires an access token. An agent that can also run shell commands has your file access anyway, so give those the level you'd trust them with.",
  },
  {
    q: "How does AssistantPi work?",
    a: "Install and configure Pi on your Mac, then Ornata connects to that local Pi process. You keep control of the model and provider in Pi, while Ornata supplies permission-controlled tools for your notes. The open note is attached automatically, and selected note text can be included for precise context.",
  },
  {
    q: "What can AssistantPi access?",
    a: "Read only is the default: AssistantPi can read and search, and browse the web. Ask to edit lets it propose any change — edits, deletes, or a shell command — and each one waits for your approval. Auto runs note and shell operations, including delete, without asking. You choose the mode in the composer before sending.",
  },
  {
    q: "Does AssistantPi keep everything on my Mac?",
    a: "The Pi process and your Ornata files run locally. If the model configured in Pi is remote, the prompt and attached context are sent to that model provider under its terms. Fully local or offline behavior depends on the model setup you choose in Pi.",
  },
  {
    q: "How do updates work?",
    a: "Ornata automatically checks its signed update feed. When a release is available, you can download it with visible progress and restart to install it. Production builds are Developer ID signed and notarized by Apple.",
  },
  {
    q: "Which interface languages are supported?",
    a: "English and Simplified Chinese are built in. You can switch languages from Settings without changing the language of your notes.",
  },
];
