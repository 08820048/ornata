import type { Editor } from "@tiptap/react";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { parseDailyRel } from "@/lib/dateLinks";
import { hrefToRel } from "@/lib/noteLinks";
import { vaultNote } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { flattenNotes } from "@/lib/tree";
import { revealHeading, revealText } from "./revealText";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * Per-pane navigation side effects: link clicks on the pane's DOM, and the
 * scroll/reveal requests that arrive through the tabs store. All state access
 * goes through the refs/stores passed in — no note content logic lives here.
 */

/** Handle link clicks in the capture phase, before the anchor's native
 *  navigation (which the webview would otherwise turn into a browser open).
 *  Scoped to the pane's DOM, so exactly one handler runs per click. The refs
 *  are stable, so binding once is safe; `.current` reads stay live. */
export function usePaneLinkClicks(input: {
  scrollRef: RefObject<HTMLDivElement | null>;
  noteRef: RefObject<NoteRef>;
}) {
  const { scrollRef, noteRef } = input;
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
        const exists = flattenNotes(vault.tree).some(
          (n) => n.rel.toLowerCase() === targetRel.toLowerCase(),
        );
        let openRel = targetRel;
        const daily = exists ? null : parseDailyRel(targetRel);
        if (daily) {
          // A missing daily note is created from the daily template.
          await vault.openDailyNote(daily);
          return;
        }
        if (!exists) {
          // Broken link — clicking creates the note it points at.
          const created = await vault.createNoteAtRel(targetRel);
          if (!created) return;
          openRel = created;
        }
        const target = vaultNote(openRel);
        vault.expandTo(openRel);
        vault.setView({ type: "note", note: target });
        const hashIndex = href.indexOf("#");
        if (hashIndex !== -1) {
          let heading = href.slice(hashIndex + 1);
          try {
            heading = decodeURIComponent(heading);
          } catch {
            // Malformed escape — the raw text is still the best guess.
          }
          useTabs.getState().requestHeadingReveal(target, heading);
        } else {
          // Links point at the note as a whole — open it at the top, even if
          // the target tab was already scrolled down.
          useTabs.getState().requestScrollTop(target);
        }
      }
    };
    root.addEventListener("click", onClick, true);
    return () => root.removeEventListener("click", onClick, true);
  }, [scrollRef, noteRef]);
}

/** Scroll/reveal requests for one pane. Consumes each request once, gated on
 *  the pane being visible and its content loaded. */
export function usePaneRequests(input: {
  editor: Editor | null;
  active: boolean;
  markdownSource: boolean;
  loadNonce: number;
  currentKey: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  savedScroll: RefObject<number>;
  loadedKey: RefObject<string | null>;
}) {
  const { editor, active, markdownSource, loadNonce, currentKey, scrollRef, savedScroll, loadedKey } =
    input;

  // Honor a scroll-to-top request for this note (fired when opened via a link).
  const scrollTopReq = useTabs((s) => s.scrollTopReq);
  useEffect(() => {
    if (!scrollTopReq || scrollTopReq.key !== currentKey) return;
    savedScroll.current = 0;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [scrollTopReq, currentKey, savedScroll, scrollRef]);

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
  }, [editor, active, markdownSource, loadNonce, revealReq, currentKey, loadedKey, savedScroll, scrollRef]);

  // Honor a heading-reveal request (a `path.md#标题` link was clicked): same
  // visibility gates as the reveal request — the scroll only means something
  // once this pane is visible and its content loaded.
  const headingRevealReq = useTabs((s) => s.headingRevealReq);
  const revealedHeadingNonce = useRef(0);
  useEffect(() => {
    if (!editor || !active || markdownSource || loadNonce === 0) return;
    if (!headingRevealReq || headingRevealReq.key !== currentKey) return;
    if (loadedKey.current !== currentKey) return;
    if (revealedHeadingNonce.current === headingRevealReq.nonce) return;
    revealedHeadingNonce.current = headingRevealReq.nonce;
    if (revealHeading(editor, headingRevealReq.heading) && scrollRef.current) {
      savedScroll.current = scrollRef.current.scrollTop;
    } else {
      // Fragment matched no heading — land at the top so the miss is visible
      // instead of the pane silently staying wherever it was.
      savedScroll.current = 0;
      if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }
  }, [editor, active, markdownSource, loadNonce, headingRevealReq, currentKey, loadedKey, savedScroll, scrollRef]);
}
