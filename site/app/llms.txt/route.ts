import { DMG, VERSION } from "@/lib/config";

// llms.txt — a plain index for AI crawlers and answer engines.
// Spec: https://llmstxt.org
export const dynamic = "force-static";

export function GET() {
  const body = `# Ornata

> Ornata is a free, local-first Markdown notes app for macOS. Notes are plain .md files in a folder you own — no account, no proprietary database — with an optional local AI assistant (AssistantPi) that only acts with your permission.

Ornata is built on the principle that notes should outlive the app: plain Markdown files, real folders, and frontmatter preserved verbatim. The vault can be opened in Finder, edited in any text editor, and shared with tools like Obsidian and git.

## Pages

- [Home](https://ornata.app): Product overview, feature walkthroughs, and FAQ
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
- Extras: LaTeX math (KaTeX), Mermaid diagrams, full-text search, todos, bookmarks
- Updates: signed update feed; Developer ID signed and notarized builds
- Languages: English, Simplified Chinese
- License: MIT
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
