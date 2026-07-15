import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { ipc, IpcError } from "@/lib/ipc";
import { flattenNotes } from "@/lib/tree";
import type { AgentPermission, PiStatus } from "@/lib/types";
import { useBookmarks } from "@/stores/bookmarks";
import { useTabs } from "@/stores/tabs";
import { useTodos } from "@/stores/todos";
import { useVault } from "@/stores/vault";

export type AgentConnection =
  | "idle"
  | "starting"
  | "ready"
  | "running"
  | "missing"
  | "error";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface AgentActivity {
  id: string;
  name: string;
  detail: string | null;
  status: "running" | "done" | "error";
}

interface AgentStore {
  connection: AgentConnection;
  pi: PiStatus | null;
  model: string | null;
  messages: AgentMessage[];
  activities: AgentActivity[];
  error: string | null;
  streamingMessageId: string | null;
  vaultRoot: string | null;
  permission: AgentPermission;
  initialize: (root: string) => Promise<void>;
  start: () => Promise<boolean>;
  send: (message: string) => Promise<void>;
  abort: () => Promise<void>;
  retry: () => Promise<void>;
  setPermission: (permission: AgentPermission) => Promise<void>;
}

let listenerPromise: Promise<UnlistenFn[]> | null = null;

function id() {
  return crypto.randomUUID();
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function activityDetail(value: unknown) {
  const args = object(value);
  if (!args) return null;
  for (const key of ["path", "query", "pattern", "glob", "command", "action", "url"]) {
    const detail = args[key];
    if (typeof detail === "string" && detail.trim()) return detail;
  }
  return null;
}

function ensureListeners() {
  if (listenerPromise) return listenerPromise;
  listenerPromise = Promise.all([
    listen<Record<string, unknown>>("pi-agent-event", ({ payload }) => {
      handleRpcEvent(payload);
    }),
    listen<string>("pi-agent-stderr", ({ payload }) => {
      useAgent.setState({ error: payload });
    }),
    listen("pi-agent-exit", () => {
      const state = useAgent.getState();
      useAgent.setState({
        connection: state.pi?.installed ? "idle" : "missing",
        streamingMessageId: null,
      });
    }),
    listen<"notes" | "todos" | "bookmarks" | "all">(
      "ornata-agent-mutated",
      ({ payload }) => {
        void refreshAfterMutation(payload);
      },
    ),
  ]);
  return listenerPromise;
}

async function refreshAfterMutation(
  kind: "notes" | "todos" | "bookmarks" | "all",
) {
  if (kind === "notes" || kind === "all") {
    await useVault.getState().refreshTree();
    const vault = useVault.getState();
    const available = new Set(flattenNotes(vault.tree).map((note) => note.rel));
    const tabs = useTabs.getState().tabs;
    const missing = tabs.filter(
      (note) => note.kind === "vault" && !available.has(note.rel),
    );
    for (const note of missing) useTabs.getState().close(note);
    const view = useVault.getState().view;
    if (
      view?.type === "note" &&
      view.note.kind === "vault" &&
      !available.has(view.note.rel)
    ) {
      const remaining = useTabs.getState().tabs;
      const next = remaining[remaining.length - 1] ?? null;
      useVault.getState().setView(next ? { type: "note", note: next } : null);
    }
    window.dispatchEvent(new Event("ornata-agent-notes-changed"));
  }
  if (kind === "todos" || kind === "all") await useTodos.getState().load();
  if (kind === "bookmarks" || kind === "all") {
    await useBookmarks.getState().load();
  }
}

function handleRpcEvent(event: Record<string, unknown>) {
  const type = event.type;
  if (type === "agent_start") {
    const messageId = id();
    useAgent.setState((state) => ({
      connection: "running",
      streamingMessageId: messageId,
      activities: [],
      messages: [
        ...state.messages,
        { id: messageId, role: "assistant", content: "" },
      ],
    }));
    return;
  }

  if (type === "agent_end") {
    useAgent.setState((state) => ({
      connection: "ready",
      messages: state.messages.filter(
        (message) => message.id !== state.streamingMessageId || message.content,
      ),
      streamingMessageId: null,
    }));
    return;
  }

  if (type === "message_update") {
    const update = object(event.assistantMessageEvent);
    if (update?.type === "error") {
      const detail = object(update.error);
      const message =
        typeof detail?.errorMessage === "string"
          ? detail.errorMessage
          : typeof update.reason === "string"
            ? update.reason
            : "Pi request failed";
      if (update.reason !== "aborted") useAgent.setState({ error: message });
      return;
    }
    if (update?.type !== "text_delta" || typeof update.delta !== "string") {
      return;
    }
    const delta = update.delta;
    useAgent.setState((state) => ({
      messages: state.messages.map((message) =>
        message.id === state.streamingMessageId
          ? { ...message, content: message.content + delta }
          : message,
      ),
    }));
    return;
  }

  if (type === "tool_execution_start" && typeof event.toolCallId === "string") {
    useAgent.setState((state) => ({
      activities: [
        ...state.activities,
        {
          id: event.toolCallId as string,
          name: typeof event.toolName === "string" ? event.toolName : "tool",
          detail: activityDetail(event.args),
          status: "running",
        },
      ],
    }));
    return;
  }

  if (type === "tool_execution_end" && typeof event.toolCallId === "string") {
    useAgent.setState((state) => ({
      activities: state.activities.map((activity) =>
        activity.id === event.toolCallId
          ? { ...activity, status: event.isError ? "error" : "done" }
          : activity,
      ),
    }));
    return;
  }

  if (type === "response") {
    if (event.success === false) {
      useAgent.setState({
        connection: "error",
        error: typeof event.error === "string" ? event.error : "Pi request failed",
      });
      return;
    }
    if (event.command === "get_state") {
      const data = object(event.data);
      const model = object(data?.model);
      const name = typeof model?.name === "string" ? model.name : null;
      useAgent.setState({
        connection: data?.isStreaming ? "running" : "ready",
        model: name,
      });
    }
  }
}

export const useAgent = create<AgentStore>((set, get) => ({
  connection: "idle",
  pi: null,
  model: null,
  messages: [],
  activities: [],
  error: null,
  streamingMessageId: null,
  vaultRoot: null,
  permission: "readOnly",

  initialize: async (root) => {
    await ensureListeners();
    if (get().vaultRoot && get().vaultRoot !== root) {
      await ipc.agentStop().catch(() => undefined);
      set({ messages: [], activities: [], model: null });
    }
    set({ vaultRoot: root, connection: "starting", error: null });
    await ipc.agentSetPermission(get().permission);
    await get().start();
  },

  start: async () => {
    set({ connection: "starting", error: null });
    try {
      const pi = await ipc.agentStart();
      set({ pi, connection: "ready" });
      return true;
    } catch (error) {
      const missing = error instanceof IpcError && error.kind === "not_found";
      set({
        connection: missing ? "missing" : "error",
        pi: missing
          ? {
              installed: false,
              running: false,
              path: null,
              version: null,
              permission: get().permission,
            }
          : get().pi,
        error: missing ? null : String(error),
      });
      return false;
    }
  },

  send: async (message) => {
    const text = message.trim();
    if (!text || get().connection === "running") return;
    let ready = get().connection === "ready";
    if (!ready) ready = await get().start();
    if (!ready) return;
    set((state) => ({
      connection: "running",
      messages: [...state.messages, { id: id(), role: "user", content: text }],
      error: null,
    }));
    try {
      await ipc.agentSend(text);
    } catch (error) {
      set({ connection: "error", error: String(error) });
    }
  },

  abort: async () => {
    try {
      await ipc.agentAbort();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  retry: async () => {
    const root = get().vaultRoot;
    if (root) await get().initialize(root);
  },

  setPermission: async (permission) => {
    if (get().connection === "running" || permission === get().permission) return;
    try {
      await ipc.agentSetPermission(permission);
      set((state) => ({
        permission,
        pi: state.pi ? { ...state.pi, permission } : state.pi,
        error: null,
      }));
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
