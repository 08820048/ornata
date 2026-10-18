import type { Editor } from "@tiptap/react";
import { NOTES_CHANGED } from "@/lib/vaultEvents";
import type { SlashMenuState } from "./SlashMenu";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { toastExported } from "@/lib/exportToast";
import { ipc } from "@/lib/ipc";
import {
  joinFrontmatter,
  parseFrontmatter,
  splitFrontmatter,
  type Property,
} from "@/lib/frontmatter";
import { rewriteLinksInMarkdown, wikiToMarkdown } from "@/lib/noteLinks";
import { applyLinkRewritesToEditor } from "./linkRewrites";
import { noteAssetRoot, noteKey, noteTitle, sameNote } from "@/lib/noteRef";
import { flattenNotes } from "@/lib/tree";
import type { NoteRef } from "@/lib/types";
import { debounce } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";

export interface OutlineItem {
  key: string;
  text: string;
  level: 1 | 2 | 3;
}

function outlineHeadingElements(editor: Editor) {
  return Array.from(
    editor.view.dom.querySelectorAll<HTMLElement>("h1, h2, h3"),
  ).filter((heading) => heading.textContent?.trim());
}

function sameOutline(current: OutlineItem[], next: OutlineItem[]) {
  return (
    current.length === next.length &&
    current.every(
      (item, index) =>
        item.key === next[index]?.key &&
        item.text === next[index]?.text &&
        item.level === next[index]?.level,
    )
  );
}

