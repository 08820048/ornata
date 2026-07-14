import { relaunch } from "@tauri-apps/plugin-process";
import {
  check,
  type DownloadEvent,
  type Update,
} from "@tauri-apps/plugin-updater";
import { toast } from "sonner";
import { create } from "zustand";

type Status =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "installing"
  | "error";

interface UpdaterState {
  status: Status;
  version: string | null;
  progress: number | null;
  update: Update | null;
  /** Look for an update. `silent` swallows "up to date"/failure noise. */
  check: (opts?: { silent?: boolean }) => Promise<void>;
  /** Download the pending update while reporting progress. */
  download: () => Promise<void>;
  /** Install an already-downloaded update and relaunch. */
  restartAndInstall: () => Promise<void>;
}

export const useUpdater = create<UpdaterState>((set, get) => ({
  status: "idle",
  version: null,
  progress: null,
  update: null,

  check: async ({ silent = true } = {}) => {
    if (
      get().status === "checking" ||
      get().status === "downloading" ||
      get().status === "installing"
    ) {
      return;
    }
    set({ status: "checking", progress: null });
    try {
      const update = await check();
      if (update) {
        set({
          status: "available",
          version: update.version,
          progress: null,
          update,
        });
      } else {
        set({ status: "idle", version: null, progress: null, update: null });
        if (!silent) toast("You're on the latest version.");
      }
    } catch (err) {
      // Dev builds / offline / no signature all land here — stay quiet.
      set({ status: "error", version: null, progress: null, update: null });
      if (!silent) {
        toast.error(err instanceof Error ? err.message : "Update check failed.");
      }
    }
  },

  download: async () => {
    const update = get().update;
    if (!update || get().status !== "available") return;

    let downloadedBytes = 0;
    let totalBytes: number | null = null;
    const onEvent = (event: DownloadEvent) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? null;
        downloadedBytes = 0;
        set({ progress: totalBytes ? 0 : null });
      } else if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        if (totalBytes) {
          set({
            progress: Math.min(100, (downloadedBytes / totalBytes) * 100),
          });
        }
      } else {
        set({ progress: 100 });
      }
    };

    set({ status: "downloading", progress: 0 });
    try {
      await update.download(onEvent);
      set({ status: "ready", progress: 100 });
    } catch (err) {
      set({ status: "available", progress: null });
      toast.error(err instanceof Error ? err.message : "Update download failed.");
    }
  },

  restartAndInstall: async () => {
    const update = get().update;
    if (!update || get().status !== "ready") return;
    set({ status: "installing" });
    try {
      await update.install();
      await relaunch();
    } catch (err) {
      set({ status: "ready" });
      toast.error(err instanceof Error ? err.message : "Update failed to install.");
    }
  },
}));
