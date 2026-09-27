import { EditorContent, useEditor } from "@tiptap/react";
import { Slice } from "@tiptap/pm/model";
import { History } from "lucide-react";
import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  joinFrontmatter,
  parseFrontmatter,
  splitFrontmatter,
} from "@/lib/frontmatter";
import { noteLinkParts, wikiToMarkdown } from "@/lib/noteLinks";
import { noteAssetRoot, noteTitle } from "@/lib/noteRef";
import { flattenNotes } from "@/lib/tree";
import type { NoteRef } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useLocale, useT } from "@/stores/locale";
import { createExtensions } from "./extensions";
import { ArticleOutline } from "./ArticleOutline";
import { brokenLinksKey } from "./brokenLinks";
import { dispatchFind } from "./findReplace";
import { FindReplaceBar } from "./FindReplaceBar";
import { NoteHistory } from "./NoteHistory";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { CursorMotion } from "./cursorMotion";
import { insertImageFile, imageFileFromDataTransfer } from "./insertImage";
import { parseMarkdownSlice } from "./markdownPaste";
import { NoteLinkPicker, type LinkPickerState } from "./NoteLinkPicker";
import { NoteProperties } from "./NoteProperties";
import { SelectionMenu } from "./SelectionMenu";
import { SlashMenu } from "./SlashMenu";
import { usePaneLinkClicks, usePaneRequests } from "./usePaneRequests";
import { useAgentBridge, useAgentSelectionSync } from "./useAgentBridge";
import {
  countWords,
  useNoteContentEffects,
  useNoteContentState,
} from "./useNoteContent";
import { TitleInput } from "./TitleInput";
import { BacklinksBadge, NoteBacklinks, useBacklinks } from "./NoteBacklinks";
import { UnlinkedMentions } from "./UnlinkedMentions";
import { ImageSourcePopover } from "./ImageSourcePopover";
import { imageMenuItems, imageTarget, type ImageTarget } from "./imageMenu";
import { ContextMenu, type MenuPosition } from "@/components/ui/ContextMenu";

const MarkdownSourceEditor = lazy(() =>
  import("./MarkdownSourceEditor").then((module) => ({
    default: module.MarkdownSourceEditor,
  })),
);

