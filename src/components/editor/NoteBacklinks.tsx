import { ArrowUpRight, ChevronRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { ipc } from "@/lib/ipc";
import { vaultNote } from "@/lib/noteRef";
import type { Backlink } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * Notes that link to this one. Re-queried whenever the note becomes active or
 * the vault tree changes, so edits made elsewhere show up on return.
 */
export function NoteBacklinks({ rel, active }: { rel: string; active: boolean }) {
  const tree = useVault((s) => s.tree);
  const [links, setLinks] = useState<Backlink[]>([]);
  const [open, setOpen] = useState(true);
  const t = useT();

  useEffect(() => {
    if (!active) return;
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
  }, [rel, active, tree]);

  if (links.length === 0) return null;

  const openLink = (target: string) => {
    const vault = useVault.getState();
    const note = vaultNote(target);
    vault.expandTo(target);
    vault.setView({ type: "note", note });
    useTabs.getState().requestScrollTop(note);
  };

  return (
    <section className="mt-16 border-t border-line pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mb-2 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint transition-colors hover:text-muted"
      >
        <ChevronRight
          size={12}
          strokeWidth={2.5}
          className={cx("transition-transform duration-150", open && "rotate-90")}
        />
        {t("editor.backlinks")}
        <span className="ml-1 tabular-nums">{links.length}</span>
      </button>

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
              <li key={link.rel}>
                <button
                  type="button"
                  onClick={() => openLink(link.rel)}
                  className="group flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors duration-100 hover:bg-hover"
                >
                  <span className="flex items-center gap-1 text-[13px] font-medium text-ink">
                    <span className="truncate">{link.title}</span>
                    <ArrowUpRight
                      size={12}
                      strokeWidth={2}
                      className="shrink-0 text-faint opacity-0 transition-opacity duration-100 group-hover:opacity-100"
                    />
                  </span>
                  <span className="line-clamp-2 text-[12px] leading-snug text-muted">
                    {link.snippet}
                  </span>
                </button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
