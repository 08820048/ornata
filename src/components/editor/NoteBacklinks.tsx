import {
  IconArrowUpRight,
  IconChevronRight,
  IconCornerUpLeft,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { type ReactNode, type Ref, useCallback, useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { type InlinePart, parseInline, plainText } from "@/lib/inlineMarkdown";
import { ipc } from "@/lib/ipc";
import { vaultNote } from "@/lib/noteRef";
import type { Backlink } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * Notes that link to `rel` (null = none, e.g. external notes). Re-queried
 * whenever the note becomes active or the vault tree changes, so edits made
 * elsewhere show up on return. `refresh` forces a re-query (e.g. right after
 * linking a mention).
 */
export function useBacklinks(rel: string | null, active: boolean) {
  const tree = useVault((s) => s.tree);
  const [links, setLinks] = useState<Backlink[]>([]);
  const [nonce, setNonce] = useState(0);
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Never show the previous note's backlinks under a different note.
    setLinks([]);
  }, [rel]);

  useEffect(() => {
    if (!active || !rel) return;
    let cancelled = false;
    ipc
      .noteBacklinks(rel)
      .then((hits) => {
        if (!cancelled) setLinks(hits);
      })
      .catch(() => {
        if (!cancelled) setLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rel, active, tree, nonce]);

  return { links, refresh };
}

/**
 * Open a vault note from a backlink-style list. With `line` (a snippet's raw
 * markdown) the note scrolls to and flashes that line; otherwise it opens at
 * the top, like any link.
 */
export function openNoteAt(rel: string, selfRel: string, line?: string) {
  const vault = useVault.getState();
  const note = vaultNote(rel);
  vault.expandTo(rel);
  vault.setView({ type: "note", note });
  const text = line === undefined ? "" : plainText(parseInline(line, selfRel));
  if (text) useTabs.getState().requestReveal(note, text);
  else useTabs.getState().requestScrollTop(note);
}

/**
 * Compact "↩ 3 backlinks" pill under the title, so links into a long note
 * are visible without scrolling. Clicking reveals the full list at the end.
 */
export function BacklinksBadge({
  count,
  onClick,
}: {
  count: number;
  onClick: () => void;
}) {
  const t = useT();
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="press mb-3 inline-flex items-center gap-1.5 rounded-full border border-line px-2.5 py-0.5 text-[11.5px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink"
    >
      <IconCornerUpLeft size={12} stroke={2} />
      {t(count === 1 ? "editor.backlinkCount" : "editor.backlinksCount", { count })}
    </button>
  );
}

/** The full list of linking notes, shown at the end of the note. */
export function NoteBacklinks({
  rel,
  links,
  open,
  onOpenChange,
  sectionRef,
}: {
  rel: string;
  links: Backlink[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sectionRef?: Ref<HTMLElement>;
}) {
  const t = useT();
  if (links.length === 0) return null;

  return (
    <section ref={sectionRef} className="scroll-mt-6">
      <SectionHeader open={open} onToggle={() => onOpenChange(!open)}>
        {t("editor.backlinks")}
        <span className="ml-1 tabular-nums">{links.length}</span>
      </SectionHeader>

      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="flex flex-col gap-0.5 overflow-hidden"
          >
            {links.map((link) => (
              <li
                key={link.rel}
                className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors duration-100 hover:bg-hover"
              >
                <NoteRow
                  rel={link.rel}
                  title={link.title}
                  count={link.count}
                  onOpen={() => openNoteAt(link.rel, rel)}
                />
                {link.snippets.map((line, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => openNoteAt(link.rel, rel, line)}
                    className="text-left"
                  >
                    <Snippet parts={parseInline(line, rel)} />
                  </button>
                ))}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}

/** Faint uppercase collapsible header shared by the note-footer sections. */
export function SectionHeader({
  open,
  onToggle,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint transition-colors hover:text-muted"
    >
      <IconChevronRight
        size={12}
        stroke={2.5}
        className={cx("transition-transform duration-150", open && "rotate-90")}
      />
      {children}
    </button>
  );
}

/** Title line of a listed note: title, folder, mention count, open arrow. */
export function NoteRow({
  rel,
  title,
  count,
  onOpen,
}: {
  rel: string;
  title: string;
  count: number;
  onOpen: () => void;
}) {
  const folder = folderOf(rel);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-w-0 items-center gap-1.5 text-left text-[13px] font-medium text-ink"
    >
      <span className="truncate">{title}</span>
      {folder && (
        <span className="truncate text-[11px] font-normal text-faint">{folder}</span>
      )}
      {count > 1 && (
        <span className="shrink-0 text-[11px] font-normal tabular-nums text-faint">
          ×{count}
        </span>
      )}
      <IconArrowUpRight
        size={12}
        stroke={2}
        className="shrink-0 text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100"
      />
    </button>
  );
}

/** Parent folder of a note rel, shown as dim context next to the title. */
function folderOf(rel: string) {
  const index = rel.lastIndexOf("/");
  return index > 0 ? rel.slice(0, index) : "";
}

/**
 * One line rendered as readers see it: link labels instead of encoded hrefs,
 * with the mention of the current note highlighted. Brightens on hover since
 * clicking it jumps to that line.
 */
export function Snippet({ parts }: { parts: InlinePart[] }) {
  if (parts.length === 0) return null;
  return (
    <span className="line-clamp-2 text-[12px] leading-snug text-muted transition-colors duration-100 hover:text-ink">
      {parts.map((part, index) =>
        part.kind === "text" ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span
            key={index}
            className={cx(
              "text-ink",
              part.kind === "mark" || part.self
                ? "rounded-[3px] bg-active px-0.5 font-medium"
                : "underline decoration-line underline-offset-2",
            )}
          >
            {part.text}
          </span>
        ),
      )}
    </span>
  );
}
