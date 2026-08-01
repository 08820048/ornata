import { createInterface } from "node:readline";
import {
  AuthStorage,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type ToolDefinition,
  type AuthCredential,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { builtinProviders } from "@earendil-works/pi-ai/providers/all";
import { getOAuthProvider } from "@earendil-works/pi-ai/oauth";

const PROTOCOL_VERSION = 1;
const SYSTEM_PROMPT =
  "You are AssistantPi, Ornata's notes assistant. Use the Ornata tools for every note, todo, and bookmark operation. The host validates permissions and all data access. Never claim a mutation succeeded before its tool returns successfully. Use the least-destructive action that satisfies the request. Be concise and preserve the user's language. Avoid decorative emoji unless explicitly requested.";

type EndpointApi = "openai-completions" | "anthropic-messages";

interface InitMessage {
  type: "init";
  protocolVersion: number;
  vaultRoot: string;
  provider: string;
  model: string;
  authType?: string;
  apiKey?: string;
  credential?: AuthCredential;
  baseUrl?: string;
  endpointApi?: EndpointApi;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh";
}

type InboundMessage =
  | InitMessage
  | { type: "listProviders"; requestId: string }
  | { type: "listModels"; requestId: string; provider: string }
  | { type: "oauthStart"; requestId: string; provider: string }
  | { type: "oauthPromptResponse"; requestId: string; value?: string; error?: string }
  | { type: "prompt"; requestId: string; message: string }
  | { type: "abort"; requestId: string }
  | { type: "compact"; requestId: string }
  | { type: "shutdown" }
  | {
      type: "toolResponse";
      requestId: string;
      ok: boolean;
      value?: unknown;
      error?: string;
    };

interface PendingTool {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

let session: AgentSession | null = null;
let unsubscribe: (() => void) | null = null;
let activeAuthStorage: AuthStorage | null = null;
let activeAuthProvider: string | null = null;
const pendingTools = new Map<string, PendingTool>();
const pendingPrompts = new Map<string, PendingTool>();

function send(value: unknown) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(requestId: string | undefined, error: unknown) {
  send({
    type: "error",
    requestId,
    message: error instanceof Error ? error.message : String(error),
  });
}

function proxyTool(
  name: "ornata_notes" | "ornata_todos" | "ornata_bookmarks",
  label: string,
  description: string,
  parameters: ToolDefinition["parameters"],
): ToolDefinition {
  return {
    name,
    label,
    description,
    promptSnippet: description,
    parameters,
    async execute(toolCallId, params, signal) {
      const requestId = crypto.randomUUID();
      const resource = name.slice("ornata_".length);
      const promise = new Promise<unknown>((resolve, reject) => {
        pendingTools.set(requestId, { resolve, reject });
      });
      const abort = () => {
        const pending = pendingTools.get(requestId);
        if (!pending) return;
        pendingTools.delete(requestId);
        pending.reject(new Error("Tool execution aborted"));
      };
      signal?.addEventListener("abort", abort, { once: true });
      send({
        type: "toolRequest",
        requestId,
        toolCallId,
        request: {
          resource,
          action: (params as { action?: string }).action,
          args: params,
        },
      });
      try {
        const value = await promise;
        return {
          content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
          details: { resource, action: (params as { action?: string }).action },
        };
      } finally {
        signal?.removeEventListener("abort", abort);
        pendingTools.delete(requestId);
      }
    },
  };
}

const notesTool = proxyTool(
  "ornata_notes",
  "Ornata Notes",
  "Read, search, create, update, organize, or delete notes through Ornata's permission-controlled API.",
  Type.Object({
    action: Type.Union([
      Type.Literal("list"), Type.Literal("search"), Type.Literal("read"),
      Type.Literal("create"), Type.Literal("update"), Type.Literal("createFolder"),
      Type.Literal("rename"), Type.Literal("move"), Type.Literal("delete"),
    ]),
    path: Type.Optional(Type.String()),
    query: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 100 })),
    directory: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    name: Type.Optional(Type.String()),
    content: Type.Optional(Type.String()),
  }),
);

const todosTool = proxyTool(
  "ornata_todos",
  "Ornata Todos",
  "List and manage Ornata todos and todo tags through Ornata's permission-controlled API.",
  Type.Object({
    action: Type.Union([
      Type.Literal("list"), Type.Literal("listTags"), Type.Literal("add"),
      Type.Literal("update"), Type.Literal("toggle"), Type.Literal("setTags"),
      Type.Literal("createTag"), Type.Literal("deleteTag"), Type.Literal("delete"),
      Type.Literal("clearCompleted"),
    ]),
    id: Type.Optional(Type.String()),
    text: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    name: Type.Optional(Type.String()),
  }),
);

