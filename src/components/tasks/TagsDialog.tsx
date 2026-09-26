import { ArrowLeft, FileText, Hash } from "lucide-react";
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { ipc } from "@/lib/ipc";
import { vaultNote } from "@/lib/noteRef";
import type { TagCount } from "@/lib/types";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

/**
 * Vault-wide tag browser: `#tag` tokens in note bodies plus `tags:` keys in
 * externally authored frontmatter (read-only). Pick a tag to see its notes.
 */
export function TagsDialog() {
  const open = useUi((s) => s.tagsOpen);
  const setOpen = useUi((s) => s.setTagsOpen);
  const status = useVault((s) => s.status);
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);
  const t = useT();

  useEffect(() => {
    if (!open || status !== "ready") return;
    setActiveTag(null);
    setNotes(null);
    let cancelled = false;
    ipc
      .listTags()
      .then((list) => {
        if (!cancelled) setTags(list);
      })
      .catch(() => {
        if (!cancelled) setTags([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, status]);

  useEffect(() => {
    if (!open || !activeTag) return;
    let cancelled = false;
    ipc
      .notesWithTag(activeTag)
      .then((rels) => {
        if (!cancelled) setNotes(rels);
      })
      .catch(() => {
        if (!cancelled) setNotes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, activeTag]);

  const close = () => setOpen(false);

  const openNote = (rel: string) => {
    close();
    setTimeout(() => {
      const vault = useVault.getState();
      const note = vaultNote(rel);
      vault.expandTo(rel);
      vault.setView({ type: "note", note });
      useTabs.getState().requestScrollTop(note);
    }, 0);
  };

  if (status !== "ready") return null;

  return (
    <Modal
      open={open}
      onClose={close}
      ariaLabel={t("tags.aria")}
      align="top"
      className="mt-[14vh] w-[480px]"
    >
      <div className="flex items-center gap-1 border-b border-line-soft px-3 py-2.5 text-[13px] font-semibold text-ink">
        {activeTag !== null && (
          <button
            type="button"
            aria-label={t("tags.back")}
            onClick={() => setActiveTag(null)}
            className="grid h-6 w-6 place-items-center rounded-md text-faint transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <ArrowLeft size={13} strokeWidth={2} />
          </button>
        )}
        <span className="flex min-w-0 items-center gap-1.5">
          <Hash size={13} strokeWidth={2} className="shrink-0 text-faint" />
          <span className="truncate">{activeTag ?? t("tags.title")}</span>
        </span>
      </div>
      <div className="max-h-[56vh] overflow-y-auto p-2">
        {activeTag === null ? (
          tags?.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] leading-relaxed text-faint">
              {t("tags.empty")}
            </p>
          )
        ) : null}
        {activeTag === null
          ? (tags ?? []).map((tag) => (
              <button
                key={tag.tag}
                type="button"
                onClick={() => setActiveTag(tag.tag)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-hover"
              >
                <Hash size={13} strokeWidth={1.75} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate">{tag.tag}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-faint">
                  {t("tags.notes", { count: tag.count })}
                </span>
              </button>
            ))
          : (notes ?? []).map((rel) => (
              <button
                key={rel}
                type="button"
                onClick={() => openNote(rel)}
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-hover"
              >
                <FileText size={13} strokeWidth={1.75} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate">{rel.replace(/\.md$/i, "")}</span>
              </button>
            ))}
      </div>
    </Modal>
  );
}
