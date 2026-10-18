import { useVault } from "@/stores/vault";

/** Fired at open editors: "a note may have changed on disk, re-read it". Each
 *  editor reloads unless it has unsaved edits of its own (those win). */
export const NOTES_CHANGED = "ornata-agent-notes-changed";

export const notifyNotesChanged = () => window.dispatchEvent(new Event(NOTES_CHANGED));

/**
 * Something changed in the vault folder (another editor, sync, git, or an
 * agent over MCP / the command line). Refresh the tree, and let open notes
 * pick up the new text — otherwise the next autosave of a note that is open
 * here would silently write over what the agent just added.
 */
export function handleVaultChanged() {
  void useVault.getState().refreshTree();
  notifyNotesChanged();
}