const bookmarksTool = proxyTool(
  "ornata_bookmarks",
  "Ornata Bookmarks",
  "List and manage Ornata bookmarks and bookmark tags through Ornata's permission-controlled API.",
  Type.Object({
    action: Type.Union([
      Type.Literal("list"), Type.Literal("listTags"), Type.Literal("add"),
      Type.Literal("updateTitle"), Type.Literal("setTags"), Type.Literal("createTag"),
      Type.Literal("deleteTag"), Type.Literal("delete"),
    ]),
    id: Type.Optional(Type.String()),
    url: Type.Optional(Type.String()),
    title: Type.Optional(Type.String()),
    tags: Type.Optional(Type.Array(Type.String())),
    name: Type.Optional(Type.String()),
  }),
);

function normalizeEvent(event: AgentSessionEvent) {
  switch (event.type) {
    case "agent_start":
      return { type: "runStarted" };
    case "agent_end":
      emitCredentialUpdate();
      return { type: "runCompleted" };
    case "message_update": {
      const update = event.assistantMessageEvent;
      if (update.type === "text_delta") {
        return { type: "textDelta", delta: update.delta };
      }
      if (update.type === "error") {
        return {
          type: "runError",
          message: update.error.errorMessage ?? "Model request failed",
        };
      }
      return null;
    }
    case "tool_execution_start":
      return {
        type: "toolStarted",
        id: event.toolCallId,
        name: event.toolName,
        args: event.args,
      };
    case "tool_execution_end":
      return {
        type: "toolFinished",
        id: event.toolCallId,
        name: event.toolName,
        isError: event.isError,
      };
    case "compaction_start":
      return { type: "compactionStarted", reason: event.reason };
    case "compaction_end":
      return {
        type: "compactionFinished",
        aborted: event.aborted,
        error: event.errorMessage,
      };
    default:
      return null;
  }
}

function emitCredentialUpdate() {
  if (!activeAuthStorage || !activeAuthProvider) return;
  const credential = activeAuthStorage.get(activeAuthProvider);
  if (credential?.type === "oauth") {
    send({ type: "credentialUpdated", provider: activeAuthProvider, credential });
  }
}

async function initialize(message: InitMessage) {
  if (message.protocolVersion !== PROTOCOL_VERSION) {
    throw new Error(
      `Unsupported protocol ${message.protocolVersion}; expected ${PROTOCOL_VERSION}`,
    );
  }

  unsubscribe?.();
  session?.dispose();
  const authStorage = AuthStorage.inMemory();
  const registry = ModelRegistry.inMemory(authStorage);
  let provider = message.provider;
  const configuredApiKey = message.credential?.type === "api_key"
    ? message.credential.key
    : message.apiKey;

  if (message.baseUrl) {
    provider = "ornata-custom";
    registry.registerProvider(provider, {
      name: message.provider,
      baseUrl: message.baseUrl,
      apiKey: configuredApiKey || "local",
      api: message.endpointApi ?? "openai-completions",
      models: [{
        id: message.model,
        name: message.model,
        api: message.endpointApi ?? "openai-completions",
        baseUrl: message.baseUrl,
        reasoning: true,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 16_384,
      }],
    });
  }

  activeAuthStorage = authStorage;
  activeAuthProvider = provider;

  if (message.credential) authStorage.set(provider, message.credential);
  else if (message.authType === "none" || message.baseUrl) {
    authStorage.setRuntimeApiKey(provider, configuredApiKey || "local");
  }
  const model = registry.find(provider, message.model);
  if (!model) {
    const examples = registry.getAll()
      .filter((candidate) => candidate.provider === provider)
      .slice(0, 8)
      .map((candidate) => candidate.id)
      .join(", ");
    throw new Error(
      `Unknown model ${message.provider}/${message.model}${examples ? `. Available: ${examples}` : ""}`,
    );
  }

  const resourceLoader = new DefaultResourceLoader({
    cwd: message.vaultRoot,
    agentDir: message.vaultRoot,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: SYSTEM_PROMPT,
  });
  await resourceLoader.reload();
  const created = await createAgentSession({
    cwd: message.vaultRoot,
    authStorage,
    modelRegistry: registry,
    model,
    thinkingLevel: message.thinkingLevel ?? "medium",
    noTools: "all",
    tools: [notesTool.name, todosTool.name, bookmarksTool.name],
    customTools: [notesTool, todosTool, bookmarksTool],
    resourceLoader,
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: true },
    }),
    sessionManager: SessionManager.inMemory(message.vaultRoot),
  });
  session = created.session;
  unsubscribe = session.subscribe((event) => {
    const normalized = normalizeEvent(event);
    if (normalized) send({ type: "event", event: normalized });
  });
  send({
    type: "ready",
    protocolVersion: PROTOCOL_VERSION,
    provider: message.provider,
    model: message.model,
    capabilities: ["streaming", "abort", "compaction", "hostTools"],
  });
}

