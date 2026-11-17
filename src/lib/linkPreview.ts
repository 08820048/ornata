import { hrefToRel } from "@/lib/noteLinks";
import { flattenNotes } from "@/lib/tree";
import type { NoteRef, TreeNode } from "@/lib/types";

/** Size of the link preview card; `.link-preview` in styles.css matches. */
const WIDTH = 340;
const HEIGHT = 230;
/** How long the pointer rests on a link before its preview appears. */
export const PREVIEW_DELAY = 350;

/** Where the card goes for a link at `rect`: under it, or above when there is no room. */
export function previewPlace(
  rect: { left: number; top: number; bottom: number },
  viewport: { width: number; height: number },
): { left: number; top: number } {
  const left = Math.min(Math.max(8, rect.left), viewport.width - WIDTH - 8);
  const below = rect.bottom + 8;
  const top = below + HEIGHT > viewport.height - 8 ? Math.max(8, rect.top - HEIGHT - 8) : below;
  return { left, top };
}

/** The note a link's href points at, if it exists and isn't the note being read. */
export function previewTarget(href: string | null, tree: TreeNode[], current: NoteRef): TreeNode | null {
  if (!href || /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(href)) return null;
  const rel = hrefToRel(href)?.toLowerCase();
  if (!rel) return null;
  if (current.kind === "vault" && current.rel.toLowerCase() === rel) return null;
  return flattenNotes(tree).find((node) => node.rel.toLowerCase() === rel) ?? null;
}
