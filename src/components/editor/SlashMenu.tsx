import type { Editor } from "@tiptap/react";
import type { Icon as TablerIcon } from "@tabler/icons-react";
import {
  IconBlockquote,
  IconCalendar,
  IconChecklist,
  IconCircleX,
  IconCode,
  IconH1,
  IconH2,
  IconH3,
  IconLink,
  IconList,
  IconListNumbers,
  IconMinus,
  IconPilcrow,
  IconProgress,
  IconTable,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addDays, dailyRel, dateStamp, DATE_MENTIONS } from "@/lib/dateLinks";
import { CODE_BLOCK_VARIANTS } from "@/lib/syntaxHighlighter";
import { relToHref } from "@/lib/noteLinks";
import { cx } from "@/lib/utils";
import { setTaskStatus } from "./taskStatus";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/stores/locale";

export interface SlashMenuState {
  /** `/` = block commands, `@` = date mentions. */
  trigger: "/" | "@";
  query: string;
  range: { from: number; to: number };
  position: { left: number; top: number };
  side: "top" | "bottom";
}

interface SlashCommand {
  id: string;
  /** Translated name; `text` overrides it for generated entries. */
  label: MessageKey;
  text?: (t: (key: MessageKey) => string) => string;
  icon: TablerIcon;
  keywords: string;
  /** What typing at a line's start does the same thing, e.g. `#`. */
  shortcut?: string;
  /** Only offered once the user has typed a search (keeps the bare menu short). */
  searchOnly?: boolean;
  /** Edit to run on select. Omitted for special commands (e.g. note link). */
  run?: (editor: Editor) => void;
  /** Faint trailing text, e.g. the resolved date. */
  hint?: () => string;
}

/** `@today` & co: a standard Markdown link to that day's daily note. */
function insertDateLink(editor: Editor, date: Date) {
  editor
    .chain()
    .focus()
    .insertContent({
      type: "text",
      text: dateStamp(date),
      marks: [{ type: "link", attrs: { href: relToHref(dailyRel(date)) } }],
    })
    .insertContent(" ")
    .run();
}

const dateCommands: SlashCommand[] = DATE_MENTIONS.map((mention) => ({
  id: `date-${mention.id}`,
  label: `slash.${mention.id}` as const,
  icon: IconCalendar,
  keywords: mention.keywords,
  hint: () => dateStamp(addDays(new Date(), mention.offset)),
  run: (editor: Editor) => insertDateLink(editor, addDays(new Date(), mention.offset)),
}));

/** "Code block", then one entry per language: `/code`, `/lua`, `/py`… */
const codeCommands: SlashCommand[] = CODE_BLOCK_VARIANTS.map((variant) => ({
  id: variant.language ? `code-${variant.language}` : "code",
  label: "slash.code" as const,
  text: (t) => (variant.name ? `${t("slash.code")}: ${variant.name}` : t("slash.code")),
  icon: IconCode,
  keywords: `code snippet pre fence ${variant.language ?? ""} ${variant.name}`,
  shortcut: variant.language ? undefined : "```",
  searchOnly: Boolean(variant.language),
  run: (e: Editor) =>
    e
      .chain()
      .focus()
      .setCodeBlock(variant.language ? { language: variant.language } : undefined)
      .run(),
}));

/** The commands whose name or keywords match `query`; entries marked
 *  `searchOnly` stay out of the bare menu. */
export function filterSlashCommands(
  list: SlashCommand[],
  query: string,
  t: (key: MessageKey) => string,
): SlashCommand[] {
  const needle = query.toLowerCase().trim();
  if (!needle) return list.filter((c) => !c.searchOnly);
  return list.filter((c) =>
    `${c.text ? c.text(t) : t(c.label)} ${c.keywords}`.toLowerCase().includes(needle),
  );
}

