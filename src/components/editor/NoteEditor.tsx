import { EditorContent, useEditor } from "@tiptap/react";
import { Slice } from "@tiptap/pm/model";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  lazy,
  memo,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import {
  joinFrontmatter,
  parseFrontmatter,
  splitFrontmatter,
  type Property,
} from "@/lib/frontmatter";
import { hrefToRel, relToHref, wikiToMarkdown } from "@/lib/noteLinks";
import {
  noteAssetRoot,
  noteKey,
  noteTitle,
  sameNote,
  vaultNote,
} from "@/lib/noteRef";
import { flattenNotes } from "@/lib/tree";
import type { NoteRef } from "@/lib/types";
import { cx, debounce } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useAgent } from "@/stores/agent";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useLocale, useT } from "@/stores/locale";
import { createExtensions } from "./extensions";
import { ArticleOutline, type OutlineItem } from "./ArticleOutline";
import { CursorMotion } from "./cursorMotion";
import { insertImageFile, imageFileFromDataTransfer } from "./insertImage";
import { parseMarkdownSlice } from "./markdownPaste";
import { NoteLinkPicker, type LinkPickerState } from "./NoteLinkPicker";
import { BacklinksBadge, NoteBacklinks, useBacklinks } from "./NoteBacklinks";
import { NoteProperties } from "./NoteProperties";
import { revealText } from "./revealText";
import { UnlinkedMentions } from "./UnlinkedMentions";
import { SelectionMenu } from "./SelectionMenu";
import { ImageSourcePopover } from "./ImageSourcePopover";
import { imageMenuItems, imageTarget, type ImageTarget } from "./imageMenu";
import { ContextMenu, type MenuPosition } from "@/components/ui/ContextMenu";
import { SlashMenu, type SlashMenuState } from "./SlashMenu";

const MarkdownSourceEditor = lazy(() =>
  import("./MarkdownSourceEditor").then((module) => ({
    default: module.MarkdownSourceEditor,
  })),
);

/**
 * One live Tiptap instance per mounted editor. Tab panes keep an instance per
 * open note (hidden with visibility when inactive) so switching tabs is a
 * paint-only CSS toggle — no parse, remount, or layout rebuild. The
 * per-mount work (schema build, plugin setup, view creation) is paid once per
 * tab open, never on switch.
 *
 * `note` can also change on a mounted instance (content is swapped via
 * setContent), so every note-dependent bit of logic reads from `noteRef` rather
 * than a closure captured at editor creation.
 *
 * `active` gates the singleton concerns (fixed word counter, focus-reload,
 * overlay menus) so hidden panes stay completely inert.
 */
