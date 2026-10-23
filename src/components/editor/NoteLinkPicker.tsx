import {
  IconFileText,
  IconHash,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { flattenNotes } from "@/lib/tree";
import { headingPlainText } from "@/lib/noteLinks";
import { ipc } from "@/lib/ipc";
import { cx, noteTitle, parentDir } from "@/lib/utils";
import { useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";

export interface LinkPickerState {
  range: { from: number; to: number };
  position: { left: number; top: number };
  side: "top" | "bottom";
}

/** "projects/research/deep.md" → "projects / research" (undefined at root). */
function folderRoute(rel: string) {
  const dir = parentDir(rel);
  return dir ? dir.split("/").join(" / ") : undefined;
}

/** Strip markdown emphasis so a picker heading matches the DOM textContent. */
function extractHeadings(markdown: string): string[] {
  const headings: string[] = [];
  let inFence = false;
  for (const line of markdown.split("\n")) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```") || trimmed.startsWith("~~~")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = /^#{1,3}\s+(.*)$/.exec(trimmed);
    // Shared with revealHeading: the label must equal the DOM textContent,
    // emphasis markers stripped per CommonMark, identifier underscores kept.
    if (match) headings.push(headingPlainText(match[1]));
  }
  return headings.filter(Boolean);
}

/** Floating search list to pick a note (and optionally a heading) to link to. */
export function NoteLinkPicker({
  state,
  currentRel,
  onPick,
  onClose,
}: {
  state: LinkPickerState;
  currentRel: string;
  onPick: (rel: string, title: string, heading?: string) => void;
  onClose: () => void;
}) {
  const tree = useVault((s) => s.tree);
  const recentNotes = useVault((s) => s.recentNotes);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [headings, setHeadings] = useState<{ rel: string; title: string; headings: string[] } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  // Exclude the current note — no self-links.
  const notes = useMemo(
    () => flattenNotes(tree).filter((n) => n.rel !== currentRel),
    [tree, currentRel],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q) {
      // Typing searches the whole vault (title + folder path).
      return notes
        .filter((n) => n.rel.toLowerCase().includes(q))
        .slice(0, 8);
    }
    // Empty query: most-recent notes first, then fill from the rest.
    const byRel = new Map(notes.map((n) => [n.rel, n]));
    const recents = recentNotes
      .map((rel) => byRel.get(rel))
      .filter((n): n is (typeof notes)[number] => n !== undefined);
    const seen = new Set(recents.map((n) => n.rel));
    const rest = notes.filter((n) => !seen.has(n.rel));
    return [...recents, ...rest].slice(0, 8);
  }, [notes, recentNotes, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => setSelected(0), [query, headings]);

  const choose = async (index: number) => {
    if (headings) {
      // Second step: index 0 is the whole note, the rest are its headings.
      if (index === 0) onPick(headings.rel, headings.title);
      else onPick(headings.rel, headings.title, headings.headings[index - 1]);
      return;
    }
    const note = filtered[index];
    if (!note) return;
    try {
      const content = await ipc.readNote(note.rel);
      const noteHeadings = extractHeadings(content);
      if (noteHeadings.length > 0) {
        setHeadings({ rel: note.rel, title: noteTitle(note.rel), headings: noteHeadings });
        setSelected(0);
        setQuery("");
        return;
      }
    } catch {
      // Unreadable target — fall through to a plain note link.
    }
    onPick(note.rel, noteTitle(note.rel));
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: state.side === "bottom" ? -4 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12, ease: "easeOut" }}
      className="fixed z-90 w-[268px] rounded-md border border-line bg-menu p-1 shadow-lg shadow-black/8 dark:shadow-black/40"
      style={{ left: state.position.left, top: state.position.top }}
    >
      <input
        ref={inputRef}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={t("editor.linkToNote")}
        className="mb-1 h-8 w-full bg-transparent px-2 text-[13px] text-ink outline-none placeholder:text-faint"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            if (headings) setHeadings(null);
            else onClose();
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            const total = headings ? headings.headings.length + 1 : filtered.length;
            setSelected((i) => (i + 1) % Math.max(total, 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            const total = headings ? headings.headings.length + 1 : filtered.length;
            setSelected((i) => (i - 1 + total) % Math.max(total, 1));
          } else if (event.key === "Enter") {
            event.preventDefault();
            void choose(selected);
          }
        }}
        onBlur={onClose}
      />
      <div className="max-h-[240px] overflow-y-auto">
        {headings
          ? [
              { key: "whole", icon: <IconFileText size={14} stroke={1.75} className="shrink-0" />, label: t("editor.wholeNote") },
              ...headings.headings.map((heading, i) => ({
                key: `h-${i}`,
                icon: <IconHash size={14} stroke={1.75} className="shrink-0" />,
                label: heading,
              })),
            ].map((item, index) => (
              <button
                key={item.key}
                type="button"
                className={cx(
                  "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors duration-75",
                  index === selected ? "bg-hover text-ink" : "text-muted",
                )}
                onMouseDown={(event) => {
                  event.preventDefault();
                  void choose(index);
                }}
                onMouseEnter={() => setSelected(index)}
              >
                {item.icon}
                <span className="truncate">{item.label}</span>
              </button>
            ))
          : filtered.map((note, index) => {
              const route = folderRoute(note.rel);
              return (
                <button
                  key={note.rel}
                  type="button"
                  className={cx(
                    "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] transition-colors duration-75",
                    index === selected ? "bg-hover text-ink" : "text-muted",
                  )}
                  // mousedown (not click) so it fires before the input's blur closes us
                  onMouseDown={(event) => {
                    event.preventDefault();
                    void choose(index);
                  }}
                  onMouseEnter={() => setSelected(index)}
                >
                  <IconFileText size={14} stroke={1.75} className="shrink-0" />
                  <span className="truncate">{noteTitle(note.rel)}</span>
                  {route && (
                    <span className="ml-auto shrink-0 truncate pl-2 text-[11px] text-faint">
                      {route}
                    </span>
                  )}
                </button>
              );
            })}
        {!headings && filtered.length === 0 && (
          <p className="px-2 py-4 text-center text-[12.5px] text-faint">
            {t("editor.noNotesMatch", { query: query.trim() })}
          </p>
        )}
      </div>
    </motion.div>
  );
}