/**
 * One live Tiptap instance per mounted editor. Tab panes keep an instance per
 * open note (hidden when inactive) so switching tabs is a paint-only CSS
 * toggle — no parse, remount, or layout rebuild.
 *
 * This component is a composition shell: the content pipeline lives in
 * useNoteContent, the agent bridge in useAgentBridge, navigation side
 * effects in usePaneRequests, and dialogs in their own components.
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

  const content = useNoteContentState({ note, active, language });
  const {
    slashMenu,
    setSlashMenu,
    setWords,
    noteRef,
    currentKey,
    activeRef,
    languageRef,
    frontmatter,
    pending,
    swapping,
    syncOutline,
    debouncedPersist,
    updateSlashMenu,
    flushThen,
  } = content;

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const backlinksRef = useRef<HTMLElement>(null);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  // Content box for the animated caret overlay (scrolls with the text).
  const pageRef = useRef<HTMLDivElement>(null);
  const motionRef = useRef<CursorMotion | null>(null);
  const editorRef = useRef<NonNullable<EditorInstance> | null>(null);

  const assetRoot = noteAssetRoot(vaultRoot, note);
  const extensions = useMemo(() => createExtensions(assetRoot), [assetRoot]);
  const backlinkRel = note.kind === "vault" && !content.missing ? note.rel : null;
  const backlinks = useBacklinks(backlinkRel, active);

  const { publishAgentSelection, askAIAboutSelection } = useAgentBridge({
    noteRef,
    activeRef,
    vaultRoot,
  });

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
          const image = Array.from(event.clipboardData?.files ?? []).find((f) =>
            f.type.startsWith("image/"),
          );
          if (image && editor) {
            event.preventDefault();
            insertImageFile({
              editor,
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
          if (!image) return false;
          event.preventDefault();
          const coords = view.posAtCoords({ left: event.clientX, top: event.clientY });
          const position = coords?.pos ?? view.state.selection.from;
          insertImageFile({
            editor,
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
        // usePaneLinkClicks) so the anchor's native navigation is stopped
        // before anything — including the webview — can act on it.
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

  const { reloadIfChanged, updateActiveOutline, selectOutlineItem } = useNoteContentEffects({
    editor,
    note,
    active,
    language,
    markdownSource,
    scrollRef,
    content,
  });

  const { askAI: _askAI } = { askAI: undefined };
  void _askAI;

  // One animated caret per live editor, created only while it can actually be
  // seen (active tab, rich-text mode) and when the setting is on. Recreating
  // on toggle is cheap and keeps the disabled path allocation-free.
  const motionEnabled =
    cursorAnimation && active && !markdownSource && !content.missing;
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

  useAgentSelectionSync({
    editor,
    note,
    active,
    markdownSource,
    publishAgentSelection,
  });

  const titleFocusReq = useTabs((s) => s.titleFocusReq);
  // Link clicks + scroll/reveal requests (see usePaneRequests).
  usePaneLinkClicks({ scrollRef, noteRef });
  usePaneRequests({
    editor,
    active,
    markdownSource,
    loadNonce: content.loadNonce,
    currentKey,
    scrollRef,
    savedScroll: content.savedScroll,
    loadedKey: content.loadedKey,
  });

  const [historyOpen, setHistoryOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const saveTemplateOpen = useUi((s) => s.saveTemplateOpen);
  const [findWithReplace, setFindWithReplace] = useState(false);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    if (editor && !editor.isDestroyed) {
      dispatchFind(editor.view, { query: "" });
      editor.commands.focus();
    }
  }, [editor]);

  // ⌘F / ⌘⌥F open the find bar over the rendered editor; the markdown source
  // pane uses CodeMirror's own search panel instead.
  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (markdownSource) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindWithReplace(event.altKey);
        setFindOpen(true);
      } else if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        closeFind();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, findOpen, markdownSource, closeFind]);

  const handleRestored = useCallback(() => {
    content.lastSaved.current = "";
    content.pending.current = null;
    void reloadIfChanged();
  }, [content, reloadIfChanged]);

  // Keep the brokenLinks plugin's known-rels set in sync with the tree.
  const tree = useVault((s) => s.tree);
  useEffect(() => {
    if (!editor) return;
    const rels = new Set(flattenNotes(tree).map((n) => n.rel.toLowerCase()));
    let cancelled = false;
    const dispatch = (attempt = 0) => {
      if (cancelled) return;
      try {
        editor.view.dispatch(editor.state.tr.setMeta(brokenLinksKey, rels));
      } catch {
        // The view can mount after this effect fires; retry briefly.
        if (attempt < 20) setTimeout(() => dispatch(attempt + 1), 50);
      }
    };
    dispatch();
    return () => {
      cancelled = true;
    };
  }, [editor, tree]);

  // Insert a page link to `rel` over the slash range, as a link mark whose
  // href is the note path (serializes to `[title](rel)` markdown on save).
  const insertNoteLink = (rel: string, title: string, heading?: string) => {
    if (!editor || !linkPicker) return;
    const { text: label, href } = noteLinkParts(rel, title, heading);
    editor
      .chain()
      .focus()
      .deleteRange(linkPicker.range)
      .insertContent([
        {
          type: "text",
          text: label,
          marks: [{ type: "link", attrs: { href } }],
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
        content.savedScroll.current = event.currentTarget.scrollTop;
        updateActiveOutline();
      }}
    >
      <div className="note-page relative">
        {content.missing ? (
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
        <div className={cx(content.missing && "hidden")}>
          {markdownSource ? (
            <Suspense fallback={null}>
              <MarkdownSourceEditor
                value={content.rawText}
                onSelectionChange={publishAgentSelection}
                onChange={(text) => {
                  content.setRawText(text);
                  const { frontmatter: fm, body } = splitFrontmatter(text);
                  frontmatter.current = fm;
                  content.setProperties(parseFrontmatter(fm));
                  pending.current = body;
                  setSaveState("saving");
                  debouncedPersist(body);
                  setWords(countWords(body, languageRef.current));
                }}
              />
            </Suspense>
          ) : (
            <>
              <NoteProperties properties={content.properties} />
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
        {active && !markdownSource && findOpen && editor && (
          <FindReplaceBar
            editor={editor}
            withReplace={findWithReplace}
            onClose={closeFind}
          />
        )}
        {saveTemplateOpen && active && (
          <SaveTemplateDialog
            defaultName={noteTitle(note)}
            getContent={async () => {
              await content.flushCurrent();
              return markdownSource
                ? content.rawText
                : joinFrontmatter(frontmatter.current, editor?.getMarkdown() ?? "");
            }}
            onClose={() => useUi.getState().setSaveTemplateOpen(false)}
          />
        )}
        {historyOpen && note.kind === "vault" && (
          <NoteHistory
            rel={note.rel}
            onClose={() => setHistoryOpen(false)}
            flushCurrent={content.flushCurrent}
            onRestored={handleRestored}
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
            "pointer-events-none fixed bottom-3 right-4 flex items-center gap-1 text-[11px] tabular-nums text-faint transition-opacity duration-300",
            (content.words === 0 || content.missing) && "opacity-0",
          )}
        >
          {note.kind === "vault" && !content.missing && (
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              title={t("history.title")}
              className="pointer-events-auto rounded p-1 transition-colors duration-100 hover:text-muted"
            >
              <History size={13} strokeWidth={2} />
            </button>
          )}
          <span>{t(content.words === 1 ? "editor.word" : "editor.words", { count: content.words })}</span>
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
    {active && editor && !content.missing && !markdownSource && (
      <ArticleOutline
        items={content.outlineItems}
        activeKey={content.activeOutlineKey}
        onSelect={selectOutlineItem}
      />
    )}
    </>
  );
});

type EditorInstance = ReturnType<typeof useEditor>;

