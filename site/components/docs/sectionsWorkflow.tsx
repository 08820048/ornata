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
    title: "Daily notes, tasks, templates",
    lead: "Write it down, then come back to it.",
    body: (
      <>
        <Ul>
          <Li>
            <Kbd>⌘J</Kbd> opens today&apos;s note, <Code>journal/2026-10-18.md</Code> for example, creating it if needed. To
            start each day from a template, save one named <Code>daily</Code> (see below).
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
    id: "projects",
    title: "Projects and issues",
    lead: "The tasks in your notes, on a board.",
    body: (
      <>
        <Ul>
          <Li>
            <strong className="font-medium text-foreground">Make a project:</strong> right-click a folder and choose
            Set as project. Its notes&apos; task lines become issues; nothing is stored anywhere but your Markdown. Switch
            the sidebar between <em>Notes</em> and <em>Projects</em> at the top, and open the Projects tab for the list or
            the board.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Statuses:</strong> <Code>[ ]</Code> todo, <Code>[/]</Code> in
            progress, <Code>[x]</Code> done, <Code>[-]</Code> canceled. Type <Code>[/]</Code> or <Code>[-]</Code> and a
            space at the start of a line, or use the slash menu.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Details on the line:</strong> <Code>#tag</Code>,{" "}
            <Code>!urgent</Code> / <Code>!high</Code> / <Code>!medium</Code> / <Code>!low</Code>, <Code>@2026-11-10</Code>.
            Ornata also stamps when a task was created, finished or canceled. Indented bullets under a task are its notes.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">The board:</strong> drag a card to change its status, click a
            status to cycle it, right-click a card or row for any status or priority, and use + on a column to add a task
            straight into it (it goes into the project&apos;s <Code>Tasks.md</Code>).
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Capture:</strong> select text in any note and choose Create
            issue, or right-click an issue and choose Turn into issue page to give it its own note in the
            project&apos;s <Code>issues/</Code> folder.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Agents:</strong> with read &amp; write access, an agent can list
            projects and issues, ask for the next issue, claim one, change status or priority, add decision notes and add
            issues. A claimed issue shows the agent&apos;s own logo; when the agent marks it done, the card keeps a badge
            saying who finished it.
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
            Finder (File Explorer on Windows) takes you to the file.
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
    id: "agents",
    title: "Other agents: MCP and the command line",
    lead: "Let Claude Code, Codex, Cursor, or a script work on your notes.",
    body: (
      <>
        <P>
          Ornata speaks <strong className="font-medium text-foreground">MCP</strong>, the open standard AI agents use to
          reach tools. An agent can search and read your notes, see backlinks and open tasks, and — only if you allow it
          — create, edit, append, tick tasks, work project issues, rename, move, and delete.
        </P>
        <H3>Connect an agent</H3>
        <Ul>
          <Li>
            Click the plug in the status bar (or <Kbd>⌘K</Kbd> → MCP settings). It is green while the server is on or an
            agent is connected.
          </Li>
          <Li>
            Press <strong className="font-medium text-foreground">Connect</strong> to start the server on your computer. Pick
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
            ["Read & write", "Also create, update, and append to notes, add to daily notes, tick tasks, claim and update project issues. Every edit keeps the old text in the note's history."],
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
ornata help`}</Pre>
      </>
    ),
  },
];
