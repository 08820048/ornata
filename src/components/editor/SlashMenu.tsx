import type { Editor } from "@tiptap/react";
import type { LucideIcon } from "lucide-react";
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Pilcrow,
  Table,
  TextQuote,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { cx } from "@/lib/utils";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/stores/locale";

export interface SlashMenuState {
  query: string;
  range: { from: number; to: number };
  position: { left: number; top: number };
  side: "top" | "bottom";
}

interface SlashCommand {
  id: string;
  label: MessageKey;
  icon: LucideIcon;
  keywords: string;
  /** Edit to run on select. Omitted for special commands (e.g. note link). */
  run?: (editor: Editor) => void;
}

const commands: SlashCommand[] = [
  {
    id: "note-link",
    label: "slash.noteLink",
    icon: Link2,
    keywords: "page link reference mention connect",
  },
  {
    id: "text",
    label: "slash.text",
    icon: Pilcrow,
    keywords: "paragraph plain",
    run: (e) => e.chain().focus().setParagraph().run(),
  },
  {
    id: "h1",
    label: "slash.h1",
    icon: Heading1,
    keywords: "title big",
    run: (e) => e.chain().focus().setHeading({ level: 1 }).run(),
  },
  {
    id: "h2",
    label: "slash.h2",
    icon: Heading2,
    keywords: "subtitle section",
    run: (e) => e.chain().focus().setHeading({ level: 2 }).run(),
  },
  {
    id: "h3",
    label: "slash.h3",
    icon: Heading3,
    keywords: "subheading",
    run: (e) => e.chain().focus().setHeading({ level: 3 }).run(),
  },
  {
    id: "bullet",
    label: "slash.bullet",
    icon: List,
    keywords: "unordered ul",
    run: (e) => e.chain().focus().toggleBulletList().run(),
  },
  {
    id: "numbered",
    label: "slash.numbered",
    icon: ListOrdered,
    keywords: "ordered ol",
    run: (e) => e.chain().focus().toggleOrderedList().run(),
  },
  {
    id: "task",
    label: "slash.task",
    icon: ListTodo,
    keywords: "todo checkbox check",
    run: (e) => e.chain().focus().toggleTaskList().run(),
  },
  {
    id: "quote",
    label: "slash.quote",
    icon: TextQuote,
    keywords: "blockquote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
  },
  {
    id: "code",
    label: "slash.code",
    icon: Code,
    keywords: "snippet pre fence",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: "divider",
    label: "slash.divider",
    icon: Minus,
    keywords: "rule hr line separator",
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    id: "table",
    label: "slash.table",
    icon: Table,
    keywords: "grid rows columns",
    run: (e) =>
      e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

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
  const t = useT();

  const filtered = useMemo(() => {
    const query = menu?.query.toLowerCase().trim() ?? "";
    const available = allowNoteLinks
      ? commands
      : commands.filter((command) => command.id !== "note-link");
    if (!query) return available;
    return available.filter((c) =>
      `${t(c.label)} ${c.keywords}`.toLowerCase().includes(query),
    );
  }, [allowNoteLinks, menu?.query, t]);

  useEffect(() => setSelected(0), [menu?.query]);

  useEffect(() => {
    if (!menu || !editor) return;
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
        setSelected((i) => (i + 1) % filtered.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
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
      initial={{ opacity: 0, y: menu.side === "bottom" ? -4 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="fixed z-90 max-h-[264px] w-[208px] overflow-y-auto rounded-lg border border-line bg-bg p-1 shadow-lg shadow-black/8 dark:shadow-black/40"
      style={{ left: menu.position.left, top: menu.position.top }}
    >
      {filtered.map((command, index) => (
        <button
          key={command.id}
          type="button"
          className={cx(
            "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors duration-75",
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
          onMouseEnter={() => setSelected(index)}
        >
          <command.icon size={14.5} strokeWidth={1.75} className="shrink-0" />
          {t(command.label)}
        </button>
      ))}
    </motion.div>
  );
}