async function handle(message: InboundMessage) {
  if (message.type === "listProviders") {
    const registry = ModelRegistry.inMemory(AuthStorage.inMemory());
    const counts = new Map<string, number>();
    for (const model of registry.getAll()) {
      counts.set(model.provider, (counts.get(model.provider) ?? 0) + 1);
    }
    const providers = builtinProviders().map((provider) => ({
      id: provider.id,
      name: provider.name,
      authMethods: authMethods(provider.id, provider.auth),
      modelCount: counts.get(provider.id) ?? provider.getModels().length,
      dynamicModels: Boolean(provider.refreshModels),
    }));
    providers.push(
      { id: "ollama", name: "Ollama", authMethods: ["none"], modelCount: 0, dynamicModels: true },
      { id: "custom", name: "Custom endpoint", authMethods: ["apiKey", "none"], modelCount: 0, dynamicModels: true },
    );
    send({ type: "providers", requestId: message.requestId, providers });
    return;
  }
  if (message.type === "listModels") {
    const registry = ModelRegistry.inMemory(AuthStorage.inMemory());
    const models = registry.getAll()
      .filter((model) => model.provider === message.provider)
      .map((model) => ({
        id: model.id,
        name: model.name,
        reasoning: model.reasoning,
        contextWindow: model.contextWindow,
        input: model.input,
      }));
    send({ type: "models", requestId: message.requestId, provider: message.provider, models });
    return;
  }
  if (message.type === "oauthPromptResponse") {
    const pending = pendingPrompts.get(message.requestId);
    if (!pending) return;
    pendingPrompts.delete(message.requestId);
    if (message.error) pending.reject(new Error(message.error));
    else pending.resolve(message.value ?? "");
    return;
  }
  if (message.type === "oauthStart") {
    await startOAuth(message.requestId, message.provider);
    return;
  }
  if (message.type === "init") {
    await initialize(message);
    return;
  }
  if (message.type === "toolResponse") {
    const pending = pendingTools.get(message.requestId);
    if (!pending) return;
    if (message.ok) pending.resolve(message.value);
    else pending.reject(new Error(message.error ?? "Host tool failed"));
    return;
  }
  if (message.type === "shutdown") {
    unsubscribe?.();
    session?.dispose();
    process.exit(0);
  }
  if (!session) throw new Error("Agent is not initialized");
  if (message.type === "prompt") {
    await session.prompt(message.message, { expandPromptTemplates: false });
    send({ type: "response", requestId: message.requestId, ok: true });
  } else if (message.type === "abort") {
    await session.abort();
    send({ type: "response", requestId: message.requestId, ok: true });
  } else if (message.type === "compact") {
    await session.compact();
    send({ type: "response", requestId: message.requestId, ok: true });
  }
}

function authMethods(providerId: string, auth: ReturnType<typeof builtinProviders>[number]["auth"]) {
  const methods: string[] = [];
  if (auth.apiKey?.login) methods.push("apiKey");
  if (auth.oauth) methods.push("oauth");
  if (providerId === "amazon-bedrock") methods.push("iam");
  if (providerId === "google-vertex") methods.push("serviceAccount", "environment");
  if (!methods.length && auth.apiKey) methods.push("environment");
  return methods;
}

async function startOAuth(flowId: string, providerId: string) {
  const oauth = getOAuthProvider(providerId);
  if (!oauth) throw new Error(`${providerId} does not support OAuth`);
  const credential = await oauth.login({
    onAuth(info) {
      send({ type: "oauthEvent", flowId, event: { type: "auth_url", ...info } });
    },
    onDeviceCode(info) {
      send({ type: "oauthEvent", flowId, event: { type: "device_code", ...info } });
    },
    onProgress(message) {
      send({ type: "oauthEvent", flowId, event: { type: "progress", message } });
    },
    onPrompt(prompt) {
      return requestOAuthInput(flowId, {
        type: "text",
        message: prompt.message,
        placeholder: prompt.placeholder,
      });
    },
    onManualCodeInput() {
      return requestOAuthInput(flowId, {
        type: "manual_code",
        message: "Paste the authorization code or the full callback URL",
      });
    },
    async onSelect(prompt) {
      const value = await requestOAuthInput(flowId, {
        type: "select",
        message: prompt.message,
        options: prompt.options,
      });
      return value || undefined;
    },
  });
  send({
    type: "oauthComplete",
    flowId,
    provider: providerId,
    credential: { type: "oauth", ...credential },
  });
}

async function requestOAuthInput(
  flowId: string,
  prompt: {
    type: "text" | "secret" | "select" | "manual_code";
    message: string;
    placeholder?: string;
    options?: readonly { id: string; label: string }[];
  },
) {
  const requestId = crypto.randomUUID();
  const promise = new Promise<unknown>((resolve, reject) => {
    pendingPrompts.set(requestId, { resolve, reject });
  });
  send({ type: "oauthPrompt", flowId, requestId, prompt });
  return String(await promise);
}

let initialization: Promise<void> = Promise.resolve();

createInterface({ input: process.stdin, crlfDelay: Infinity }).on("line", (line) => {
  if (!line.trim()) return;
  let message: InboundMessage;
  try {
    message = JSON.parse(line) as InboundMessage;
  } catch (error) {
    fail(undefined, error);
    return;
  }
  const run = () => handle(message).catch((error) => {
    fail("requestId" in message ? message.requestId : undefined, error);
  });
  if (message.type === "init") {
    initialization = run();
  } else {
    void initialization.then(run);
  }
});

process.on("SIGTERM", () => {
  unsubscribe?.();
  session?.dispose();
  process.exit(0);
});
