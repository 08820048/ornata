import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { DownloadModal } from "@/components/DownloadModal";
import { DownloadButton } from "@/components/ui/download-button";

type Release = {
  version: string;
  date: string;
  dateTime: string;
  summary: string;
  changes: string[];
};

const RELEASES: Release[] = [
  {
    version: "0.7.0",
    date: "September 28, 2026",
    dateTime: "2026-09-28",
    summary:
      "AssistantPi remembers the conversation, undoes its own edits, and can be pointed at other notes.",
    changes: [
      "Conversations stay with the vault. Start a new chat, or reopen an earlier one from the panel.",
      "Each reply lists the notes AssistantPi edited or created, with one-click undo. If you changed a note after that, undo stops and points you at the note's history.",
      "Type @ to attach any note. Linked notes can also include the notes this one links to and from — paths and titles only, up to 20, so the model reads what it needs.",
      "With a note attached and an empty composer, Summarize, Suggest links, and Extract tasks are one tap away. Suggest links and Extract tasks only propose changes.",
      "Approval cards show the shell command, a before/after diff for an edit, the body of a new note, and the path for delete, rename, and move.",
      "Read, grep, find, and ls stay inside the vault, including paths that follow a symlink out of it.",
      "The editor tab strip uses the same panel tone as the sidebar.",
    ],
  },
  {
    version: "0.6.0",
    date: "September 28, 2026",
    dateTime: "2026-09-28",
    summary:
      "A relationship graph, note export, and a fuller way to find and revisit what you wrote.",
    changes: [
      "Open the vault as a relationship graph in its own tab, or see the current note's neighborhood at the bottom of the page. The graph colors the largest folders, and you can drag nodes, search, and follow link direction.",
      "Export a note to PDF, HTML, or rich text. PDFs include heading bookmarks, paper size and margin settings, and a Show in Finder action when the file is ready.",
      "Keep a history of each note, compare a snapshot with the current text, and restore it.",
      "Search the vault with more than one term, and find and replace inside the open note.",
      "Added tags, daily notes, templates, and pinned notes.",
      "Capture a thought into Inbox from anywhere. Heading links use path.md#heading, and renaming or moving a note rewrites the links that point to it.",
      "See every open task in one list. The bottom of a note lists the notes that mention it, including unlinked mentions.",
      "Sort the sidebar by modified time. Unreferenced images in the vault can be cleaned up.",
      "Retired the standalone Todos and Bookmarks pages. On the next launch, existing lists become Todos.md and Bookmarks.md, and the old files are kept as archives.",
    ],
  },
  {
    version: "0.5.1",
    date: "September 21, 2026",
    dateTime: "2026-09-21",
    summary: "A new app icon, and a tab strip you can scroll with the wheel.",
    changes: [
      "A new app icon across the app, Dock, and website.",
      "Mouse-wheel scrolling for the editor tab strip: a vertical wheel pans the open tabs left and right, so a full strip no longer hides tabs at the edges.",
      "The active tab scrolls back into view when you switch tabs, and the strip's scrollbar is hidden.",
    ],
  },
  {
    version: "0.5.0",
    date: "September 21, 2026",
    dateTime: "2026-09-21",
    summary: "An animated cursor, a standalone settings window, and image paste that hosts itself.",
    changes: [
      "Added a Zed-style animated cursor: the caret glides between positions with a damped spring and a subtle four-corner deformation. Toggle it in Settings → Editor.",
      "Settings now open in a standalone, searchable window with a category rail — General, Appearance, Editor, Image, Vault, Shortcuts, and Updates.",
      "Added custom image upload: a pasted image lands in your vault first, then your uploader (for example PicGo) swaps in the hosted URL, falling back to the local copy on failure.",
      "Click an image to edit its Markdown alt text and URL inline, Typora-style, with a source bar beneath it.",
      "Added a serif reading font for the note body.",
      "Fixed image paste in the macOS webview by reading the clipboard's items instead of only its files.",
      "Removed the pointer cursor trail that interfered with text selection.",
    ],
  },
  {
    version: "0.4.0",
    date: "August 29, 2026",
    dateTime: "2026-08-29",
    summary: "Cursor motion with spring physics and playful trails for short edits.",
    changes: [
      "Added a smooth editor cursor trail that follows the pointer with spring physics, honoring reduced-motion settings.",
      "Short insertions and deletions animate as they land, and the caret gains a tapered line look.",
    ],
  },
  {
    version: "0.3.0",
    date: "August 29, 2026",
    dateTime: "2026-08-29",
    summary: "Code blocks move to Shiki, with dual light and dark highlighting.",
    changes: [
      "Migrated fenced code blocks to Shiki with dual light/dark themes and syntax highlighting for 20 programming languages.",
      "Refined code-block and Mermaid surfaces so they blend more naturally with the editor in both color modes.",
      "Kept AssistantPi status visible above the composer, added compact Thinking Orbs for ready, connecting, and working states, and removed decorative gray icon circles.",
      "Enlarged the settings dialog for more comfortable configuration.",
    ],
  },
  {
    version: "0.2.0",
    date: "August 28, 2026",
    dateTime: "2026-08-28",
    summary: "Math, diagrams, and an assistant that can search the web and run commands.",
    changes: [
      "Added LaTeX math rendering: inline $…$ and block $$…$$ formulas via KaTeX, with click-to-edit LaTeX source.",
      "Added Mermaid diagram rendering in fenced code blocks, themed for light and dark.",
      "AssistantPi now ships read, grep, find, and ls tools over your vault, plus a host shell (permission-gated), web search, and web fetch.",
      "Added thinking-orb activity animations that mirror what AssistantPi is doing, and a dismissible current-note attachment.",
      "A file watcher now refreshes the sidebar in real time when notes change outside the app.",
      "Closed a gap where ask-to-edit mode could run shell commands without approval, and capped pasted images at 20 MB.",
      "Resolved Rust dependency security advisories, including the Tauri IPC origin-confusion fix (2.11.5).",
    ],
  },
  {
    version: "0.1.12",
    date: "August 1, 2026",
    dateTime: "2026-08-01",
    summary: "AssistantPi now brings its own runtime and connects to the models you choose.",
    changes: [
      "Rebuilt AssistantPi around a bundled Pi sidecar, removing the separate command-line installation requirement.",
      "Loaded providers and models dynamically from Pi, including OpenAI, Anthropic, DeepSeek, Kimi, Z.AI, GitHub Copilot, and local or custom endpoints.",
      "Added API key, OAuth, IAM, service-account, environment, and local authentication flows where supported by each provider.",
      "Added multiple named model connections with secure credential storage and explicit approval before AssistantPi edits your workspace.",
      "Added close-left and close-right tab actions, and fixed hyperlink formatting so text typed after a link remains plain.",
    ],
  },
  {
    version: "0.1.11",
    date: "July 26, 2026",
    dateTime: "2026-07-26",
    summary: "Faster note switching and a direct path back to Finder.",
    changes: [
      "Added Show in Finder to the context menu for notes and folders.",
      "Kept open editors laid out in memory so switching notes avoids rebuilding the document view.",
      "Removed redundant Linkify initialization and fixed title resize feedback loops.",
      "Limited disk refreshes to window-focus and AssistantPi change events instead of every tab switch.",
    ],
  },
  {
    version: "0.1.10",
    date: "July 16, 2026",
    dateTime: "2026-07-16",
    summary: "Todos and bookmarks are now useful without leaving your note.",
    changes: [
      "Added expandable Todo and Bookmark previews directly in the sidebar.",
      "Complete or reopen todos from the preview without leaving the current note.",
      "Bookmark indicators follow their first assigned tag color, and links open directly in your browser.",
      "Settings now shows the installed Ornata version in the update section.",
    ],
  },
  {
    version: "0.1.9",
    date: "July 15, 2026",
    dateTime: "2026-07-15",
    summary: "A faster way to move through long notes without leaving the editor.",
    changes: [
      "Added a magnetic article outline built from H1–H3 headings.",
      "The outline follows the active section and expands around the heading you point to.",
      "Click any section for a smooth jump; subtle interaction sounds can be disabled in Settings.",
    ],
  },
  {
    version: "0.1.8",
    date: "July 15, 2026",
    dateTime: "2026-07-15",
    summary: "AssistantPi now starts with the note you are already working in.",
    changes: [
      "The open note is attached to AssistantPi automatically as working context.",
      "Fixed Pi startup in production builds by resolving the user’s installed Node environment.",
      "Updated the editor empty state to use the current Ornata icon.",
    ],
  },
  {
    version: "0.1.7",
    date: "July 15, 2026",
    dateTime: "2026-07-15",
    summary: "AssistantPi arrives with explicit permissions and your choice of model.",
    changes: [
      "Connected Ornata to Pi installed and configured on your Mac.",
      "Added Read only, Read & write, and Full Access permission modes.",
      "Selected note text can be attached to a request, and responses render as Markdown.",
      "Introduced the lightweight, hand-drawn Ornata app icon.",
    ],
  },
  {
    version: "0.1.6",
    date: "July 14, 2026",
    dateTime: "2026-07-14",
    summary: "Ornata now speaks English and Simplified Chinese.",
    changes: [
      "Added complete English and Simplified Chinese interface localization.",
      "Added language switching directly in Settings.",
      "Refreshed the app with a lighter visual identity.",
    ],
  },
  {
    version: "0.1.5",
    date: "July 14, 2026",
    dateTime: "2026-07-14",
    summary: "The first fully signed, notarized, and privately distributed build.",
    changes: [
      "Moved signed application and update distribution to Cloudflare R2.",
      "Added Apple Developer ID signing, notarization, and secure in-app update signatures.",
      "Added external Markdown file editing and language-aware code block highlighting.",
      "Completed the product transition to Ornata.",
    ],
  },
  {
    version: "0.1.4",
    date: "July 12, 2026",
    dateTime: "2026-07-12",
    summary: "More control over Markdown and more reliable file operations.",
    changes: [
      "Added Markdown source editing and code block copy actions.",
      "Improved nested note moves and keyboard accessibility.",
      "Hardened app configuration and updater permissions.",
    ],
  },
  {
    version: "0.1.3",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "A smoother first run for a brand-new notes folder.",
    changes: [
      "Added a create-new-vault flow to the welcome screen.",
      "New notes now open directly in the editor.",
      "Improved toast readability in dark mode.",
    ],
  },
  {
    version: "0.1.2",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "Updates can now arrive without reinstalling the app manually.",
    changes: [
      "Added automatic update checks on launch.",
      "Added an update-available action and manual checks in Settings.",
    ],
  },
  {
    version: "0.1.1",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "Polish for setup, navigation, and recovery.",
    changes: [
      "Added a starter welcome note for new vaults.",
      "Added reveal-vault and Settings actions to the command palette.",
      "Added crash recovery alongside sidebar search, theme controls, and Settings refinements.",
    ],
  },
  {
    version: "0.1.0",
    date: "July 9, 2026",
    dateTime: "2026-07-09",
    summary: "The first public release of Ornata’s local-first Markdown workspace.",
    changes: [
      "Plain Markdown notes stored in a folder you own, with real folders and multiple tabs.",
      "Internal page links, preserved frontmatter properties, search, todos, and bookmarks.",
      "Per-vault session persistence for open tabs, active views, and tag filters.",
    ],
  },
];

