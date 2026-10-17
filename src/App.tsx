import { lazy, Suspense, useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { closeTab } from "@/components/editor/TabBar";
import { AppToaster } from "@/components/ui/AppToaster";
import { toast } from "sonner";
import { Welcome } from "@/components/welcome/Welcome";
import { initSessionSync, restoreSession } from "@/lib/session";
import { useSettingsBridge } from "@/lib/useSettingsBridge";
import { ipc } from "@/lib/ipc";
import { tabOfView } from "@/lib/noteRef";
import { toastExported } from "@/lib/exportToast";
import type { ExternalNote } from "@/lib/types";
import { activeDir, useVault } from "@/stores/vault";
import { useUi } from "@/stores/ui";
import { useTabs } from "@/stores/tabs";
import { useUpdater } from "@/stores/updater";
import { t as translate, useLocale, useT } from "@/stores/locale";
import { writeRich } from "@/lib/clipboard";
import { goBack, goForward } from "@/lib/navigate";
import { focusNextPane, focusPaneNumber } from "@/lib/panes";
import { McpDialog } from "@/components/mcp/McpDialog";
import { TasksDialog } from "@/components/tasks/TasksDialog";
import { TagsDialog } from "@/components/tasks/TagsDialog";
import { UnusedAssetsDialog } from "@/components/assets/UnusedAssetsDialog";

const AppShell = lazy(() =>
  import("@/components/layout/AppShell").then((module) => ({
    default: module.AppShell,
  })),
);
const CommandPalette = lazy(() =>
  import("@/components/palette/CommandPalette").then((module) => ({
    default: module.CommandPalette,
  })),
);

export default function App() {
  const status = useVault((s) => s.status);
  const root = useVault((s) => s.root);
  const startup = useVault((s) => s.startup);
  const refreshTree = useVault((s) => s.refreshTree);
  const t = useT();

  useSettingsBridge();

  useEffect(() => {
    initSessionSync();
    void (async () => {
      await useLocale.getState().startup();
      await startup();
      // Look for an app update in the background; surfaces in the sidebar.
      await useUpdater.getState().check();
    })();
  }, [startup]);

  // Restore the saved tabs / view / filters once a vault is loaded (and again
  // whenever the active vault changes).
  useEffect(() => {
    if (status !== "ready" || !root) return;
    let cancelled = false;
    let restored = false;
    let stopListening: (() => void) | undefined;
    const queued: ExternalNote[] = [];

    void (async () => {
      try {
        stopListening = await listen<ExternalNote[]>(
          "open-markdown",
          ({ payload }) => {
            if (!restored) queued.push(...payload);
            else {
              void ipc
                .takeOpenedExternalNotes()
                .then((notes) => useVault.getState().openExternalNotes(notes))
                .catch(() => useVault.getState().openExternalNotes(payload));
            }
          },
        );
      } catch {
        // Session and queued Finder files can still restore without events.
      }
      if (cancelled) {
        stopListening?.();
        return;
      }
      await restoreSession(root);
      await useVault.getState().loadPinned();
      const opened = await ipc.takeOpenedExternalNotes().catch(() => []);
      restored = true;
      if (!cancelled) {
        useVault.getState().openExternalNotes([...queued, ...opened]);
      }
    })();

    return () => {
      cancelled = true;
      stopListening?.();
    };
  }, [status, root]);

  // Rich-text copy round-trips through the print window (which owns the
  // rendered HTML); the main window holds clipboard focus, so the write
  // happens here.
  useEffect(() => {
    if (status !== "ready") return;
    let stopRich: (() => void) | undefined;
    let stopDone: (() => void) | undefined;
    let cancelled = false;
    void (async () => {
      try {
        const unRich = await listen<{ html: string; plain: string }>(
          "ornata-rich-text",
          ({ payload }) => {
            void writeRich(payload.html, payload.plain)
              .then(() => toast(t("toast.richCopied")))
              .catch((err) =>
                toast.error(err instanceof Error ? err.message : String(err)),
              );
          },
        );
        const unDone = await listen<string>("ornata-export-done", (event) => {
          toastExported(event.payload);
        });
        const unFailed = await listen<string>("ornata-export-failed", (event) => {
          toast.error(event.payload);
        });
        if (cancelled) {
          unRich();
          unDone();
          unFailed();
          return;
        }
        stopRich = unRich;
        stopDone = () => {
          unDone();
          unFailed();
        };
      } catch {
        // Event listeners unavailable — export still works, minus toasts.
      }
    })();
    return () => {
      cancelled = true;
      stopRich?.();
      stopDone?.();
    };
  }, [status, t]);

  // Quick capture (⌘⌥J) hands its text to this window — the single writer
  // of the vault — which appends it to Inbox.md.
  useEffect(() => {
    if (status !== "ready") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    listen<string>("ornata-quick-capture", ({ payload }) => {
      // Rust emits a bare string (see quick_capture::submit_quick_capture).
      void useVault.getState().appendQuickCapture(payload);
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
  }, [status]);

  // Pick up edits made outside the app when the window regains focus. The
  // Rust watcher (ornata-vault-changed) covers live changes while focused;
  // this catches anything missed when focus was elsewhere entirely.
  useEffect(() => {
    const onFocus = () => refreshTree();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshTree]);

  // The backend watches the vault folder and asks for a tree refresh when
  // files change outside the app (editors, iCloud sync, git).
  useEffect(() => {
    if (status !== "ready") return;
    let stop: (() => void) | undefined;
    let cancelled = false;
    listen("ornata-vault-changed", () => {
      useVault.getState().refreshTree();
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
  }, [status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const ui = useUi.getState();
      const vault = useVault.getState();

      if (!event.shiftKey && /^[1-4]$/.test(event.key) && useTabs.getState().split) {
        event.preventDefault();
        focusPaneNumber(Number(event.key));
      } else if (!event.shiftKey && event.key === "." && useTabs.getState().split) {
        event.preventDefault();
        focusNextPane();
      } else if (event.shiftKey && event.key.toLowerCase() === "f") {
        event.preventDefault();
        ui.toggleFocusMode();
        if (useUi.getState().focusMode) toast(translate("focus.entered"));
      } else if (event.shiftKey && event.key.toLowerCase() === "d") {
        event.preventDefault();
        vault.cycleTheme();
      } else if (event.key === "k") {
        event.preventDefault();
        ui.setPaletteOpen(!ui.paletteOpen);
      } else if (event.key === "n" && vault.status === "ready") {
        event.preventDefault();
        vault.createNote(activeDir(vault));
      } else if (event.key === "j" && vault.status === "ready") {
        event.preventDefault();
        void vault.openDailyNote();
      } else if (event.key === "o" && vault.status === "ready") {
        event.preventDefault();
        vault.chooseExternalNotes();
      } else if (event.shiftKey && (event.key === "\\" || event.key === "|")) {
        event.preventDefault();
        if (vault.view?.type === "note") ui.openPaletteAside();
      } else if (event.key === "\\") {
        event.preventDefault();
        ui.toggleSidebar();
      } else if (event.key === ",") {
        event.preventDefault();
        void ipc.openSettingsWindow();
      } else if (event.key === "[") {
        event.preventDefault();
        goBack();
      } else if (event.key === "]") {
        event.preventDefault();
        goForward();
      } else if (event.key === "w" && vault.view) {
        event.preventDefault();
        closeTab(tabOfView(vault.view));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {status === "welcome" && <Welcome />}
      <Suspense fallback={null}>
        {status === "ready" && <AppShell />}
        <CommandPalette />
        {status === "ready" && <TasksDialog />}
        {status === "ready" && <McpDialog />}
      {status === "ready" && <TagsDialog />}
      {status === "ready" && <UnusedAssetsDialog />}
      </Suspense>
      <AppToaster />
    </>
  );
}
