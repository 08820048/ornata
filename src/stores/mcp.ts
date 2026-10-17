import { useEffect } from "react";
import { create } from "zustand";
import { ipc } from "@/lib/ipc";
import type { CliAccess, McpInstallOutcome, McpStatus } from "@/lib/types";

interface McpState {
  status: McpStatus | null;
  refresh: () => Promise<void>;
  setAccess: (access: CliAccess) => Promise<void>;
  /** Start or stop the in-app server. */
  setServer: (on: boolean) => Promise<void>;
  install: () => Promise<McpInstallOutcome>;
  uninstall: () => Promise<void>;
}

export const useMcp = create<McpState>((set, get) => ({
  status: null,
  refresh: async () => {
    try {
      set({ status: (await ipc.mcpStatus()) ?? null });
    } catch {
      set({ status: null });
    }
  },
  setAccess: async (access) => {
    await ipc.mcpSetAccess(access);
    await get().refresh();
  },
  setServer: async (on) => {
    await (on ? ipc.mcpServerStart() : ipc.mcpServerStop());
    await get().refresh();
  },
  install: async () => {
    const outcome = await ipc.mcpInstallCli();
    await get().refresh();
    return outcome;
  },
  uninstall: async () => {
    await ipc.mcpUninstallCli();
    await get().refresh();
  },
}));

/** Keep `status` fresh: agents connect and leave without telling the app. */
export function useMcpPolling(enabled = true, intervalMs = 3000) {
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => void useMcp.getState().refresh();
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [enabled, intervalMs]);
}
