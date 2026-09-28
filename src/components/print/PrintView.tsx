import { useEditor } from "@tiptap/react";
import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { EditorContent } from "@tiptap/react";
import { createExtensions } from "@/components/editor/extensions";
import { renderTheme } from "@/lib/theme";
import { ipc } from "@/lib/ipc";
import { headingsOf, outlineFromHeadings } from "@/lib/pdfOutline";

interface PrintPayload {
  id: number;
  markdown: string;
  vaultRoot: string;
  /** Silent PDF: the user's page margin, applied via `@page` in place of
   *  the CSS inset (null for print-dialog, HTML and clipboard exports). */
  pageMarginMm: number | null;
}

/**
 * The hidden print window: renders a note through the same editor pipeline
 * (images, KaTeX, Mermaid, Shiki), signals readiness to the backend, which
 * either opens the system print sheet (PDF) or serializes this DOM into a
 * standalone HTML file / clipboard payload.
 */
export function PrintView() {
  const [job, setJob] = useState<PrintPayload | null>(null);
  const [vaultRoot, setVaultRoot] = useState("");
  // Prints must always be light — a dark-theme page prints white-on-white.
  // Render-only: the shared theme cache must keep the user's real choice.
  useEffect(() => {
    renderTheme("light");
  }, []);

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
    const apply = (payload: PrintPayload | null) => {
      if (cancelled || !payload || typeof payload.markdown !== "string") return;
      setVaultRoot(payload.vaultRoot);
      setJob(payload);
    };
    // The create-and-emit races the page: the event often fires before this
    // listener exists. Reading the staged job covers that first export.
    void ipc.currentPrintJob().then(apply).catch(() => undefined);
    listen<PrintPayload>("ornata-print", ({ payload }) => apply(payload))
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
    if (!job || !editor || editor.isDestroyed) return;
    let cancelled = false;
    const jobId = job.id;
    editor.commands.setContent(job.markdown, { contentType: "markdown" });
    // Hand control back to the backend once the print sheet closes.
    const onAfterPrint = () => void ipc.hidePrintWindow();
    window.addEventListener("afterprint", onAfterPrint);

    void (async () => {
      // Images load through the asset protocol asynchronously; wait until
      // every <img> has settled (bounded), then hand over the DOM.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (cancelled) return;
        const images = Array.from(editor.view.dom.querySelectorAll("img"));
        if (images.every((img) => img.complete)) break;
        await new Promise((resolve) => setTimeout(resolve, 125));
      }
      await document.fonts.ready.catch(() => undefined);
      // Mermaid diagrams render asynchronously in a node view; wait (bounded)
      // until no block is still showing its rendering placeholder.
      for (let attempt = 0; attempt < 16; attempt += 1) {
        if (cancelled) return;
        const rendering = editor.view.dom.querySelectorAll(
          ".mermaid-preview .mermaid-rendering",
        );
        if (rendering.length === 0) break;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (cancelled) return;
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
        await ipc.printViewReady({
          id: jobId,
          bodyHtml,
          pageCss: css.join("\n"),
          headings: outlineFromHeadings(headingsOf(editor.view.dom)),
        });
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("afterprint", onAfterPrint);
    };
  }, [job, editor]);

  return (
    <div className="bg-white">
      {/* The app shell locks html/body/#root to the window and hides overflow.
          Left in place, print and the saved HTML keep only the visible slice. */}
      <style>{PRINT_UNCLIP}</style>
      {job?.pageMarginMm != null && <style>{pageMargins(job.pageMarginMm)}</style>}
      <EditorContent editor={editor} />
    </div>
  );
}

/** Silent PDF export: WebKit paginates from `@page`, so the user's margin
 *  goes there — on every page, all four sides — and the element's own inset
 *  (which only padded the first and last page vertically) is dropped. */
function pageMargins(mm: number) {
  return `
  .prose-note { padding: 0 !important; }
  @page { margin: ${mm}mm; }
`;
}

const PRINT_UNCLIP = `
  html, body, #root {
    height: auto !important;
    overflow: visible !important;
    background: #fff !important;
  }
  body {
    background: #fff !important;
  }
  /* Inset lives on the document itself. WKWebView's print sheet often
     ignores @page margin, which left the note flush with the page edge. */
  .prose-note {
    box-sizing: border-box !important;
    padding: 12mm 16mm 16mm !important;
  }
  @page {
    margin: 12mm 14mm;
  }
  @media print {
    html, body, #root {
      height: auto !important;
      overflow: visible !important;
      background: #fff !important;
    }
  }
`;