const LATEST = RELEASES[0];
const UPDATES_DESCRIPTION = `Release notes for Ornata on macOS. Version ${LATEST.version}: ${LATEST.summary}`;

export const metadata: Metadata = {
  title: "Updates",
  description: UPDATES_DESCRIPTION,
  alternates: { canonical: "/updates" },
  openGraph: {
    title: "Updates — Ornata",
    description: UPDATES_DESCRIPTION,
    url: "https://ornata.app/updates",
  },
  twitter: {
    card: "summary_large_image",
    title: "Updates — Ornata",
    description: UPDATES_DESCRIPTION,
  },
};

export default function UpdatesPage() {
  return (
    <>
      <Nav />
      <main className="px-3 pb-3 pt-24 sm:px-6 sm:pb-6 sm:pt-28">
        <div className="mx-auto w-full max-w-[1440px] border-x border-t border-border bg-paper">
          <header className="grid border-b border-border lg:grid-cols-[220px_minmax(0,1fr)]">
            <aside className="hidden border-r border-border px-8 py-16 lg:block">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
                Release archive
              </p>
            </aside>
            <div className="px-5 py-16 sm:px-10 sm:py-20 lg:px-16 lg:py-24">
              <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-faint">
                Product updates
              </p>
              <div className="mt-6 flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
                <div className="max-w-2xl">
                  <h1 className="text-balance font-serif text-[48px] leading-[0.96] tracking-[-0.04em] text-foreground sm:text-[72px]">
                    What&apos;s new in Ornata.
                  </h1>
                  <p className="mt-6 max-w-xl text-pretty text-[15px] leading-7 text-muted-foreground">
                    Version {LATEST.version} ({LATEST.date}): {LATEST.summary}{" "}
                    Earlier releases are listed below.
                  </p>
                </div>
                <DownloadButton label="Download latest" size="md" />
              </div>
            </div>
          </header>

          <div className="grid lg:grid-cols-[220px_minmax(0,1fr)]">
            <div className="hidden border-r border-border lg:block" />
            <section
              aria-label="Ornata release history"
              className="px-5 sm:px-10 lg:px-16"
            >
              {RELEASES.map((release, index) => (
                <article
                  key={release.version}
                  className="grid gap-6 border-b border-border py-10 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-10 sm:py-14"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-mono text-[12px] font-medium text-foreground">
                        v{release.version}
                      </p>
                      {index === 0 ? (
                        <span className="rounded-full bg-primary px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.08em] text-primary-foreground">
                          Latest
                        </span>
                      ) : null}
                    </div>
                    <time
                      dateTime={release.dateTime}
                      className="mt-2 block font-mono text-[10px] uppercase tracking-[0.08em] text-faint"
                    >
                      {release.date}
                    </time>
                  </div>

                  <div className="min-w-0">
                    <h2 className="text-balance text-[21px] font-medium leading-7 tracking-[-0.015em] text-foreground sm:text-[24px]">
                      {release.summary}
                    </h2>
                    <ul className="mt-6 space-y-3">
                      {release.changes.map((change) => (
                        <li
                          key={change}
                          className="flex items-start gap-3 text-pretty text-[14px] leading-6 text-muted-foreground"
                        >
                          <span
                            aria-hidden="true"
                            className="mt-[10px] size-1 shrink-0 rounded-full bg-faint"
                          />
                          <span>{change}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              ))}
            </section>
          </div>
        </div>
      </main>
      <Footer />
      <DownloadModal />
    </>
  );
}