export function countWords(markdown: string, language: "en" | "zh-CN") {
  const text = markdown.trim();
  if (!text) return 0;
  if (language === "zh-CN") {
    return (
      text.match(/[\p{Script=Han}]|[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/gu)
        ?.length ?? 0
    );
  }
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Editor-free half of the pane's content pipeline: per-pane refs and state
 * plus the save/outline/slash-menu callbacks the editor props close over.
 * The editor-dependent effects live in [`useNoteContentEffects`].
 */
export function useNoteContentState({
  note,
  active,
  language,
}: {
  note: NoteRef;
  active: boolean;
  language: "en" | "zh-CN";
}) {
  const setSaveState = useUi((s) => s.setSaveState);
  const t = useT();

  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [words, setWords] = useState(0);
  const [missing, setMissing] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rawText, setRawText] = useState("");
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeOutlineKey, setActiveOutlineKey] = useState<string | null>(null);
  const [loadNonce, setLoadNonce] = useState(0);

  const noteRef = useRef(note);
  const currentKey = noteKey(note);
  const activeRef = useRef(active);
  activeRef.current = active;
  const languageRef = useRef(language);
  languageRef.current = language;
  const frontmatter = useRef("");
  const savedScroll = useRef(0);
  const lastSaved = useRef("");
  const pending = useRef<string | null>(null);
  const loadedKey = useRef<string | null>(null);
  // True only while we're programmatically replacing the document, so the
  // resulting onUpdate doesn't mark the fresh content as an unsaved edit.
  const swapping = useRef(false);
  const refreshWhenActive = useRef(false);

  const syncOutline = useCallback((instance: Editor) => {
    const next = outlineHeadingElements(instance).map((heading, index) => {
      const level = Number(heading.tagName.slice(1)) as OutlineItem["level"];
      const text = heading.textContent?.trim() ?? "";
      return { key: `${index}:${level}:${text}`, text, level };
    });
    setOutlineItems((current) => (sameOutline(current, next) ? current : next));
    setActiveOutlineKey((current) =>
      current && next.some((item) => item.key === current)
        ? current
        : (next[0]?.key ?? null),
    );
  }, []);

  const persist = useCallback(
    async (markdown: string, target: NoteRef) => {
      const targetKey = noteKey(target);
      if (sameNote(noteRef.current, target)) pending.current = null;
      // Re-attach the note's frontmatter (captured now, before any await, so a
      // concurrent note switch can't swap it out mid-save).
      const fullText = joinFrontmatter(frontmatter.current, markdown);
      try {
        if (target.kind === "vault") {
          await ipc.writeNote(target.rel, fullText);
        } else {
          await ipc.writeExternalNote(target.path, fullText);
        }
        if (sameNote(noteRef.current, target)) {
          lastSaved.current = fullText;
          setSaveState("idle");
        }
        toast.dismiss(`save-${targetKey}`);
      } catch (err) {
        setSaveState("error");
        toast.error(t("toast.noteSaveFailed"), {
          id: `save-${targetKey}`,
          description: err instanceof Error ? err.message : String(err),
          duration: Infinity,
        });
      }
    },
    [setSaveState, t],
  );

  const debouncedPersist = useMemo(
    () => debounce((markdown: string) => persist(markdown, noteRef.current), 500),
    [persist],
  );

  const updateSlashMenu = useCallback((instance: Editor) => {
    const { selection } = instance.state;
    if (!selection.empty) {
      setSlashMenu(null);
      return;
    }
    const position = selection.from;
    const resolved = instance.state.doc.resolve(position);
    const textBefore = resolved.parent.textBetween(
      0,
      resolved.parentOffset,
      undefined,
      "￼",
    );
    // `/` opens the block menu, `@` the date mentions.
    const slash = /(?:^|\s)\/([\p{L}\p{N} ]*)$/iu.exec(textBefore);
    const at = slash ? null : /(?:^|\s)@([\p{L}\p{N}]*)$/iu.exec(textBefore);
    const match = slash ?? at;
    if (!match) {
      setSlashMenu(null);
      return;
    }
    const trigger = slash ? "/" : "@";
    const triggerIndex = textBefore.lastIndexOf(trigger);
    const from = position - (textBefore.length - triggerIndex);
    const coords = instance.view.coordsAtPos(position);
    const menuHeight = 272;
    const below = window.innerHeight - coords.bottom > menuHeight + 16;
    setSlashMenu({
      trigger,
      query: match[1] ?? "",
      range: { from, to: position },
      position: {
        left: Math.max(12, Math.min(coords.left, window.innerWidth - 220)),
        top: below
          ? coords.bottom + 6
          : Math.max(12, coords.top - menuHeight - 6),
      },
      side: below ? "bottom" : "top",
    });
  }, []);

  const flushCurrent = useCallback(async () => {
    debouncedPersist.cancel();
    if (pending.current !== null) {
      const contentText = pending.current;
      pending.current = null;
      await persist(contentText, noteRef.current);
    }
  }, [debouncedPersist, persist, pending, noteRef]);

  const flushThen = (action: () => void) => {
    debouncedPersist.cancel();
    const flush =
      pending.current !== null
        ? persist(pending.current, noteRef.current)
        : Promise.resolve();
    flush.then(action);
  };

  return {
    slashMenu,
    setSlashMenu,
    words,
    setWords,
    missing,
    setMissing,
    properties,
    setProperties,
    rawText,
    setRawText,
    outlineItems,
    setOutlineItems,
    activeOutlineKey,
    setActiveOutlineKey,
    loadNonce,
    setLoadNonce,
    noteRef,
    currentKey,
    activeRef,
    languageRef,
    frontmatter,
    savedScroll,
    lastSaved,
    pending,
    loadedKey,
    swapping,
    refreshWhenActive,
    syncOutline,
    persist,
    debouncedPersist,
    updateSlashMenu,
    flushCurrent,
    flushThen,
  };
}

export type NoteContent = ReturnType<typeof useNoteContentState>;

/**
 * Editor-dependent half of the content pipeline: loading and swapping note
 * content, autosave bookkeeping, external-change reloads, link rewrites, and
 * the note-action window events.
 */
