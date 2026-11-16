import { useEffect, useState } from "react";
import { ipc } from "@/lib/ipc";
import type { TreeNode } from "@/lib/types";

/** Preview text by rel, with the mtime it was read at. Lives for the session. */
const cache = new Map<string, { ms: number; text: string }>();

/**
 * Preview text for `notes`, read in one batch and re-read only for notes
 * whose modification time moved. Nothing is fetched while `enabled` is off
 * (the library tab hidden), so typing in a note never triggers reads here.
 */
export function useNoteHeads(notes: TreeNode[], enabled: boolean): (rel: string) => string | null {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const stale = notes.filter((node) => cache.get(node.rel)?.ms !== node.modifiedMs);
    if (!stale.length) return;
    let cancelled = false;
    void ipc
      .noteHeads(stale.map((node) => node.rel))
      .then((heads) => {
        if (cancelled) return;
        const found = new Map((heads ?? []).map((head) => [head.rel, head.text]));
        for (const node of stale) {
          cache.set(node.rel, { ms: node.modifiedMs, text: found.get(node.rel) ?? "" });
        }
        setTick((tick) => tick + 1);
      })
      .catch(() => {
        // Previews are decoration: a failed read leaves the cards blank.
      });
    return () => {
      cancelled = true;
    };
  }, [notes, enabled]);

  return (rel) => cache.get(rel)?.text ?? null;
}
