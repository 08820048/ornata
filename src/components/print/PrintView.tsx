import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { EditorContent } from "@tiptap/react";
import { createExtensions } from "@/components/editor/extensions";
import { ipc } from "@/lib/ipc";

interface PrintPayload {
  markdown: string;
  vaultRoot: string;
}

/**
 * The hidden print window: renders a note through the same editor pipeline
 * (images, KaTeX, Mermaid, Shiki), signals readiness to the backend, which
 * either opens the system print sheet (PDF) or serializes this DOM into a
 * standalone HTML file / clipboard payload.
 */
export function PrintView() {
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [vaultRoot, setVaultRoot] = useState("");

  const assetRoot = useMemo(() => vaultRoot, [vaultRoot]);
  const extensions = useMemo(() => createExtensions(assetRoot), [assetRoot]);
  const editor = useEditor(
    {
      content: "",
      contentType: "markdown",
      editable: false,
      extensions,
      editorProps: {
        attributes: { class: "prose-note" },
      },
    },
    [extensions],
  );

  useEffect(() => {
    let stop: (() => void) | undefined;
    let cancelled = false;
    listen<PrintPayload>("ornata-print", ({ payload }) => {
      if (cancelled) return;
      setVaultRoot(payload.vaultRoot);
      setMarkdown(payload.markdown);
    })
      .then((unlisten) => {
        if (cancelled) unlisten();
        else stop = unlisten;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      stop?.();
    };
  }, []);

  useEffect(() => {
    if (markdown === null || !editor || editor.isDestroyed) return;
    let cancelled = false;
    editor.commands.setContent(markdown, { contentType: "markdown" });
    void (async () => {
      // Images load through the asset protocol asynchronously; wait until
      // every <img> has settled (bounded), then hand over the DOM.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const images = Array.from(editor.view.dom.querySelectorAll("img"));
        if (images.every((img) => img.complete)) break;
        await new Promise((resolve) => setTimeout(resolve, 125));
      }
      await document.fonts.ready.catch(() => undefined);
      const bodyHtml = editor.view.dom.outerHTML;
      const css: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            css.push(rule.cssText);
          }
        } catch {
          // cross-origin sheet — skip
        }
      }
      if (!cancelled) {
        await ipc.printViewReady({ bodyHtml, pageCss: css.join("\n") });
      }
    })();
  }, [markdown, editor]);

  return (
    <div className="min-h-screen bg-white">
      <EditorContent editor={editor} />
    </div>
  );
}
