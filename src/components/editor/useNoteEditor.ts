import { useEditor, type Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Slice } from "@tiptap/pm/model";
import { imageFileFromDataTransfer, insertImageFile } from "./insertImage";
import { CursorMotion } from "./cursorMotion";
import { createExtensions } from "./extensions";
import { parseMarkdownSlice } from "./markdownPaste";
import { TextSelection } from "@tiptap/pm/state";
import { imageTarget, type ImageTarget } from "./imageMenu";
import { imageMarkdown } from "./imageExtras";
import { wikiToMarkdown } from "@/lib/noteLinks";
import { noteAssetRoot } from "@/lib/noteRef";
import { flattenNotes } from "@/lib/tree";
import type { NoteRef } from "@/lib/types";
import { useVault } from "@/stores/vault";
import { useUi } from "@/stores/ui";
import type { MenuPosition } from "@/components/ui/ContextMenu";
import type { NoteContent } from "./useNoteContent";
import { DIRTY } from "./useNoteContent";

export interface ImageSourceOverlay {
  pos: number;
  src: string;
  markdown: string;
  top: number;
  left: number;
  width: number;
}

/**
 * Creates and owns the pane's Tiptap editor: the extension set, all
 * editorProps handlers, and the animated caret overlay. The props closures
 * are captured once (useEditor applies options only when its deps change),
 * so every handler reads mutable refs — editorRef/noteRef/content refs —
 * never render-time values.
 */
export function useNoteEditor({
  note,
  active,
  markdownSource,
  missing,
  cursorAnimation,
  content,
  vaultRoot,
  scrollRef,
  pageRef,
  setImageSource,
  setImageMenu,
  setTableMenu,
}: {
  note: NoteRef;
  active: boolean;
  markdownSource: boolean;
  missing: boolean;
  cursorAnimation: boolean;
  content: NoteContent;
  vaultRoot: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  pageRef: RefObject<HTMLDivElement | null>;
  setImageSource: (value: ImageSourceOverlay | null) => void;
  setImageMenu: (value: { position: MenuPosition; target: ImageTarget } | null) => void;
  setTableMenu: (value: MenuPosition | null) => void;
}) {
  const {
    noteRef,
    pending,
    serialize,
    takePending,
    swapping,
    syncOutline,
    debouncedPersist,
    updateSlashMenu,
  } = content;
  const setSaveState = useUi((s) => s.setSaveState);
  const editorRef = useRef<Editor | null>(null);
  const motionRef = useRef<CursorMotion | null>(null);

  const assetRoot = noteAssetRoot(vaultRoot, note);
  const extensions = useMemo(() => createExtensions(assetRoot), [assetRoot]);

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
        clipboardTextParser(text: string) {
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
            title?: string | null;
            vaultSrc?: string | null;
          };
          const src = attrs.vaultSrc ?? attrs.src ?? "";
          setImageSource({
            pos: nodePos,
            src,
            // Always the ![…](…) form here, caption included; a width set by
            // dragging is kept on the node and isn't edited in this bar.
            markdown: imageMarkdown({ src, alt: attrs.alt, title: attrs.title }),
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
            // Right-click in a table cell: rows, columns, alignment.
            const cell = img instanceof Element && !(img instanceof HTMLImageElement) ? img.closest("td, th") : null;
            if (cell && view.dom.contains(cell) && view.editable) {
              // Act on the cell that was clicked, unless it is part of the selection already.
              const at = view.posAtCoords({ left: event.clientX, top: event.clientY });
              const { from, to } = view.state.selection;
              if (at && (at.pos < from || at.pos > to)) {
                view.dispatch(
                  view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(at.pos))),
                );
              }
              event.preventDefault();
              event.stopPropagation();
              setTableMenu({ x: event.clientX, y: event.clientY });
              return true;
            }
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
      onUpdate({ editor: updated }) {
        if (swapping.current) return;
        // A doc change can invalidate the popover's captured node position
        // and src (e.g. a background upload swapping the URL) — close it.
        setImageSource(null);
        // Mark dirty; the markdown is produced once per pause (see takePending).
        pending.current = DIRTY;
        setSaveState("saving");
        debouncedPersist();
        syncOutline(updated);
        updateSlashMenu(updated);
      },
      onSelectionUpdate({ editor: updated }) {
        updateSlashMenu(updated);
      },
    },
    [extensions, syncOutline],
  );
  editorRef.current = editor;

  // One animated caret per live editor, created only while it can actually be
  // seen (active tab, rich-text mode) and when the setting is on. Recreating
  // on toggle is cheap and keeps the disabled path allocation-free.
  // Let the content pipeline serialise this editor on demand, and capture
  // any unsaved edit on "destroy" — emitted while the editor still has state.
  useEffect(() => {
    if (!editor) return;
    serialize.current = () => editor.getMarkdown();
    const capture = () => {
      takePending();
    };
    editor.on("destroy", capture);
    return () => {
      // Replaced or unmounting: settle this editor's edit while it's alive.
      takePending();
      editor.off("destroy", capture);
    };
  }, [editor, serialize, takePending]);

  const motionEnabled = cursorAnimation && active && !markdownSource && !missing;
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
  }, [editor, motionEnabled, pageRef]);

  useEffect(() => {
    // Note switched within the tab: any open image source bar is stale.
    setImageSource(null);
  }, [note, setImageSource]);

  return { editor, editorRef };
}