export function useNoteContentEffects({
  editor,
  note,
  active,
  language,
  markdownSource,
  scrollRef,
  content,
}: {
  editor: Editor | null;
  note: NoteRef;
  active: boolean;
  language: "en" | "zh-CN";
  markdownSource: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  content: NoteContent;
}) {
  const {
    setMissing,
    setSlashMenu,
    setOutlineItems,
    setActiveOutlineKey,
    setLoadNonce,
    noteRef,
    currentKey,
    activeRef,
    frontmatter,
    savedScroll,
    lastSaved,
    pending,
    loadedKey,
    swapping,
    refreshWhenActive,
    syncOutline,
    persist,
    debouncedPersist,
    rawText,
    setRawText,
    setProperties,
    setWords,
    outlineItems,
    loadNonce,
  } = content;
  const t = useT();
  const outlineFrame = useRef<number | null>(null);

  // Load the note (and swap in its content) whenever `note` changes. The old
  // note's pending edit is flushed to *its* path first, before we switch.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;

    const prevKey = loadedKey.current;
    const previousNote = noteRef.current;
    debouncedPersist.cancel();
    if (prevKey && prevKey !== currentKey && pending.current !== null) {
      persist(pending.current, previousNote);
    }
    pending.current = null;
    noteRef.current = note;
    setMissing(false);
    setSlashMenu(null);
    setOutlineItems([]);
    setActiveOutlineKey(null);

    const load =
      note.kind === "vault"
        ? ipc.readNote(note.rel)
        : ipc.readExternalNote(note.path);
    load
      .then((text) => {
        if (cancelled) return;
        lastSaved.current = text;
        loadedKey.current = currentKey;
        // Split off frontmatter (kept for save), then render any `[[wiki]]`
        // links in the body as real page links. lastSaved keeps the raw disk
        // text; rewrites only reach the file if the user edits the note.
        const { frontmatter: fm, body } = splitFrontmatter(text);
        frontmatter.current = fm;
        setRawText(text);
        setProperties(parseFrontmatter(fm));
        const notes = flattenNotes(useVault.getState().tree);
        swapping.current = true;
        editor.commands.setContent(wikiToMarkdown(body, notes), {
          contentType: "markdown",
        });
        swapping.current = false;
        syncOutline(editor);
        setWords(countWords(body, language));
        // A freshly loaded note starts at the top.
        savedScroll.current = 0;
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
        setLoadNonce((n) => n + 1);
        const titleFocus = useTabs.getState().titleFocusReq;
        if (
          body.length === 0 &&
          activeRef.current &&
          titleFocus?.key !== currentKey
        ) {
          editor.commands.focus("start");
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true);
      });

    return () => {
      cancelled = true;
    };
  }, [editor, note, currentKey, persist, debouncedPersist, language, syncOutline]);

  const previousSource = useRef(markdownSource);
  useEffect(() => {
    if (!editor || previousSource.current === markdownSource) return;
    previousSource.current = markdownSource;

    if (markdownSource) {
      setRawText(joinFrontmatter(frontmatter.current, editor.getMarkdown()));
      return;
    }

    const { frontmatter: fm, body } = splitFrontmatter(rawText);
    frontmatter.current = fm;
    setProperties(parseFrontmatter(fm));
    const notes = flattenNotes(useVault.getState().tree);
    swapping.current = true;
    editor.commands.setContent(wikiToMarkdown(body, notes), {
      contentType: "markdown",
    });
    swapping.current = false;
    syncOutline(editor);
  }, [editor, markdownSource, rawText, syncOutline]);

  // Flush any unsaved edit when the editor unmounts (tab closed / view gone).
  useEffect(() => {
    return () => {
      debouncedPersist.cancel();
      if (pending.current !== null) persist(pending.current, noteRef.current);
    };
  }, [debouncedPersist, persist]);

  // If the file changed on disk while we were away and the editor is clean,
  // reload it silently. Dirty editor wins. Only the active pane checks —
  // hidden tabs catch up in the activation effect below.
  const reloadIfChanged = useCallback(async () => {
    if (!editor || pending.current !== null) return;
    const cur = noteRef.current;
    try {
      const disk =
        cur.kind === "vault"
          ? await ipc.readNote(cur.rel)
          : await ipc.readExternalNote(cur.path);
      if (!sameNote(cur, noteRef.current) || pending.current !== null) return;
      if (disk !== lastSaved.current) {
        lastSaved.current = disk;
        setRawText(disk);
        const { frontmatter: fm, body } = splitFrontmatter(disk);
        frontmatter.current = fm;
        setProperties(parseFrontmatter(fm));
        const notes = flattenNotes(useVault.getState().tree);
        swapping.current = true;
        editor.commands.setContent(wikiToMarkdown(body, notes), {
          contentType: "markdown",
        });
        swapping.current = false;
        syncOutline(editor);
        setWords(countWords(body, language));
      }
    } catch {
      // note may have been deleted externally; tree refresh handles it
    }
  }, [editor, language, syncOutline]);

  const updateActiveOutline = useCallback(() => {
    if (outlineFrame.current !== null) return;
    outlineFrame.current = window.requestAnimationFrame(() => {
      outlineFrame.current = null;
      const root = scrollRef.current;
      if (!root || !editor || outlineItems.length === 0) return;
      const headings = outlineHeadingElements(editor);
      if (headings.length === 0) return;
      const readingLine = root.getBoundingClientRect().top + 120;
      let nextIndex = 0;
      for (let index = 0; index < headings.length; index += 1) {
        if (headings[index].getBoundingClientRect().top <= readingLine) {
          nextIndex = index;
        } else {
          break;
        }
      }
      setActiveOutlineKey(outlineItems[nextIndex]?.key ?? null);
    });
  }, [editor, outlineItems, scrollRef, setActiveOutlineKey, outlineFrame]);

  useEffect(() => {
    if (active && !markdownSource) updateActiveOutline();
    return () => {
      if (outlineFrame.current !== null) {
        window.cancelAnimationFrame(outlineFrame.current);
        outlineFrame.current = null;
      }
    };
  }, [active, markdownSource, outlineItems, updateActiveOutline, outlineFrame]);

  const selectOutlineItem = useCallback(
    (index: number) => {
      if (!editor) return;
      const heading = outlineHeadingElements(editor)[index];
      if (!heading) return;
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      heading.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
      setActiveOutlineKey(outlineItems[index]?.key ?? null);
    },
    [editor, outlineItems, setActiveOutlineKey],
  );

  // Follow link rewrites the backend wrote on disk (rename/move). The active
  // pane is updated in memory — raw text in source mode, link marks in the
  // rendered doc — so what the user sees matches the files. Hidden panes take
  // the external-change channel instead: they reload from disk on activation
  // (clean ones only — dirty panes keep their edits, per dirty-wins).
  const linkRewritesReq = useTabs((s) => s.linkRewritesReq);
  const appliedRewrites = useRef(0);
  useEffect(() => {
    if (!linkRewritesReq || linkRewritesReq.nonce === appliedRewrites.current) return;
    appliedRewrites.current = linkRewritesReq.nonce;
    if (!activeRef.current) {
      refreshWhenActive.current = true;
      return;
    }
    if (markdownSource) {
      const next = rewriteLinksInMarkdown(
        rawText,
        linkRewritesReq.rewrites,
        flattenNotes(useVault.getState().tree),
      );
      if (next !== rawText) {
        setRawText(next);
        const { frontmatter: fm, body } = splitFrontmatter(next);
        frontmatter.current = fm;
        pending.current = body;
      }
      return;
    }
    if (editor && !editor.isDestroyed) {
      applyLinkRewritesToEditor(editor, linkRewritesReq.rewrites);
    }
  }, [linkRewritesReq, rawText, editor, markdownSource]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dispatch(editor.state.tr);
    const body = markdownSource
      ? splitFrontmatter(rawText).body
      : editor.getMarkdown();
    setWords(countWords(body, language));
  }, [editor, language, markdownSource, rawText]);

  useEffect(() => {
    const refreshOrDefer = () => {
      if (activeRef.current) {
        refreshWhenActive.current = false;
        void reloadIfChanged();
      } else {
        refreshWhenActive.current = true;
      }
    };
    window.addEventListener("focus", refreshOrDefer);
    window.addEventListener(NOTES_CHANGED, refreshOrDefer);
    return () => {
      window.removeEventListener("focus", refreshOrDefer);
      window.removeEventListener(NOTES_CHANGED, refreshOrDefer);
    };
  }, [reloadIfChanged]);

  // On tab activation, restore the pane's scroll offset. A disk read is only
  // needed when a window-focus or agent-change event occurred while hidden;
  // ordinary in-app tab switches stay entirely in memory.
  useEffect(() => {
    if (!active) return;
    if (scrollRef.current) scrollRef.current.scrollTop = savedScroll.current;
    if (refreshWhenActive.current) {
      refreshWhenActive.current = false;
      void reloadIfChanged();
    }
  }, [active, reloadIfChanged]);

  // Quick capture: the main window routed a captured line here because Inbox
  // is open in this pane — append to the pane's own content and save through
  // its normal pipeline (single-writer rule).
  const appendReq = useTabs((s) => s.appendReq);
  const appliedAppendNonce = useRef(0);
  useEffect(() => {
    if (!appendReq || appendReq.key !== currentKey) return;
    // Consume once — rawText is in the deps below (source mode reads it), and
    // re-running on those changes would append the same line repeatedly.
    if (appendReq.nonce === appliedAppendNonce.current) return;
    // Wait until this pane has loaded its note; appending into an empty
    // pre-load document would autosave over Inbox.md and wipe prior lines.
    // Also skip burning the nonce when the editor is not ready yet.
    if (loadedKey.current !== currentKey) return;
    if (!markdownSource && (!editor || editor.isDestroyed)) return;

    appliedAppendNonce.current = appendReq.nonce;
    const line = appendReq.line;
    // Clear the store request so a remounted pane cannot replay it.
    if (useTabs.getState().appendReq?.nonce === appendReq.nonce) {
      useTabs.setState({ appendReq: null });
    }
    if (markdownSource) {
      const base = rawText.replace(/\n*$/, "");
      const next = base ? `${base}\n${line}\n` : `${line}\n`;
      setRawText(next);
      const { frontmatter: fm, body } = splitFrontmatter(next);
      frontmatter.current = fm;
      pending.current = body;
      debouncedPersist(body);
      return;
    }
    // Narrowed above: editor is present when not in source mode.
    const instance = editor!;
    const end = instance.state.doc.content.size;
    instance
      .chain()
      .insertContentAt(end, {
        type: "paragraph",
        content: [{ type: "text", text: line }],
      })
      .run();
  }, [appendReq, currentKey, markdownSource, rawText, editor, setRawText, frontmatter, pending, debouncedPersist, loadNonce]);

  // Palette/menu "copy markdown / export / delete" actions routed through a
  // window event, so menus that outlive this pane can still target it.
  useEffect(() => {
    if (!active || !editor) return;
    const handle = async (event: Event) => {
      try {
        const action = (event as CustomEvent<{ action?: string }>).detail?.action;
        const markdown = markdownSource
          ? rawText
          : joinFrontmatter(frontmatter.current, editor.getMarkdown());

        if (action === "copy") {
          await navigator.clipboard.writeText(markdown);
          toast(t("toast.markdownCopied"));
        } else if (action === "export") {
          const current = noteRef.current;
          const path =
            current.kind === "vault"
              ? await ipc.exportNote(current.rel, markdown)
              : await ipc.exportExternalNote(current.path, markdown);
          if (path) toastExported(path);
        } else if (
          action === "print-pdf" ||
          action === "export-html" ||
          action === "copy-rich"
        ) {
          // Print/export should match the editor: body only (no YAML block)
          // and the note's own asset root (external notes live outside the vault).
          const body = splitFrontmatter(markdown).body;
          const kind =
            action === "print-pdf"
              ? "pdf"
              : action === "export-html"
                ? "html"
                : "clipboard";
          await ipc.startPrintExport({
            markdown: body,
            vaultRoot: noteAssetRoot(useVault.getState().root, noteRef.current),
            defaultName: noteTitle(noteRef.current),
            kind,
          });
        } else if (action === "delete") {
          const current = noteRef.current;
          debouncedPersist.cancel();
          if (pending.current !== null) {
            await persist(pending.current, current);
          }
          if (current.kind === "vault") {
            await useVault.getState().deleteEntry(current.rel);
          } else {
            await useVault.getState().deleteExternalNote(current.path);
          }
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : String(err));
      }
    };
    window.addEventListener("ornata:note-action", handle);
    return () => window.removeEventListener("ornata:note-action", handle);
  }, [active, debouncedPersist, editor, markdownSource, persist, rawText, t]);

  return { reloadIfChanged, updateActiveOutline, selectOutlineItem };
}
