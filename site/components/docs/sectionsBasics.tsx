import { Code, H3, Kbd, Li, P, Pre, Table, Ul, type DocSection } from "./Prose";

export const BASICS: DocSection[] = [
  {
    id: "start",
    title: "Getting started",
    lead: "Install Ornata, pick a folder, and write.",
    body: (
      <>
        <P>
          Ornata runs on macOS 12 or later (Apple Silicon) and on 64-bit Windows 10 or later. On Windows, read ⌘ as Ctrl and ⌥ as Alt in these docs. Download the app from the home page and open it. The
          first time, choose <strong className="font-medium text-foreground">Create new vault</strong> to make a new
          folder for your notes, or <strong className="font-medium text-foreground">Open existing</strong> to use a folder
          of Markdown files you already have — including one from Obsidian.
        </P>
        <P>
          Press <Kbd>⌘N</Kbd> for a new note, type its title, and start writing. Everything saves on its own a moment
          after you stop typing; there is no save button.
        </P>
        <P>
          Press <Kbd>⌘K</Kbd> any time to jump to a note or run a command. That one shortcut gets you most places.
        </P>
      </>
    ),
  },
  {
    id: "vault",
    title: "Your vault",
    lead: "Plain Markdown files in real folders that you own.",
    body: (
      <>
        <P>A vault is just a folder:</P>
        <Pre>{`my-vault/
├── notes/       your notes — plain .md files, in real folders
└── .ornata/     app data: pasted images, note history, templates`}</Pre>
        <Ul>
          <Li>
            A note&apos;s <strong className="font-medium text-foreground">file name is its title</strong>. There are no
            IDs. Renaming a note renames the file, and every link that pointed to it is rewritten.
          </Li>
          <Li>
            You can edit the same files in any other editor. Ornata picks up outside changes as they happen, and when
            you switch back to it. If you have unsaved typing in a note, your typing wins.
          </Li>
          <Li>
            Frontmatter from other tools is kept exactly as it is and shown read-only in a Properties panel above the
            note. Ornata never writes frontmatter itself.
          </Li>
          <Li>
            Deleting a note moves it to the Trash. Ornata has no built-in sync; because notes are files, iCloud Drive,
            Dropbox, or git work as they would for any folder.
          </Li>
          <Li>
            Open a Markdown file from anywhere with <Kbd>⌘O</Kbd>. It opens in a tab like any note, without being copied
            into the vault.
          </Li>
          <Li>
            <strong className="font-medium text-foreground">Library</strong> in the sidebar opens a tab that shows your
            folders and notes as cards: a folder card shows the notes you edited last inside it, and a note card is a
            miniature of how the note begins. Click a folder to step into it, use the path at the top to step back
            out, and click a note to open it.
          </Li>
          <Li>Change which vault is open in Settings → General.</Li>
        </Ul>
      </>
    ),
  },
  {
    id: "writing",
    title: "Writing",
    lead: "A Markdown editor that stays out of the way.",
    body: (
      <>
        <H3>Markdown as you type</H3>
        <P>The usual Markdown shortcuts turn into formatting when you type them at the start of a line:</P>
        <Table
          head={["Type", "You get"]}
          rows={[
            [<Code key="1"># </Code>, "Heading 1 (## for 2, ### for 3)"],
            [<Code key="2">- </Code>, "A bullet list"],
            [<Code key="3">1. </Code>, "A numbered list"],
            [<Code key="4">* </Code>, "A to-do with a checkbox (so does - [ ])"],
            [<Code key="5">&gt; </Code>, "A quote"],
            [<Code key="6">---</Code>, "A divider"],
            [<Code key="7">```</Code>, "A code block"],
          ]}
        />
        <H3>The suggestion menu</H3>
        <P>
          Type <Code>/</Code> on any line, or click the <strong className="font-medium text-foreground">+</strong> that
          appears in the margin of an empty line, to open the suggestion menu: headings, lists, quotes, tables,
          dividers, and links to other notes. Keep typing to narrow it. Type <Code>/code</Code> to choose a code block
          by language — there are about thirty, plus Mermaid.
        </P>
        <P>
          Type <Code>@</Code> to insert a link to today&apos;s, tomorrow&apos;s, or yesterday&apos;s{" "}
          <a className="text-foreground underline underline-offset-4" href="#daily">daily note</a>.
        </P>
        <H3>Tables</H3>
        <P>
          Insert a table with <Code>/table</Code>. <Kbd>Tab</Kbd> in the last cell adds a row, and pointing at a
          table shows a <strong className="font-medium text-foreground">+</strong> bar along its bottom and right
          edge to add a row or a column. Right-click a cell to insert a row above or below, a column left or right,
          align the column, or delete the row, the column, or the whole table. Alignment is saved as standard
          Markdown (<Code>:---:</Code>).
        </P>
        <H3>Callouts</H3>
        <P>
          A quote that opens with <Code>[!note]</Code> is shown as a callout with an icon and a label:{" "}
          <Code>&gt; [!note] Title</Code>. The types are <Code>note</Code>, <Code>tip</Code>,{" "}
          <Code>important</Code>, <Code>warning</Code> and <Code>caution</Code>, and Obsidian&apos;s names (
          <Code>info</Code>, <Code>bug</Code>, …) are understood too. Insert one with <Code>/callout</Code>; click
          the label to change its type. The file keeps exactly the Markdown you typed, so GitHub and Obsidian show
          it the same way.
        </P>
        <H3>Footnotes</H3>
        <P>
          Write <Code>[^1]</Code> in the text and <Code>[^1]: the note</Code> on a line of its own. The marker shows
          as a number; point at it to read the note, and <Kbd>⌘</Kbd>-click it to jump to the note (or from the note
          back to the text). <Code>/footnote</Code> inserts both at once. Numbers follow the order of appearance;
          the file keeps the markers you wrote.
        </P>
        <H3>Links and images</H3>
        <Ul>
          <Li>
            Link to another note with <Code>/link</Code>, or type <Code>[[</Code> and a title. Ornata stores it as a
            standard Markdown link, <Code>[Title](folder/note.md)</Code>, so it works in any other app. A link to a
            heading looks like <Code>note.md#heading</Code>.
          </Li>
          <Li>
            A link to a note that doesn&apos;t exist yet is shown gray and dashed; clicking it creates the note.
          </Li>
          <Li>
            Paste or drag an image into a note. It is saved in <Code>.ornata/assets/</Code>. In Settings → Editor you can
            instead run your own upload command, such as PicGo.
          </Li>
        </Ul>
        <H3>Code, math, and diagrams</H3>
        <Ul>
          <Li>
            Code blocks are highlighted and have a copy button. Click the language label to select the block, copy it,
            collapse it, or change the language. Hover a block to fold a function or branch with the arrow in its
            margin; folding only changes what you see, and copying still copies everything.
          </Li>
          <Li>
            Write math with <Code>$x^2$</Code> inline or <Code>$$ ... $$</Code> on its own line (KaTeX).
          </Li>
          <Li>
            A code block whose language is <Code>mermaid</Code> renders as a diagram; click it to see and edit the
            source.
          </Li>
        </Ul>
        <H3>Moving around a note</H3>
        <Ul>
          <Li>
            Each heading has a small arrow on its left that folds its section. Long notes also get an outline on the
            right edge.
          </Li>
          <Li>
            <Kbd>⌥↑</Kbd> and <Kbd>⌥↓</Kbd> move the current block, or the current list item among its siblings. One
            undo puts it back.
          </Li>
          <Li>
            <Kbd>⌘F</Kbd> finds in the note; <Kbd>⌘⌥F</Kbd> adds replace.
          </Li>
          <Li>
            The <Code>{"</>"}</Code> button at the top right switches between the editor and the raw Markdown.
          </Li>
          <Li>
            <Kbd>⌘⇧F</Kbd> is focus mode: the sidebar and the bars fade away until you point at them.
          </Li>
        </Ul>
      </>
    ),
  },
  {
    id: "links",
    title: "Links, tags, and the graph",
    lead: "See how your notes connect.",
    body: (
      <>
        <Ul>
          <Li>
            <strong className="font-medium text-foreground">Linked mentions</strong> at the bottom of a note list the
            notes that link to it, with the linking line as context.{" "}
            <strong className="font-medium text-foreground">Unlinked mentions</strong> show where other notes say its
            title without linking; press Link to turn one into a link.
          </Li>
          <Li>
            Under that, a small <strong className="font-medium text-foreground">local graph</strong> shows the note and
            its neighbours.
          </Li>
          <Li>
            Open the whole vault as a graph from the command palette (<Kbd>⌘K</Kbd> → Link graph). Folders form colored
            regions, hovering a note traces its links and their direction, and you can search to fly to a note.
          </Li>
          <Li>
            Tags are read from <Code>#tag</Code> in a note&apos;s text and from a <Code>tags:</Code> line in its
            frontmatter. The # button in the sidebar lists them with counts.
          </Li>
        </Ul>
      </>
    ),
  },
];