const commands: SlashCommand[] = [
  {
    id: "note-link",
    label: "slash.noteLink",
    icon: IconLink,
    keywords: "page link reference mention connect",
  },
  {
    id: "text",
    label: "slash.text",
    icon: IconPilcrow,
    keywords: "paragraph plain",
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "slash.h1",
    icon: IconH1,
    keywords: "title big",
    shortcut: "#",
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "slash.h2",
    icon: IconH2,
    keywords: "subtitle section",
    shortcut: "##",
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "slash.h3",
    icon: IconH3,
    keywords: "subheading",
    shortcut: "###",
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "slash.bullet",
    icon: IconList,
    keywords: "unordered ul",
    shortcut: "-",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbered",
    label: "slash.numbered",
    icon: IconListNumbers,
    keywords: "ordered ol",
    shortcut: "1.",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "slash.task",
    icon: IconChecklist,
    keywords: "todo checkbox check",
    shortcut: "*",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "task-doing",
    label: "slash.taskDoing",
    icon: IconProgress,
    keywords: "in progress doing started wip task",
    shortcut: "[/]",
    run: (e) => setTaskStatus(e, "doing"),
  },
  {
    id: "task-canceled",
    label: "slash.taskCanceled",
    icon: IconCircleX,
    keywords: "canceled cancelled dropped abandoned task",
    shortcut: "[-]",
    run: (e) => setTaskStatus(e, "canceled"),
  },
  {
    id: "quote",
    label: "slash.quote",
    icon: IconBlockquote,
    keywords: "blockquote",
    shortcut: ">",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  ...codeCommands,
  {
    id: "divider",
    label: "slash.divider",
    icon: IconMinus,
    keywords: "rule hr line separator",
    shortcut: "---",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "table",
    label: "slash.table",
    icon: IconTable,
    keywords: "grid rows columns",
    run: (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

export { commands as blockCommands };

export function SlashMenu({
  editor,
  menu,
  onClose,
  onLinkToNote,
  allowNoteLinks = true,
}: {
  editor: Editor | null;
  menu: SlashMenuState | null;
  onClose: () => void;
  onLinkToNote: (range: { from: number; to: number }) => void;
  allowNoteLinks?: boolean;
}) {
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const keyboardNav = useRef(false);
  const t = useT();

  const filtered = useMemo(() => {
    const base = menu?.trigger === "@" ? dateCommands : commands;
    const available = allowNoteLinks
      ? base
      : base.filter((command) => command.id !== "note-link");
    return filterSlashCommands(available, menu?.query ?? "", t);
  }, [allowNoteLinks, menu?.query, menu?.trigger, t]);

  useEffect(() => {
    keyboardNav.current = false;
    setSelected(0);
  }, [menu?.query]);

  useEffect(() => {
    if (!keyboardNav.current) return;
    listRef.current
      ?.querySelector('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  useEffect(() => {
    if (!menu || !editor || filtered.length === 0) return;
    const execute = (command: SlashCommand) => {
      // The note-link command hands off to the picker, which owns deleting
      // the "/…" range and inserting the link.
      if (command.id === "note-link") {
        onLinkToNote(menu.range);
        onClose();
        return;
      }
      editor.chain().focus().deleteRange(menu.range).run();
      command.run?.(editor);
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        keyboardNav.current = true;
        setSelected((i) => (i + 1) % filtered.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        keyboardNav.current = true;
        setSelected((i) => (i - 1 + filtered.length) % filtered.length);
      } else if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const command = filtered[selected];
        if (command) execute(command);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [editor, filtered, menu, onClose, onLinkToNote, selected]);

  if (!menu || !editor || filtered.length === 0) return null;

  return (
    <motion.div
      ref={listRef}
      initial={{ opacity: 0, y: menu.side === "bottom" ? -4 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="fixed z-90 max-h-[280px] w-[340px] overflow-y-auto rounded-md border border-line bg-menu p-1 shadow-lg shadow-black/8 dark:shadow-black/40"
      style={{ left: menu.position.left, top: menu.position.top }}
    >
      {filtered.map((command, index) => (
        <button
          key={command.id}
          type="button"
          data-selected={index === selected}
          className={cx(
            "flex w-full items-center gap-2.5 rounded px-2 py-1.5 text-left text-[13px] transition-colors duration-75",
            index === selected ? "bg-hover text-ink" : "text-muted",
          )}
          onMouseDown={(event) => {
            event.preventDefault();
            if (command.id === "note-link") {
              onLinkToNote(menu.range);
              onClose();
              return;
            }
            editor.chain().focus().deleteRange(menu.range).run();
            command.run?.(editor);
            onClose();
          }}
          onMouseEnter={() => {
            keyboardNav.current = false;
            setSelected(index);
          }}
        >
          <command.icon size={14.5} stroke={1.75} className="shrink-0" />
          <span className="min-w-0 truncate">{command.text ? command.text(t) : t(command.label)}</span>
          {command.shortcut && (
            <span className="ml-auto pl-2 font-mono text-[10.5px] text-faint">{command.shortcut}</span>
          )}
          {command.hint && (
            <span className="ml-auto pl-2 font-mono text-[10.5px] text-faint tabular-nums">
              {command.hint()}
            </span>
          )}
        </button>
      ))}
    </motion.div>
  );
}
