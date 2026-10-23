import {
  IconLink,
} from "@tabler/icons-react";
import { notifyNotesChanged } from "@/lib/vaultEvents";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EASE_OUT } from "@/lib/ease";
import { markTerm, parseInline } from "@/lib/inlineMarkdown";
import { ipc } from "@/lib/ipc";
import { relToHref } from "@/lib/noteLinks";
import type { Mention } from "@/lib/types";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";
import { NoteRow, SectionHeader, Snippet, openNoteAt } from "./NoteBacklinks";

function titleOf(rel: string) {
  return (rel.split("/").pop() ?? rel).replace(/\.md$/i, "");
}

/**
 * Notes that mention `rel`'s title in plain text without linking it, each
 * line with a one-click "Link" that rewrites the mention into a note link.
 * Collapsed by default and only scanned while open, since it's a full-text
 * pass over the vault.
 */
export function UnlinkedMentions({
  rel,
  onLinked,
}: {
  rel: string;
  /** Called after a mention was linked (the target gained a backlink). */
  onLinked: () => void;
}) {
  const t = useT();
  const tree = useVault((s) => s.tree);
  const [open, setOpen] = useState(false);
  const [mentions, setMentions] = useState<Mention[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const title = titleOf(rel);

  useEffect(() => {
    setMentions(null);
  }, [rel]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    ipc
      .unlinkedMentions(rel)
      .then((hits) => {
        if (!cancelled) setMentions(hits);
      })
      .catch(() => {
        if (!cancelled) setMentions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, rel, tree, nonce]);

  const link = useCallback(
    async (mention: Mention, line: Mention["lines"][number]) => {
      const key = `${mention.rel}:${line.line}`;
      setBusy(key);
      try {
        await ipc.linkMention(mention.rel, line.line, line.text, rel, relToHref(rel));
        // Let a clean open editor of that note pick up the new link.
        notifyNotesChanged();
        toast.success(t("toast.mentionLinked", { title: mention.title }));
        onLinked();
      } catch {
        toast.error(t("toast.mentionLinkFailed"));
      } finally {
        setBusy(null);
        setNonce((n) => n + 1);
      }
    },
    [rel, onLinked, t],
  );

  return (
    <section>
      <SectionHeader open={open} onToggle={() => setOpen(!open)}>
        {t("editor.unlinkedMentions")}
        {open && mentions && mentions.length > 0 && (
          <span className="ml-1 tabular-nums">{mentions.length}</span>
        )}
      </SectionHeader>

      <AnimatePresence initial={false}>
        {open && mentions && (
          <motion.ul
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="flex flex-col gap-0.5 overflow-hidden"
          >
            {mentions.length === 0 && (
              <li className="px-2 py-1.5 text-[12px] text-faint">
                {t("editor.unlinkedEmpty")}
              </li>
            )}
            {mentions.map((mention) => (
              <li
                key={mention.rel}
                className="flex flex-col gap-0.5 rounded-md px-2 py-1.5 transition-colors duration-100 hover:bg-hover"
              >
                <NoteRow
                  rel={mention.rel}
                  title={mention.title}
                  count={mention.count}
                  onOpen={() => openNoteAt(mention.rel, rel)}
                />
                {mention.lines.map((line) => {
                  const key = `${mention.rel}:${line.line}`;
                  return (
                    <div key={key} className="group/line flex items-start gap-2">
                      <button
                        type="button"
                        onClick={() => openNoteAt(mention.rel, rel, line.text)}
                        className="min-w-0 flex-1 text-left"
                      >
                        <Snippet parts={markTerm(parseInline(line.text, rel), title)} />
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void link(mention, line)}
                        className="press flex shrink-0 items-center gap-1 rounded-[5px] border border-line px-1.5 py-px text-[11px] text-muted opacity-0 transition-[opacity,background-color,color] duration-100 hover:bg-active hover:text-ink focus-visible:opacity-100 disabled:cursor-progress group-hover/line:opacity-100"
                      >
                        <IconLink size={11} stroke={2} />
                        {t("editor.linkMention")}
                      </button>
                    </div>
                  );
                })}
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  );
}
