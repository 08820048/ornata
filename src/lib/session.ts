import { debounce } from "@/lib/utils";
import { externalNote, vaultNote } from "@/lib/noteRef";
import { ipc } from "@/lib/ipc";
import { flattenNotes } from "@/lib/tree";
import type { NoteRef, View } from "@/lib/types";
import { useTabs } from "@/stores/tabs";
import { useVault } from "@/stores/vault";

/**
 * Per-vault UI session (open tabs, active view) persisted to
 * localStorage — the Tauri webview keeps it across restarts. Scoped by vault
 * root so switching vaults restores that vault's own layout.
 */
interface Session {
  tabs: NoteRef[];
  view: View | null;
}

const storageKey = (root: string) => `ornata:session:${root}`;
const legacyStorageKey = (root: string) => `markd:session:${root}`;

function writeSession(root: string) {
  const vault = useVault.getState();
  if (!root || vault.status !== "ready") return;
  const data: Session = {
    tabs: useTabs.getState().tabs,
    view: vault.view,
  };
  try {
    localStorage.setItem(storageKey(root), JSON.stringify(data));
  } catch {
    // storage full / unavailable — non-fatal, layout just won't persist
  }
}

const saveSession = debounce(() => writeSession(useVault.getState().root), 250);

/** Reapply a vault's saved session. Call once the vault + tree are loaded. */
function parseNoteRef(value: unknown): NoteRef | null {
  if (typeof value === "string") return vaultNote(value);
  if (!value || typeof value !== "object") return null;
  const note = value as Record<string, unknown>;
  if (note.kind === "vault" && typeof note.rel === "string") {
    return vaultNote(note.rel);
  }
  if (note.kind === "external" && typeof note.path === "string") {
    return externalNote(note.path);
  }
  return null;
}

function parseView(value: unknown): View | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (raw.type === "note") {
    // Migrate pre-NoteRef sessions whose note view stored `rel` directly.
    const note = parseNoteRef(raw.note ?? raw.rel);
    return note ? { type: "note", note } : null;
  }
  return null;
}

export async function restoreSession(root: string) {
  if (!root) return;
  let data: Session | null = null;
  try {
    const raw =
      localStorage.getItem(storageKey(root)) ??
      localStorage.getItem(legacyStorageKey(root));
    data = raw ? (JSON.parse(raw) as Session) : null;
    if (raw && !localStorage.getItem(storageKey(root))) {
      localStorage.setItem(storageKey(root), raw);
    }
  } catch {
    data = null;
  }
  if (!data) return;

  const vault = useVault.getState();
  const existing = new Set(flattenNotes(vault.tree).map((n) => n.rel));
  const parsedTabs = (data.tabs ?? [])
    .map(parseNoteRef)
    .filter((note): note is NoteRef => note !== null);
  const parsedView = parseView(data.view);
  const externalPaths = [
    ...parsedTabs,
    ...(parsedView?.type === "note" ? [parsedView.note] : []),
  ]
    .filter((note) => note.kind === "external")
    .map((note) => note.path);
  let authorizedExternal = new Set<string>();
  if (externalPaths.length) {
    try {
      const notes = await ipc.authorizeExternalNotes([
        ...new Set(externalPaths),
      ]);
      authorizedExternal = new Set(notes.map((note) => note.path));
    } catch {
      // Missing or no-longer-readable external files are simply not restored.
    }
  }
  const valid = (note: NoteRef) =>
    note.kind === "vault"
      ? existing.has(note.rel)
      : authorizedExternal.has(note.path);
  // Drop tabs whose notes were deleted since last session.
  const tabs = parsedTabs.filter(valid);
  useTabs.setState({ tabs });

  const view = parsedView;
  if (view?.type === "note") {
    if (valid(view.note)) {
      if (view.note.kind === "vault") vault.expandTo(view.note.rel);
      vault.setView(view);
    } else {
      // Active note gone — fall back to the first surviving tab, else nothing.
      vault.setView(tabs[0] ? { type: "note", note: tabs[0] } : null);
    }
  } else if (view) {
    vault.setView(view);
  } else if (tabs[0]) {
    vault.setView({ type: "note", note: tabs[0] });
  }
}

let started = false;
/** Wire up change → save. Idempotent; safe to call on every mount. */
export function initSessionSync() {
  if (started) return;
  started = true;
  useTabs.subscribe((s, p) => {
    if (s.tabs !== p.tabs) saveSession();
  });
  useVault.subscribe((s, p) => {
    if (s.view !== p.view) saveSession();
  });
  // Flush any pending debounced save before the window goes away.
  window.addEventListener("beforeunload", () => {
    saveSession.cancel();
    writeSession(useVault.getState().root);
  });
}
