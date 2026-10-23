import { EditorContent } from "@tiptap/react";
import {
  IconHistory,
} from "@tabler/icons-react";
import { lazy, memo, Suspense, useRef, useState } from "react";
import {
  joinFrontmatter,
  parseFrontmatter,
  splitFrontmatter,
} from "@/lib/frontmatter";
import { noteTitle } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useLocale, useT } from "@/stores/locale";
import { ArticleOutline } from "./ArticleOutline";
import { useCursorPosition } from "./cursorPosition";
import { FindReplaceBar } from "./FindReplaceBar";
import { NoteHistory } from "./NoteHistory";
import { SaveTemplateDialog } from "./SaveTemplateDialog";
import { NoteLinkPicker } from "./NoteLinkPicker";
import { NoteProperties } from "./NoteProperties";
import { SelectionMenu } from "./SelectionMenu";
import { SlashMenu } from "./SlashMenu";
import { usePaneLinkClicks, usePaneRequests } from "./usePaneRequests";
import {
  countWords,
  useNoteContentEffects,
  useNoteContentState,
} from "./useNoteContent";
import { useNoteEditor, type ImageSourceOverlay } from "./useNoteEditor";
import { usePaneDialogs } from "./usePaneDialogs";
import { TitleInput } from "./TitleInput";
import { BacklinksBadge, NoteBacklinks, useBacklinks } from "./NoteBacklinks";
import { UnlinkedMentions } from "./UnlinkedMentions";
import { LocalGraph } from "@/components/graph/LocalGraph";
import { ImageSourcePopover } from "./ImageSourcePopover";
import { imageMenuItems, type ImageTarget } from "./imageMenu";
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
 * useNoteContent, navigation side
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
  const focusMode = useUi((s) => s.focusMode);
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
    languageRef,
    frontmatter,
    pending,
    debouncedPersist,
    flushThen,
  } = content;

  const [imageSource, setImageSource] = useState<ImageSourceOverlay | null>(null);
  const [imageMenu, setImageMenu] = useState<{
    position: MenuPosition;
    target: ImageTarget;
  } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const backlinksRef = useRef<HTMLElement>(null);
  const [backlinksOpen, setBacklinksOpen] = useState(true);
  // Content box for the animated caret overlay (scrolls with the text).
  const pageRef = useRef<HTMLDivElement>(null);

  const backlinkRel = note.kind === "vault" && !content.missing ? note.rel : null;
  const backlinks = useBacklinks(backlinkRel, active);


  const { editor } = useNoteEditor({
    note,
    active,
    markdownSource,
    missing: content.missing,
    cursorAnimation,
    content,
    vaultRoot,
    scrollRef,
    pageRef,
    setImageSource,
    setImageMenu,
  });

  const { reloadIfChanged, updateActiveOutline, selectOutlineItem } = useNoteContentEffects({
    editor,
    note,
    active,
    language,
    markdownSource,
    scrollRef,
    content,
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
  const {
    findOpen,
    findWithReplace,
    historyOpen,
    setHistoryOpen,
    closeFind,
    handleRestored,
    linkPicker,
    setLinkPicker,
    insertNoteLink,
  } = usePaneDialogs({
      editor,
      active,
      markdownSource,
      content,
      reloadIfChanged,
    });

  const saveTemplateOpen = useUi((s) => s.saveTemplateOpen);
  const cursor = useCursorPosition(editor, active && !markdownSource);

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
              <LocalGraph rel={backlinkRel} active={active} />
              <UnlinkedMentions rel={backlinkRel} onLinked={backlinks.refresh} />
            </footer>
          )}
          {active && editor && !markdownSource && (
            <SelectionMenu editor={editor} />
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
            "pointer-events-none fixed z-10 flex items-center gap-1 text-[11px] tabular-nums text-faint transition-opacity duration-300",
            // Sit inside the status bar's h-7 strip, left of the MCP plug and settings icons;
            // z-10 keeps it above the (positioned) status bar, which paints its own background.
            focusMode ? "bottom-3 right-4" : "bottom-0 h-7 right-[72px]",
            content.missing && "opacity-0",
          )}
        >
          {cursor && !markdownSource && (
            <span className="mr-2">{t("editor.cursor", { line: cursor.line, col: cursor.col })}</span>
          )}
          <span className={cx("flex items-center gap-1", content.words === 0 && "opacity-0")}>
            {note.kind === "vault" && !content.missing && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                title={t("history.title")}
                className="pointer-events-auto rounded p-1 transition-colors duration-100 hover:text-muted"
              >
                <IconHistory size={13} stroke={2} />
              </button>
            )}
            <span>{t(content.words === 1 ? "editor.word" : "editor.words", { count: content.words })}</span>
          </span>
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


