import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { ipc, IpcError } from "@/lib/ipc";
import { flattenNotes } from "@/lib/tree";
import type {
  AgentConnection as AgentModelConnection,
  AgentConnectionConfig,
  AgentConnections,
  AgentPermission,
  AgentStatus,
} from "@/lib/types";
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
  selection?: AgentSelection;
}

export interface AgentNoteReference {
  sourceKey: string;
  source: string;
  title: string;
}

export interface AgentSelection {
  sourceKey: string;
  source: string;
  title: string;
  text: string;
}

export interface AgentActivity {
  id: string;
  name: string;
  detail: string | null;
  status: "running" | "done" | "error";
}

export interface AgentApproval {
  id: string;
  resource: string;
  action: string;
  args: Record<string, unknown>;
}

interface AgentStore {
  connection: AgentConnection;
  pi: AgentStatus | null;
  modelConnection: AgentModelConnection | null;
  connections: AgentModelConnection[];
  activeConnectionSlug: string | null;
  model: string | null;
  messages: AgentMessage[];
  activities: AgentActivity[];
  approval: AgentApproval | null;
  error: string | null;
  streamingMessageId: string | null;
  vaultRoot: string | null;
  permission: AgentPermission;
  selection: AgentSelection | null;
  initialize: (root: string) => Promise<void>;
  start: () => Promise<boolean>;
  send: (message: string, note?: AgentNoteReference | null) => Promise<void>;
  abort: () => Promise<void>;
  respondApproval: (allow: boolean) => Promise<void>;
  retry: () => Promise<void>;
  setPermission: (permission: AgentPermission) => Promise<void>;
  saveConnection: (
    connection: AgentConnectionConfig,
    apiKey?: string,
  ) => Promise<boolean>;
  activateConnection: (slug: string) => Promise<boolean>;
  deleteConnection: (slug: string) => Promise<void>;
  setSelection: (selection: AgentSelection | null) => void;
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

function messageWithContext(
  message: string,
  note: AgentNoteReference | null,
  selection: AgentSelection | null,
) {
  if (!note && !selection) return message;

  const context: string[] = [];
  if (note) {
    context.push(
      "The user attached the current Ornata note.",
      JSON.stringify({ source: note.source, title: note.title }),
    );
  }
  if (selection) {
    const available = Math.max(0, 28_000 - message.length);
    const selectedText = selection.text.slice(0, available);
    const truncated = selectedText.length < selection.text.length;
    context.push(
      "The user attached a text selection from an Ornata note.",
      JSON.stringify({
        source: selection.source,
        title: selection.title,
        selectedText,
        truncated,
      }),
    );
  }

  return [...context, "User request:", message].join("\n\n");
}

function ensureListeners() {
  if (listenerPromise) return listenerPromise;
  listenerPromise = Promise.all([
    listen<Record<string, unknown>>("ornata-agent-event", ({ payload }) => {
      handleAgentEvent(payload);
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

function handleAgentEvent(event: Record<string, unknown>) {
  const type = event.type;
  if (type === "ready") {
    useAgent.setState({
      connection: "ready",
      model: typeof event.model === "string" ? event.model : null,
    });
    return;
  }

  if (type === "runStarted") {
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

  if (type === "runCompleted") {
    useAgent.setState((state) => ({
      connection: "ready",
      messages: state.messages.filter(
        (message) => message.id !== state.streamingMessageId || message.content,
      ),
      streamingMessageId: null,
      approval: null,
    }));
    return;
  }

  if (type === "textDelta" && typeof event.delta === "string") {
    const delta = event.delta;
    useAgent.setState((state) => ({
      messages: state.messages.map((message) =>
        message.id === state.streamingMessageId
          ? { ...message, content: message.content + delta }
          : message,
      ),
    }));
    return;
  }

  if (type === "toolStarted" && typeof event.id === "string") {
    useAgent.setState((state) => ({
      activities: [
        ...state.activities,
        {
          id: event.id as string,
          name: typeof event.name === "string" ? event.name : "tool",
          detail: activityDetail(event.args),
          status: "running",
        },
      ],
    }));
    return;
  }

  if (type === "toolFinished" && typeof event.id === "string") {
    useAgent.setState((state) => ({
      activities: state.activities.map((activity) =>
        activity.id === event.id
          ? { ...activity, status: event.isError ? "error" : "done" }
          : activity,
      ),
    }));
    return;
  }

  if (type === "runError" || type === "runtimeError") {
    useAgent.setState({
      connection: "error",
      streamingMessageId: null,
      approval: null,
      error:
        typeof event.message === "string"
          ? event.message
          : "AssistantPi request failed",
    });
    return;
  }

  if (
    type === "approvalRequested" &&
    typeof event.id === "string" &&
    typeof event.resource === "string" &&
    typeof event.action === "string"
  ) {
    useAgent.setState({
      approval: {
        id: event.id,
        resource: event.resource,
        action: event.action,
        args: object(event.args) ?? {},
      },
    });
    return;
  }

  if (type === "approvalResolved") {
    useAgent.setState({ approval: null });
  }
}

export const useAgent = create<AgentStore>((set, get) => ({
  connection: "idle",
  pi: null,
  modelConnection: null,
  connections: [],
  activeConnectionSlug: null,
  model: null,
  messages: [],
  activities: [],
  approval: null,
  error: null,
  streamingMessageId: null,
  vaultRoot: null,
  permission: "readOnly",
  selection: null,

  initialize: async (root) => {
    await ensureListeners();
    if (get().vaultRoot && get().vaultRoot !== root) {
      await ipc.agentStop().catch(() => undefined);
      set({ messages: [], activities: [], model: null, selection: null });
    }
    set({ vaultRoot: root, connection: "starting", error: null });
    await ipc.agentSetPermission(get().permission);
    const connectionState = await ipc.agentConnectionsList();
    const modelConnection = activeConnection(connectionState);
    if (!modelConnection?.credentialConfigured) {
      set({
        modelConnection,
        connections: connectionState.connections,
        activeConnectionSlug: connectionState.activeSlug,
        connection: "missing",
        pi: null,
        model: modelConnection?.model ?? null,
      });
      return;
    }
    set({
      modelConnection,
      connections: connectionState.connections,
      activeConnectionSlug: connectionState.activeSlug,
    });
    await get().start();
  },

  start: async () => {
    set({ connection: "starting", error: null });
    try {
      const pi = await ipc.agentStart();
      set({ pi, connection: "ready", model: pi.model });
      return true;
    } catch (error) {
      const missing = error instanceof IpcError && error.kind === "not_found";
      set({
        connection: missing ? "missing" : "error",
        pi: missing
          ? {
              configured: false,
              running: false,
              provider: null,
              model: null,
              runtimeVersion: "",
              permission: get().permission,
            }
          : get().pi,
        error: missing ? null : String(error),
      });
      return false;
    }
  },

  send: async (message, note = null) => {
    const text = message.trim();
    if (!text || get().connection === "running") return;
    const selection = get().selection;
    let ready = get().connection === "ready";
    if (!ready) ready = await get().start();
    if (!ready) return;
    set((state) => ({
      connection: "running",
      messages: [
        ...state.messages,
        {
          id: id(),
          role: "user",
          content: text,
          selection: selection ?? undefined,
        },
      ],
      selection: null,
      error: null,
    }));
    try {
      await ipc.agentSend(messageWithContext(text, note, selection));
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

  respondApproval: async (allow) => {
    const approval = get().approval;
    if (!approval) return;
    set({ approval: null });
    try {
      await ipc.agentRespondApproval(approval.id, allow);
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

  saveConnection: async (connection, apiKey) => {
    try {
      await ipc.agentStop().catch(() => undefined);
      const connectionState = await ipc.agentConnectionSave(connection, apiKey, true);
      const saved = activeConnection(connectionState);
      set({
        modelConnection: saved,
        connections: connectionState.connections,
        activeConnectionSlug: connectionState.activeSlug,
        model: saved?.model ?? null,
        connection: saved?.credentialConfigured ? "starting" : "missing",
        messages: [],
        activities: [],
        streamingMessageId: null,
        approval: null,
        error: null,
      });
      return saved?.credentialConfigured ? await get().start() : false;
    } catch (error) {
      set({ connection: "missing", error: String(error) });
      return false;
    }
  },

  activateConnection: async (slug) => {
    try {
      await ipc.agentStop().catch(() => undefined);
      const connectionState = await ipc.agentConnectionActivate(slug);
      const active = activeConnection(connectionState);
      set({
        connections: connectionState.connections,
        activeConnectionSlug: connectionState.activeSlug,
        modelConnection: active,
        model: active?.model ?? null,
        connection: active?.credentialConfigured ? "starting" : "missing",
        messages: [],
        activities: [],
        streamingMessageId: null,
        approval: null,
        error: null,
      });
      return active?.credentialConfigured ? await get().start() : false;
    } catch (error) {
      set({ connection: "error", error: String(error) });
      return false;
    }
  },

  deleteConnection: async (slug) => {
    try {
      const wasActive = get().activeConnectionSlug === slug;
      if (wasActive) await ipc.agentStop().catch(() => undefined);
      const connectionState = await ipc.agentConnectionDelete(slug);
      const active = activeConnection(connectionState);
      set({
        connections: connectionState.connections,
        activeConnectionSlug: connectionState.activeSlug,
        modelConnection: active,
        model: active?.model ?? null,
        connection: active?.credentialConfigured ? "idle" : "missing",
        ...(wasActive
          ? { messages: [], activities: [], streamingMessageId: null, approval: null }
          : {}),
        error: null,
      });
      if (wasActive && active?.credentialConfigured) await get().start();
    } catch (error) {
      set({ error: String(error) });
    }
  },

  setSelection: (selection) => set({ selection }),
}));

function activeConnection(state: AgentConnections) {
  return state.connections.find((connection) => connection.slug === state.activeSlug) ?? null;
}
