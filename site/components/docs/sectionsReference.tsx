import { Code, H3, Kbd, Li, P, Table, Ul, type DocSection } from "./Prose";

const SHORTCUTS: Array<[string, string]> = [
  ["⌘K", "Command palette: search notes, run any action"],
  ["⌘N", "New note"],
  ["⌘J", "Today's note"],
  ["⌘O", "Open a Markdown file from anywhere"],
  ["⌘W", "Close the current tab"],
  ["⌘F  /  ⌘⌥F", "Find in the note  /  find and replace"],
  ["⌘\\", "Show or hide the sidebar"],
  ["⌘,", "Settings"],
  ["⌘⇧D", "Cycle the theme: system, light, dark"],
  ["⌘⇧F", "Focus mode"],
  ["⌘[  /  ⌘]", "Back  /  forward in the current pane"],
  ["⌘⇧\\", "Split the current pane"],
  ["⌘1 – ⌘4", "Jump to a pane"],
  ["⌘.", "Next pane"],
  ["⌘↵", "In the palette: open the result to the side"],
  ["⌘-click", "On a note link: open it to the side"],
  ["⌥↑  /  ⌥↓", "Move the block or list item up or down"],
  ["⌘⌥J", "Quick capture to Inbox, from any app"],
];

export const REFERENCE: DocSection[] = [
  {
    id: "shortcuts",
    title: "Keyboard shortcuts",
    lead: "Everything you can do from the keyboard.",
    body: (
      <>
        <Table head={["Keys", "Does"]} rows={SHORTCUTS.map(([keys, does]) => [<Kbd key={keys}>{keys}</Kbd>, does])} />
        <P>The same list is in Settings → Shortcuts. On Windows, ⌘ is Ctrl and ⌥ is Alt.</P>
      </>
    ),
  },
  {
    id: "themes",
    title: "Themes",
    lead: "A colour scheme for light mode and another for dark mode.",
    body: (
      <>
        <P>
          Choose a theme for each mode in Settings → Appearance, or click the palette icon in the status bar: switch
          between Auto, Light and Dark there, and pick the theme for the mode in use without opening Settings. Auto
          follows the system and uses your light theme by day and your dark theme at night.
        </P>
        <Ul>
          <Li><strong className="font-medium text-foreground">Light</strong> — Default, Paper, and Paper Textured.</Li>
          <Li><strong className="font-medium text-foreground">Dark</strong> — Default, Basalt Bedrock, Tokyo Techno, Early Ember, and Neon Noir.</Li>
        </Ul>
        <P>
          Paper swaps hairlines for hand-drawn rules and the caret for a soft block over the next character; Paper
          Textured adds a paper grain on top. Basalt Bedrock and Neon Noir use the block caret too. Each theme has its own
          link and caret colour, and ⌘⇧D still flips between light and dark. PDF and HTML exports always use the neutral
          colours, whatever theme you write in.
        </P>
      </>
    ),
  },
  {
    id: "settings",
    title: "Settings",
    lead: "Open with ⌘, — search the settings if you can't find one.",
    body: (
      <Ul>
        <Li><strong className="font-medium text-foreground">General</strong> — interface language (English or 简体中文), and which vault folder is open.</Li>
        <Li><strong className="font-medium text-foreground">Appearance</strong> — light, dark, or follow the system, and a theme for each of light and dark.</Li>
        <Li><strong className="font-medium text-foreground">Editor</strong> — the outline sound, the animated cursor, and image upload: keep pasted images in the vault, or run your own upload command.</Li>
        <Li><strong className="font-medium text-foreground">Export</strong> — PDF paper size and margins.</Li>
        <Li><strong className="font-medium text-foreground">Agents (MCP)</strong> — what outside agents may do, and how to connect them.</Li>
        <Li><strong className="font-medium text-foreground">Shortcuts</strong> and <strong className="font-medium text-foreground">About</strong> — the key list, and checking for a new version. Ornata updates itself from a signed feed; when one is ready, the status bar shows it beside the cursor position, and one click downloads it, then Restart to update.</Li>
      </Ul>
    ),
  },
  {
    id: "help",
    title: "Troubleshooting",
    lead: "When something doesn't look right.",
    body: (
      <>
        <H3>An edit made elsewhere didn&apos;t show up</H3>
        <P>
          Ornata watches the vault and reloads a note when it changes on disk — unless you have unsaved typing in it,
          which always wins. Switch away from the window and back to force a check.
        </P>
        <H3>An agent can&apos;t connect or gets 401</H3>
        <Ul>
          <Li>Check the plug is green: the server must be connected, and the access level must not be Off.</Li>
          <Li>
            A 401 means the token is missing or old. Copy the line from MCP Settings again (remove the old server from
            the agent first) — the token changes whenever you press Regenerate.
          </Li>
          <Li>
            If port 13200 is in use, Ornata takes the next free one; the setup lines always show the port in use.
          </Li>
          <Li>
            An agent says a tool doesn&apos;t exist: the access level is too low for it. Raise it in MCP Settings; it
            applies on the next call.
          </Li>
        </Ul>
        <H3>A link is gray and dashed</H3>
        <P>
          Its target note doesn&apos;t exist. Click it to create the note, or fix the link. Renaming a note from inside
          Ornata rewrites links for you; renaming the file in Finder or File Explorer doesn&apos;t.
        </P>
        <H3>Everything seems to be in the wrong place after a restart</H3>
        <P>
          Ornata restores your tabs, split layout, and each pane&apos;s back and forward trail. Notes deleted meanwhile are
          left out. Your notes themselves are never touched by this.
        </P>
        <P>
          Still stuck? The files are plain Markdown in your vault folder, and always yours. See the{" "}
          <a className="text-foreground underline underline-offset-4" href="/#faq">FAQ</a>, or look at what changed in{" "}
          <a className="text-foreground underline underline-offset-4" href="/updates">Updates</a>.
        </P>
        <p className="sr-only">
          <Code>ornata</Code>
        </p>
      </>
    ),
  },
];
