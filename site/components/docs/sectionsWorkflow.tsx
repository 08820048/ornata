import { Code, H3, Kbd, Li, Note, P, Pre, Table, Ul, type DocSection } from "./Prose";

export const WORKFLOW: DocSection[] = [
  {
    id: "panes",
    title: "Tabs and split view",
    lead: "Keep several notes open, or read two side by side.",
    body: (
      <>
        <P>
          Every open note is a tab. <Kbd>⌘W</Kbd> closes the current one; a tab&apos;s menu has bulk close options. Your
          open tabs come back when you restart.
        </P>
        <H3>Split view</H3>
        <Ul>
          <Li>
            Open a note <strong className="font-medium text-foreground">to the side</strong> from the command palette
            with <Kbd>⌘↵</Kbd>, from a tab&apos;s or a file&apos;s menu, or by <Kbd>⌘</Kbd>-clicking a link. You can have
            up to four panes, depending on the window width.
          </Li>
          <Li>
            Each pane has its own header — its own back and forward arrows, breadcrumb, and actions. The pane menu
            (the columns icon) splits, swaps with the next pane, and lists the open panes.
          </Li>
          <Li>
            Drag a divider to resize. Adding or closing a pane shares the width evenly again.
          </Li>
          <Li>
            <Kbd>⌘1</Kbd>–<Kbd>⌘4</Kbd> jump to a pane, <Kbd>⌘.</Kbd> moves to the next, and <Kbd>⌘⇧\</Kbd> splits the
            current one.
          </Li>
          <Li>
            The layout, the widths, and each pane&apos;s trail come back after a restart.
          </Li>
        </Ul>
        <H3>Back and forward</H3>
        <P>
          <Kbd>⌘[</Kbd> and <Kbd>⌘]</Kbd> step back and forward through the notes a pane has shown. Each pane keeps its
          own trail, so the arrows only move the pane they sit in, and a step that would land on a note already open in
          another pane skips past it.
        </P>
      </>
    ),
  },
  {
    id: "find",
    title: "Finding things",
    lead: "Search, jump, and keep favourites close.",
    body: (
      <>
        <Ul>
          <Li>
            <Kbd>⌘K</Kbd> searches titles and content together. Title matches come first, and titles match from
            shorthand: <Code>prjroad</Code> finds &ldquo;project roadmap&rdquo;. Choosing a content match scrolls to it. With no
            search typed, the palette lists your recent notes and every action.
          </Li>
          <Li>
            The sidebar can be sorted by name or by modified time (the button on the Notes header). Pin a note from its
            context menu to keep it at the top.
          </Li>
          <Li>
            The bar along the bottom shows the shortcuts that matter for what you are looking at. Hide it from the
            palette (Show or hide shortcut bar).
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "daily",
    title: "Daily notes, Inbox, tasks, templates",
    lead: "Capture quickly, then come back to it.",
    body: (
      <>
        <Ul>
          <Li>
            <Kbd>⌘J</Kbd> opens today&apos;s note, <Code>journal/2026-10-18.md</Code> for example, creating it if needed. To
            start each day from a template, save one named <Code>daily</Code> (see below).
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Quick capture:</strong> <Kbd>⌘⌥J</Kbd> works from any app.
            A small box appears; type a line and press Return. It is added to <Code>Inbox.md</Code> with the time.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Tasks:</strong> any <Code>- [ ]</Code> line (or{" "}
            <Code>*</Code> and a space) is a task. The Tasks row in the sidebar lists every open task in the vault,
            grouped by note; tick one there and it is done in its note.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Templates:</strong> from the palette, save a note as a
            template, start a new note from one, or open the templates folder (<Code>.ornata/templates</Code>).
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "history",
    title: "History and clean-up",
    lead: "Undo further back than ⌘Z.",
    body: (
      <>
        <Ul>
          <Li>
            Ornata keeps snapshots of each note as it changes. The clock at the bottom right opens the note&apos;s
            history: pick a snapshot to compare it with the current text, and restore it if you want it back.
          </Li>
          <Li>
            Over time pasted images can end up unused. <Kbd>⌘K</Kbd> → Clean up images lists the ones no note refers to
            and moves them to the Trash, where you can still get them back.
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "export",
    title: "Exporting",
    lead: "Your notes are already Markdown. For everything else:",
    body: (
      <>
        <P>The ··· menu at the top right of a note has:</P>
        <Ul>
          <Li>
            <strong className="font-medium text-foreground">PDF</strong> — with a bookmark outline built from the
            headings. Choose the paper size (A4, Letter, A5) and margins in Settings → Export. When it is done, Show in
            Finder takes you to the file.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">HTML</strong> — a standalone page.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Markdown</strong>, <strong className="font-medium text-foreground">Copy as rich text</strong>, and{" "}
            <strong className="font-medium text-foreground">Copy Markdown</strong>.
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "assistant",
    title: "AssistantPi",
    lead: "An assistant that waits to be asked.",
    body: (
      <>
        <P>
          AssistantPi connects to Pi, an agent runtime you install and configure on your Mac, and uses the model and
          provider you set up there. Open it with the AssistantPi button at the bottom right.
        </P>
        <Ul>
          <Li>
            It starts <strong className="font-medium text-foreground">read only</strong>. Choose a mode before sending:
            Read only (read, search, browse the web), Ask to edit (every change and shell command waits for your
            approval, with the command or a before-and-after diff shown), or Auto.
          </Li>
          <Li>
            The open note is attached automatically, and selected text can be included. Type <Code>@</Code> to attach
            other notes, or include the notes the current one links to and from.
          </Li>
          <Li>
            With a note attached and an empty box, Summarize, Suggest links, and Extract tasks are one tap away; the
            last two only propose changes.
          </Li>
          <Li>
            Each reply lists the notes it edited, each with an Undo. Undo refuses if you changed the note since, and
            points you at the note&apos;s history instead.
          </Li>
          <Li>Conversations are kept per vault; start a new chat or reopen an earlier one from the panel.</Li>
        </Ul>
        <Note>
          If the model you configured in Pi is remote, your prompt and the attached notes are sent to that provider
          under its terms. AssistantPi itself keeps nothing outside your Mac.
        </Note>
      </>
    ),
  },
  {
    id: "agents",
    title: "Other agents: MCP and the command line",
    lead: "Let Claude Code, Codex, Cursor, or a script work on your notes.",
    body: (
      <>
        <P>
          Ornata speaks <strong className="font-medium text-foreground">MCP</strong>, the open standard AI agents use to
          reach tools. An agent can search and read your notes, see backlinks and open tasks, and — only if you allow it
          — create, edit, append, tick tasks, rename, move, and delete.
        </P>
        <H3>Connect an agent</H3>
        <Ul>
          <Li>
            Click the plug in the status bar (or <Kbd>⌘K</Kbd> → MCP settings). It is green while the server is on or an
            agent is connected.
          </Li>
          <Li>
            Press <strong className="font-medium text-foreground">Connect</strong> to start the server on your Mac. Pick
            your agent&apos;s tab and copy its line, for example:
            <Pre>{`claude mcp add ornata --transport http http://127.0.0.1:13200/mcp \\
  --header "Authorization: Bearer <your token>"`}</Pre>
          </Li>
          <Li>
            Claude Code, Gemini CLI, Cursor, and VS Code connect to the server, so Ornata must be open. Codex and
            Claude Desktop start Ornata themselves over stdio, which works with Ornata closed. Any other MCP client can
            use the URL and the header on the <em>Other</em> tab.
          </Li>
        </Ul>
        <H3>What an agent may do</H3>
        <P>You choose, per vault, in MCP Settings (or Settings → Agents):</P>
        <Table
          head={["Level", "Agents can"]}
          rows={[
            ["Off", "Nothing."],
            ["Read only (default)", "List, read, and search notes; see backlinks, open tasks, and daily notes."],
            ["Read & write", "Also create, update, and append to notes, add to daily notes and Inbox, tick tasks. Every edit keeps the old text in the note's history."],
            ["Full access", "Also rename, move, and delete. Deleted notes go to the Trash."],
          ]}
        />
        <P>
          The level is set in Ornata only, and an agent&apos;s own launch options can only lower it. Agents see only notes
          that really live in the vault — a symlink pointing elsewhere is ignored. Every request to the local server
          carries an access token; <em>Regenerate</em> makes a new one if it ever leaks (agents set up with the old one then
          need the new line).
        </P>
        <Note>
          An agent that can also run shell commands can edit any file you can, including Ornata&apos;s settings. The
          access level is a boundary for agents that work through these tools — give shell-capable agents only the trust
          you would give a person at your keyboard.
        </Note>
        <H3>The command line</H3>
        <P>
          Install the <Code>ornata</Code> command from the MCP panel (it links to <Code>~/.local/bin</Code>). The same
          levels apply.
        </P>
        <Pre>{`ornata search "roadmap"
ornata read projects/roadmap.md
ornata tasks
echo "ship it" | ornata journal add     # append to today's note
ornata capture "buy milk"                # a timestamped line in Inbox.md
ornata help`}</Pre>
      </>
    ),
  },
];