export const NoteEditor = memo(function NoteEditor({
  note,
  active = true,
}: {
  note: NoteRef;
  active?: boolean;
}) {
  const vaultRoot = useVault((s) => s.root);
  const renameEntry = useVault((s) => s.renameEntry);
  const renameExternalNote = useVault((s) => s.renameExternalNote);
  const setSaveState = useUi((s) => s.setSaveState);
  const markdownSource = useUi((s) => s.markdownSource);
  const cursorAnimation = useVault((s) => s.cursorAnimation);
  const language = useLocale((s) => s.language);
  const t = useT();

  const [slashMenu, setSlashMenu] = useState<SlashMenuState | null>(null);
  const [imageSource, setImageSource] = useState<{
    pos: number;
    src: string;
    markdown: string;
    top: number;
    left: number;
    width: number;
  } | null>(null);
  const [imageMenu, setImageMenu] = useState<{
    position: MenuPosition;
    target: ImageTarget;
  } | null>(null);
  const [linkPicker, setLinkPicker] = useState<LinkPickerState | null>(null);
  const [words, setWords] = useState(0);
  const [missing, setMissing] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [rawText, setRawText] = useState("");
  const [outlineItems, setOutlineItems] = useState<OutlineItem[]>([]);
  const [activeOutlineKey, setActiveOutlineKey] = useState<string | null>(null);

  const noteRef = useRef(note);
  const currentKey = noteKey(note);
  // Frontmatter of the loaded note, kept out of the editor and re-attached on
  // save so the file's metadata survives round-trips.
  const frontmatter = useRef("");
  const activeRef = useRef(active);
  activeRef.current = active;
  const languageRef = useRef(language);
  languageRef.current = language;
  const scrollRef = useRef<HTMLDivElement>(null);
  const backlinksRef = useRef<HTMLElement>(null);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  /** Bumped after each note load, so reveal requests can wait for content. */
  const [loadNonce, setLoadNonce] = useState(0);
  // Content box for the animated caret overlay (scrolls with the text).
  const pageRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<CursorMotion | null>(null);
  // Tracked continuously so each pane restores its own reading position when
  // it becomes active again.
  const savedScroll = useRef(0);
  const lastSaved = useRef("");
  const pending = useRef<string | null>(null);
  const loadedKey = useRef<string | null>(null);
  // True only while we're programmatically replacing the document, so the
  // resulting onUpdate doesn't mark the fresh content as an unsaved edit.
  const swapping = useRef(false);
  const outlineFrame = useRef<number | null>(null);
  const refreshWhenActive = useRef(false);
  const editorRef = useRef<NonNullable<EditorInstance> | null>(null);

  const syncOutline = useCallback((instance: NonNullable<EditorInstance>) => {
    const next = outlineHeadingElements(instance).map((heading, index) => {
      const level = Number(heading.tagName.slice(1)) as OutlineItem["level"];
      const text = heading.textContent?.trim() ?? "";
      return { key: `${index}:${level}:${text}`, text, level };
    });
    setOutlineItems((current) =>
      sameOutline(current, next) ? current : next,
    );
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

  const assetRoot = noteAssetRoot(vaultRoot, note);
  const extensions = useMemo(() => createExtensions(assetRoot), [assetRoot]);
  const backlinkRel = note.kind === "vault" && !missing ? note.rel : null;
  const backlinks = useBacklinks(backlinkRel, active);

  const updateSlashMenu = useCallback((editor: NonNullable<EditorInstance>) => {
    const { selection } = editor.state;
    if (!selection.empty) {
      setSlashMenu(null);
      return;
    }
    const position = selection.from;
    const resolved = editor.state.doc.resolve(position);
    const textBefore = resolved.parent.textBetween(
      0,
      resolved.parentOffset,
      undefined,
      "￼",
    );
    const match = /(?:^|\s)\/([\p{L}\p{N} ]*)$/iu.exec(textBefore);
    if (!match) {
      setSlashMenu(null);
      return;
    }
    const slashIndex = textBefore.lastIndexOf("/");
    const from = position - (textBefore.length - slashIndex);
    const coords = editor.view.coordsAtPos(position);
    const menuHeight = 272;
    const below = window.innerHeight - coords.bottom > menuHeight + 16;
    setSlashMenu({
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

  const publishAgentSelection = useCallback((text: string) => {
    if (!activeRef.current) return;
    const agent = useAgent.getState();
    if (!text.trim()) {
      agent.setSelection(null);
      return;
    }
    const current = noteRef.current;
    agent.setSelection({
      sourceKey: noteKey(current),
      source: current.kind === "vault" ? `notes/${current.rel}` : current.path,
      title: noteTitle(current),
      text,
    });
  }, []);

  const askAIAboutSelection = useCallback(
    (request: string, selectedText: string) => {
      const current = noteRef.current;
      const selection = {
        sourceKey: noteKey(current),
        source: current.kind === "vault" ? `notes/${current.rel}` : current.path,
        title: noteTitle(current),
        text: selectedText,
      };
      const noteReference = {
        sourceKey: selection.sourceKey,
        source: selection.source,
        title: selection.title,
      };
      const agent = useAgent.getState();
      agent.setSelection(selection);
      useUi.getState().setAgentOpen(true);
      void (async () => {
        if (vaultRoot && agent.vaultRoot !== vaultRoot) {
          await agent.initialize(vaultRoot).catch(() => undefined);
        }
        const readyAgent = useAgent.getState();
        readyAgent.setSelection(selection);
        await readyAgent.send(request, noteReference);
      })();
    },
    [vaultRoot],
  );

  const editor = useEditor(
    {
      content: "",
      contentType: "markdown",
      extensions,
      editorProps: {
        attributes: {
          class: "prose-note",
          autoCapitalize: "off",
          autoCorrect: "off",
          spellCheck: "false",
          "data-gramm": "false",
        },
        clipboardTextParser(text) {
          const currentEditor = editorRef.current;
          if (!currentEditor?.markdown) return Slice.empty;
          const notes = flattenNotes(useVault.getState().tree);
          return parseMarkdownSlice(
            currentEditor.schema,
            currentEditor.markdown,
            wikiToMarkdown(text, notes),
          );
        },
        handlePaste(view, event) {
          const image = imageFileFromDataTransfer(event.clipboardData);
          const currentEditor = editorRef.current;
          if (image && currentEditor) {
            event.preventDefault();
            insertImageFile({
              editor: currentEditor,
              file: image,
              range: {
                from: view.state.selection.from,
                to: view.state.selection.to,
              },
              vaultRoot,
              note: noteRef.current,
            });
            return true;
          }
          return false;
        },
        handleDrop(view, event) {
          const image = imageFileFromDataTransfer(event.dataTransfer);
          const currentEditor = editorRef.current;
          if (!image || !currentEditor) return false;
          event.preventDefault();
          const coords = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          const position = coords?.pos ?? view.state.selection.from;
          insertImageFile({
            editor: currentEditor,
            file: image,
            range: { from: position, to: position },
            vaultRoot,
            note: noteRef.current,
          });
          return true;
        },
        // Typora-style: clicking an image reveals its Markdown source in a
        // bar right below it (alt pre-selected, editable).
        handleClickOn(view, _pos, node, nodePos) {
          if (node.type.name !== "image") {
            setImageSource(null);
            return false;
          }
          const el = view.nodeDOM(nodePos);
          const scroll = scrollRef.current;
          if (!(el instanceof HTMLElement) || !scroll) return false;
          const imgRect = el.getBoundingClientRect();
          const boxRect = scroll.getBoundingClientRect();
          const attrs = node.attrs as {
            alt?: string;
            src?: string;
            vaultSrc?: string | null;
          };
          const src = attrs.vaultSrc ?? attrs.src ?? "";
          setImageSource({
            pos: nodePos,
            src,
            markdown: `![${attrs.alt ?? ""}](${src})`,
            top: imgRect.bottom - boxRect.top + scroll.scrollTop + 6,
            left: imgRect.left - boxRect.left,
            width: imgRect.width,
          });
          return false;
        },
        handleDOMEvents: {
          // Right-click on an image: upload / open / copy / save as.
          contextmenu(view, event) {
            const img = event.target;
            if (!(img instanceof HTMLImageElement)) return false;
            const pos = view.posAtDOM(img, 0);
            const node = view.state.doc.nodeAt(pos);
            if (node?.type.name !== "image") return false;
            const target = imageTarget(
              node.attrs,
              noteAssetRoot(useVault.getState().root, noteRef.current),
            );
            if (!target) return false;
            event.preventDefault();
            // Keep the opening event from reaching ContextMenu's window-level
            // dismiss listener, which would close the menu immediately.
            event.stopPropagation();
            setImageSource(null);
            setImageMenu({
              position: { x: event.clientX, y: event.clientY },
              target,
            });
            return true;
          },
        },
        // Link clicks are handled by a capture-phase listener on the pane (see
        // the effect below) so the anchor's native navigation is stopped before
        // anything — including the webview — can act on it.
      },
      onTransaction() {
        // `sync(forceSnap)` — programmatic content swaps snap rather than
        // animating the caret across two unrelated notes.
        motionRef.current?.sync(swapping.current);
      },
      onUpdate({ editor }) {
        if (swapping.current) return;
        // A doc change can invalidate the popover's captured node position
        // and src (e.g. a background upload swapping the URL) — close it.
        setImageSource(null);
        const markdown = editor.getMarkdown();
        pending.current = markdown;
        setSaveState("saving");
        debouncedPersist(markdown);
        setWords(countWords(markdown, languageRef.current));
        syncOutline(editor);
        updateSlashMenu(editor);
      },
      onSelectionUpdate({ editor }) {
        updateSlashMenu(editor);
        if (!activeRef.current) return;
        const { from, to, empty } = editor.state.selection;
        publishAgentSelection(
          empty ? "" : editor.state.doc.textBetween(from, to, "\n", "\n"),
        );
      },
    },
    [extensions, syncOutline],
  );
  editorRef.current = editor;

  // One animated caret per live editor, created only while it can actually be
  // seen (active tab, rich-text mode) and when the setting is on. Recreating
  // on toggle is cheap and keeps the disabled path allocation-free.
  const motionEnabled =
    cursorAnimation && active && !markdownSource && !missing;
  useEffect(() => {
    // `editor.isDestroyed` is true while the view is a throwing Tiptap Proxy
    // (destroyed / not-yet-mounted instance), so guard before touching it.
    if (!editor || editor.isDestroyed || !motionEnabled) return;
    const container = pageRef.current;
    if (!container) return;
    const view = editor.view;
    const motion = new CursorMotion(view, container, { enabled: true });
    motionRef.current = motion;
    motion.sync(true);
    return () => {
      motion.destroy();
      motionRef.current = null;
    };
  }, [editor, motionEnabled]);

  useEffect(() => {
    // Note switched within the tab: any open image source bar is stale.
    setImageSource(null);
  }, [currentKey]);

  useEffect(() => {
    if (!active || !editor) return;
    if (markdownSource) {
      const agent = useAgent.getState();
      if (agent.selection?.sourceKey === currentKey) agent.setSelection(null);
      return;
    }
    const { from, to, empty } = editor.state.selection;
    publishAgentSelection(
      empty ? "" : editor.state.doc.textBetween(from, to, "\n", "\n"),
    );
    return () => {
      const agent = useAgent.getState();
      if (agent.selection?.sourceKey === currentKey) agent.setSelection(null);
    };
  }, [active, currentKey, editor, markdownSource, publishAgentSelection]);

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
  }, [
    editor,
    note,
    currentKey,
    persist,
    debouncedPersist,
    language,
    syncOutline,
  ]);

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
  }, [editor, outlineItems]);

  useEffect(() => {
    if (active && !markdownSource) updateActiveOutline();
    return () => {
      if (outlineFrame.current !== null) {
        window.cancelAnimationFrame(outlineFrame.current);
        outlineFrame.current = null;
      }
    };
  }, [active, markdownSource, outlineItems, updateActiveOutline]);

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
    [editor, outlineItems],
  );

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
    window.addEventListener("ornata-agent-notes-changed", refreshOrDefer);
    return () => {
      window.removeEventListener("focus", refreshOrDefer);
      window.removeEventListener("ornata-agent-notes-changed", refreshOrDefer);
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

  // Handle link clicks in the capture phase, before the anchor's native
  // navigation (which the webview would otherwise turn into a browser open).
  // Scoped to this pane's DOM, so exactly one handler runs per click.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const onClick = async (event: MouseEvent) => {
      const anchor = (event.target as HTMLElement | null)?.closest("a[href]");
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      if (/^(?:https?:\/\/|mailto:)/i.test(href)) {
        openUrl(href);
        return;
      }
      const current = noteRef.current;
      if (current.kind === "external") {
        try {
          const opened = await ipc.openExternalLink(current.path, href);
          if (opened) useVault.getState().openExternalNotes([opened]);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : String(err));
        }
        return;
      }
      const targetRel = hrefToRel(href);
      if (targetRel) {
        const vault = useVault.getState();
        const target = vaultNote(targetRel);
        vault.expandTo(targetRel);
        vault.setView({ type: "note", note: target });
        // Links point at the note as a whole — open it at the top, even if the
        // target tab was already scrolled down.
        useTabs.getState().requestScrollTop(target);
      }
    };
    root.addEventListener("click", onClick, true);
    return () => root.removeEventListener("click", onClick, true);
  }, []);

  // Honor a scroll-to-top request for this note (fired when opened via a link).
  const scrollTopReq = useTabs((s) => s.scrollTopReq);
  const titleFocusReq = useTabs((s) => s.titleFocusReq);
  useEffect(() => {
    if (!scrollTopReq || scrollTopReq.key !== currentKey) return;
    savedScroll.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [scrollTopReq, currentKey]);

  // Honor a reveal request (a backlink / mention snippet was clicked): once
  // this pane is visible and its content loaded, scroll to and flash the
  // matching block. Each request is consumed once; a miss leaves the note at
  // wherever it opened.
  const revealReq = useTabs((s) => s.revealReq);
  const revealedNonce = useRef(0);
  useEffect(() => {
    if (!editor || !active || markdownSource || loadNonce === 0) return;
    if (!revealReq || revealReq.key !== currentKey) return;
    if (loadedKey.current !== currentKey) return;
    if (revealedNonce.current === revealReq.nonce) return;
    revealedNonce.current = revealReq.nonce;
    if (revealText(editor, revealReq.text) && scrollRef.current) {
      savedScroll.current = scrollRef.current.scrollTop;
    }
  }, [editor, active, markdownSource, loadNonce, revealReq, currentKey]);

  const flushThen = (action: () => void) => {
    debouncedPersist.cancel();
    const flush =
      pending.current !== null
        ? persist(pending.current, noteRef.current)
        : Promise.resolve();
    flush.then(action);
  };

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
          if (path) toast(t("toast.noteExported"), { description: path });
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

  // Insert a page link to `rel` over the slash range, as a link mark whose
  // href is the note path (serializes to `[title](rel)` markdown on save).
  const insertNoteLink = (rel: string, title: string) => {
    if (!editor || !linkPicker) return;
    editor
      .chain()
      .focus()
      .deleteRange(linkPicker.range)
      .insertContent([
        {
          type: "text",
          text: title,
          marks: [{ type: "link", attrs: { href: relToHref(rel) } }],
        },
        { type: "text", text: " " },
      ])
      .run();
    setLinkPicker(null);
  };

  /** Write an edited image source (Typora bar) back onto the node. */
  const applyImageSource = (
    pos: number,
    originalSrc: string,
    alt: string,
    src: string,
  ) => {
    setImageSource(null);
    if (!editor) return;
    const node = editor.state.doc.nodeAt(pos);
    if (!node || node.type.name !== "image") return;
    const attrs: Record<string, unknown> = { ...node.attrs, alt };
    // Only touch src when it actually changed — a matching src keeps the
    // vault-relative path (vaultSrc) as the Markdown source of truth.
    if (src !== originalSrc) {
      attrs.src = src;
      attrs.vaultSrc = null;
    }
    editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, attrs));
    editor.commands.focus();
  };

  const revealBacklinks = () => {
    setBacklinksOpen(true);
    // Wait a frame so an expanding list has mounted before scrolling to it.
    requestAnimationFrame(() => {
      backlinksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  return (
    <>
    <div
      ref={scrollRef}
      className="page-scroll relative"
      onScroll={(event) => {
        savedScroll.current = event.currentTarget.scrollTop;
        updateActiveOutline();
      }}
    >
      <div className="note-page relative">
        {missing ? (
          <p className="pt-16 text-center text-[14px] text-faint">
            {t("editor.missing")}
          </p>
        ) : (
          <TitleInput
            key={currentKey}
            title={noteTitle(note)}
            active={active}
            focusNonce={
              titleFocusReq?.key === currentKey
                ? titleFocusReq.nonce
                : undefined
            }
            onRename={(name) =>
              flushThen(() => {
                if (note.kind === "vault") renameEntry(note.rel, name);
                else renameExternalNote(note.path, name);
              })
            }
          />
        )}
        <BacklinksBadge count={backlinks.links.length} onClick={revealBacklinks} />
        <div className={cx(missing && "hidden")}>
          {markdownSource ? (
            <Suspense fallback={null}>
              <MarkdownSourceEditor
                value={rawText}
                onSelectionChange={publishAgentSelection}
                onChange={(text) => {
                  setRawText(text);
                  const { frontmatter: fm, body } = splitFrontmatter(text);
                  frontmatter.current = fm;
                  setProperties(parseFrontmatter(fm));
                  pending.current = body;
                  setSaveState("saving");
                  debouncedPersist(body);
                  setWords(countWords(body, language));
                }}
              />
            </Suspense>
          ) : (
            <>
              <NoteProperties properties={properties} />
              <EditorContent editor={editor} />
            </>
          )}
          </div>
          {backlinkRel && (
            <footer className="mt-16 flex flex-col gap-4 border-t border-line pt-4">
              <NoteBacklinks
                rel={backlinkRel}
                links={backlinks.links}
                open={backlinksOpen}
                onOpenChange={setBacklinksOpen}
                sectionRef={backlinksRef}
              />
              <UnlinkedMentions rel={backlinkRel} onLinked={backlinks.refresh} />
            </footer>
          )}
          {active && editor && !markdownSource && (
            <SelectionMenu editor={editor} onAskAI={askAIAboutSelection} />
          )}
        {active && !markdownSource && (
          <SlashMenu
            editor={editor}
            menu={slashMenu}
            onClose={() => setSlashMenu(null)}
            allowNoteLinks={note.kind === "vault"}
            onLinkToNote={(range) => {
              if (slashMenu && note.kind === "vault") {
                setLinkPicker({
                  range,
                  position: slashMenu.position,
                  side: slashMenu.side,
                });
              }
              setSlashMenu(null);
            }}
          />
        )}
        {active && !markdownSource && linkPicker && note.kind === "vault" && (
          <NoteLinkPicker
            state={linkPicker}
            currentRel={note.rel}
            onPick={insertNoteLink}
            onClose={() => setLinkPicker(null)}
          />
        )}
        {/* Owned by CursorMotion (appended imperatively), kept empty by React. */}
        <div ref={pageRef} className="cursor-layer" aria-hidden="true" />
      </div>
      {active && (
        <div
          className={cx(
            "pointer-events-none fixed bottom-3 right-4 text-[11px] tabular-nums text-faint transition-opacity duration-300",
            (words === 0 || missing) && "opacity-0",
          )}
        >
          {t(words === 1 ? "editor.word" : "editor.words", { count: words })}
        </div>
      )}
      {active && imageSource && !markdownSource && (
        <ImageSourcePopover
          top={imageSource.top}
          left={imageSource.left}
          width={imageSource.width}
          markdown={imageSource.markdown}
          onApply={(alt, src) => {
            applyImageSource(imageSource.pos, imageSource.src, alt, src);
          }}
          onClose={() => setImageSource(null)}
        />
      )}
      {active && imageMenu && editor && !markdownSource && (
        <ContextMenu
          position={imageMenu.position}
          items={imageMenuItems(editor, imageMenu.target)}
          onClose={() => setImageMenu(null)}
        />
      )}
    </div>
    {active && editor && !missing && !markdownSource && (
      <ArticleOutline
        items={outlineItems}
        activeKey={activeOutlineKey}
        onSelect={selectOutlineItem}
      />
    )}
    </>
  );
});

type EditorInstance = ReturnType<typeof useEditor>;

function TitleInput({
  title,
  active,
  focusNonce,
  onRename,
}: {
  title: string;
  active: boolean;
  focusNonce?: number;
  onRename: (name: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const t = useT();

  useLayoutEffect(() => {
    if (!active) return;
    const element = ref.current;
    const container = element?.parentElement;
    if (!element || !container) return;
    let frame: number | null = null;
    let observedWidth = container.getBoundingClientRect().width;
    const resize = () => {
      if (frame !== null) return;
      frame = window.requestAnimationFrame(() => {
        frame = null;
        resizeTitle(element);
      });
    };
    resizeTitle(element);
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      if (width <= 0 || Math.abs(width - observedWidth) < 0.5) return;
      observedWidth = width;
      resize();
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [active, title]);

  useEffect(() => {
    if (focusNonce === undefined) return;
    ref.current?.focus();
    ref.current?.select();
  }, [focusNonce]);

  const submit = () => {
    const value = ref.current?.value.trim();
    if (value && value !== title) onRename(value);
    else if (ref.current) {
      ref.current.value = title;
      resizeTitle(ref.current);
    }
  };

  return (
    <textarea
      ref={ref}
      rows={1}
      aria-label={t("editor.noteTitle")}
      defaultValue={title}
      placeholder={t("common.untitled")}
      className="note-title block w-full resize-none overflow-hidden bg-transparent text-[clamp(28px,2.4vw,34px)] font-[680] leading-[1.14] tracking-[-0.025em] text-ink [overflow-wrap:anywhere] [text-wrap:balance] outline-none placeholder:text-faint"
      onInput={(event) => resizeTitle(event.currentTarget)}
      onBlur={submit}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === "Escape") {
          event.preventDefault();
          if (event.key === "Escape" && ref.current) {
            ref.current.value = title;
            resizeTitle(ref.current);
          }
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function resizeTitle(element: HTMLTextAreaElement) {
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
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

function outlineHeadingElements(instance: NonNullable<EditorInstance>) {
  return Array.from(
    instance.view.dom.querySelectorAll<HTMLElement>("h1, h2, h3"),
  ).filter((heading) => heading.textContent?.trim());
}

function countWords(markdown: string, language: "en" | "zh-CN") {
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
