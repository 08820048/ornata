import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ThumbPage } from "@/components/library/NotePreview";
import { loadNoteHead } from "@/components/library/useNoteHeads";
import { parentOf } from "@/lib/library";
import { PREVIEW_DELAY, previewPlace, previewTarget } from "@/lib/linkPreview";
import type { NoteRef, TreeNode } from "@/lib/types";
import { useVault } from "@/stores/vault";

interface Shown {
  node: TreeNode;
  text: string;
  left: number;
  top: number;
}

/**
 * Resting the pointer on a link to another note shows that note's first page
 * in a small card. It never takes the pointer: moving away, scrolling, clicking
 * or typing puts it away.
 */
export function LinkPreview({
  scrollRef,
  noteRef,
  active,
}: {
  scrollRef: RefObject<HTMLDivElement | null>;
  noteRef: RefObject<NoteRef>;
  active: boolean;
}) {
  const [shown, setShown] = useState<Shown | null>(null);

  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !active) return;
    let timer = 0;
    let over: Element | null = null;
    const hide = () => {
      window.clearTimeout(timer);
      over = null;
      setShown(null);
    };
    const onOver = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest?.("a[href]") ?? null;
      if (anchor === over) return;
      hide();
      if (!anchor || event.buttons) return;
      const node = previewTarget(anchor.getAttribute("href"), useVault.getState().tree, noteRef.current);
      if (!node) return;
      over = anchor;
      timer = window.setTimeout(() => {
        void loadNoteHead(node)
          .then((text) => {
            // The pointer may have left while the text was being read.
            if (over !== anchor || !anchor.isConnected) return;
            const place = previewPlace(anchor.getBoundingClientRect(), {
              width: window.innerWidth,
              height: window.innerHeight,
            });
            setShown({ node, text, ...place });
          })
          .catch(() => undefined);
      }, PREVIEW_DELAY);
    };
    root.addEventListener("mouseover", onOver);
    root.addEventListener("mouseleave", hide);
    root.addEventListener("scroll", hide, { passive: true });
    root.addEventListener("mousedown", hide);
    root.addEventListener("keydown", hide);
    return () => {
      hide();
      root.removeEventListener("mouseover", onOver);
      root.removeEventListener("mouseleave", hide);
      root.removeEventListener("scroll", hide);
      root.removeEventListener("mousedown", hide);
      root.removeEventListener("keydown", hide);
    };
  }, [scrollRef, noteRef, active]);

  if (!shown) return null;
  const folder = parentOf(shown.node.rel);
  return createPortal(
    <div className="link-preview" role="tooltip" style={{ left: shown.left, top: shown.top }}>
      <ThumbPage
        title={shown.node.name}
        text={shown.text}
        pad={16}
        lead={folder ? <div className="link-preview-path">{folder}</div> : undefined}
      />
    </div>,
    document.body,
  );
}
