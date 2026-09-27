import type { Editor } from "@tiptap/react";
import { useCallback, useEffect, useState } from "react";
import { brokenLinksKey } from "./brokenLinks";
import { dispatchFind } from "./findReplace";
import type { LinkPickerState } from "./NoteLinkPicker";
import { noteLinkParts } from "@/lib/noteLinks";
import { flattenNotes } from "@/lib/tree";
import { useVault } from "@/stores/vault";

/**
 * Pane-level dialog state and its window/global side effects: the find bar
 * (⌘F / ⌘⌥F + Escape), history and save-template open flags, the broken-link
 * plugin's known-rels sync, and the restore-completed callback wiring.
 */
export function usePaneDialogs({
  editor,
  active,
  markdownSource,
  content,
  reloadIfChanged,
}: {
  editor: Editor | null;
  active: boolean;
  markdownSource: boolean;
  content: {
    lastSaved: React.RefObject<string>;
    pending: React.RefObject<string | null>;
  };
  reloadIfChanged: () => Promise<void>;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [findWithReplace, setFindWithReplace] = useState(false);
  const [linkPicker, setLinkPicker] = useState<LinkPickerState | null>(null);

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

  // Insert a page link (optionally to a heading) over the slash range, as a
  // link mark whose href is the note path (serializes to `[title](rel)`).
  const insertNoteLink = useCallback(
    (rel: string, title: string, heading?: string) => {
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
    },
    [editor, linkPicker],
  );

  return {
    findOpen,
    findWithReplace,
    historyOpen,
    setHistoryOpen,
    closeFind,
    handleRestored,
    linkPicker,
    setLinkPicker,
    insertNoteLink,
  };
}
