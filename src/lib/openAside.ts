import { tabOfView, vaultNote } from "@/lib/noteRef";
import type { NoteRef } from "@/lib/types";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/** Show `note` beside the focused one; with nothing splittable open (empty
 *  workspace, graph focused) it just opens normally. */
export function openNoteAside(note: NoteRef) {
  const vault = useVault.getState();
  if (note.kind === "vault") vault.expandTo(note.rel);
  const focused = vault.view;
  if (focused) useTabs.getState().openAside(tabOfView(focused), note);
  if (!useTabs.getState().split) vault.setView({ type: "note", note });
}

export const openRelAside = (rel: string) => openNoteAside(vaultNote(rel));
