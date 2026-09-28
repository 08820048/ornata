import { createInterface } from "node:readline";
import path from "node:path";
import {
  AuthStorage,
  createAgentSession,
  createFindToolDefinition,
  createGrepToolDefinition,
  createLsToolDefinition,
  createReadToolDefinition,
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
import { transcript, userRequest } from "./transcript";
import { VaultGuard } from "./vaultGuard";

const PROTOCOL_VERSION = 1;
const SYSTEM_PROMPT =
  "You are AssistantPi, Ornata's notes assistant. Use the Ornata tools for every note operation. The host validates permissions and all data access. Never claim a mutation succeeded before its tool returns successfully. Use the least-destructive action that satisfies the request. The read, grep, find, and ls tools inspect the vault folder only — paths outside it are refused; bash runs on the host and is subject to the permission mode the user selected; web_search and web_fetch reach the internet for anything outside the vault. Be concise and preserve the user's language. Avoid decorative emoji unless explicitly requested.";

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
  | { type: "newChat"; requestId: string }
  | { type: "listChats"; requestId: string }
  | { type: "openChat"; requestId: string; path: string }
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
/** Everything needed to (re)build a session around another conversation. */
let sessionDeps: {
  vaultRoot: string;
  build: (sessionManager: SessionManager) => Promise<AgentSession>;
} | null = null;
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
  name: "ornata_notes" | "ornata_bash",
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

/**
 * Pi's read/grep/find/ls, confined to the vault: every path (and find's
 * glob) is checked by the guard before Pi touches the filesystem. They keep
 * their built-in names, so they replace the unconfined originals.
 */
function confinedFileTools(vaultRoot: string): ToolDefinition[] {
  const guard = new VaultGuard(vaultRoot);
  const confine = (
    definition: ToolDefinition,
    check: (params: { path?: string; pattern?: string }) => void,
  ): ToolDefinition => ({
    ...definition,
    execute(toolCallId, params, ...rest) {
      check(params as { path?: string; pattern?: string });
      return definition.execute(toolCallId, params, ...rest);
    },
  });
  return [
    confine(createReadToolDefinition(vaultRoot) as ToolDefinition, (p) => guard.resolve(p.path)),
    confine(createLsToolDefinition(vaultRoot) as ToolDefinition, (p) => guard.resolve(p.path)),
    confine(createGrepToolDefinition(vaultRoot) as ToolDefinition, (p) => guard.resolve(p.path)),
    confine(createFindToolDefinition(vaultRoot) as ToolDefinition, (p) => {
      guard.resolve(p.path);
      guard.checkPattern(p.pattern);
    }),
  ];
}

/** Shell commands execute on the host via Ornata's permission-controlled bridge. */
const bashTool = proxyTool(
  "ornata_bash",
  "Host Shell",
  "Run a shell command on the host through Ornata's permission-controlled bridge. Requires at least ask-to-edit permission; auto-allowed only in full-access mode.",
  Type.Object({
    command: Type.String({ description: "The shell command to execute" }),
    timeout: Type.Optional(Type.Number({ minimum: 1, maximum: 120 })),
  }),
);

/** Fetch a URL and return its content as text. Read-only, no host access. */
const webFetchTool: ToolDefinition = {
  name: "web_fetch",
  label: "Fetch Web Page",
  description:
    "Fetch a URL over HTTP(S) and return the response body as text (HTML is stripped to readable text). Use for documentation, articles, APIs, or any public web content.",
  promptSnippet:
    "Fetch a URL over HTTP(S) and return the response body as text.",
  parameters: Type.Object({
    url: Type.String({ description: "Absolute http(s) URL to fetch" }),
  }),
  async execute(_toolCallId, params, signal) {
    const { url } = params as { url: string };
    if (!/^https?:\/\//i.test(url)) {
      throw new Error("Only http(s) URLs are supported");
    }
    const response = await fetch(url, {
      signal: signal ?? null,
      headers: { "User-Agent": "OrnataAssistantPi/0.2" },
      redirect: "follow",
    });
    const contentType = response.headers.get("content-type") ?? "";
    const body = await response.text();
    const text = contentType.includes("html")
      ? htmlToText(body)
      : body.trim();
    const clipped = text.length > 40_000 ? `${text.slice(0, 40_000)}\n…[truncated]` : text;
    return {
      content: [{
        type: "text" as const,
        text: clipped || `(${response.status} ${response.statusText || "empty response"})`,
      }],
      details: { url, status: response.status },
    };
  },
};

/** DuckDuckGo HTML search — no API key, returns titles/URLs/snippets. */
const webSearchTool: ToolDefinition = {
  name: "web_search",
  label: "Web Search",
  description:
    "Search the public web and return a list of result titles, URLs, and snippets. Use for current events, facts outside the vault, or documentation lookups.",
  promptSnippet: "Search the public web for current information.",
  parameters: Type.Object({
    query: Type.String({ description: "Search query" }),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 10 })),
  }),
  async execute(_toolCallId, params, signal) {
    const { query } = params as { query: string };
    const limit = Math.min(Math.max((params as { limit?: number }).limit ?? 6, 1), 10);
    const response = await fetch(
      `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
      {
        signal: signal ?? null,
        headers: { "User-Agent": "OrnataAssistantPi/0.2" },
      },
    );
    if (!response.ok) {
      throw new Error(`Search failed: HTTP ${response.status}`);
    }
    const results = parseSearchResults(await response.text(), limit);
    if (results.length === 0) {
      return {
        content: [{ type: "text" as const, text: "No results found." }],
        details: { query },
      };
    }
    const text = results
      .map((result, index) => `${index + 1}. ${result.title}\n   ${result.url}${result.snippet ? `\n   ${result.snippet}` : ""}`)
      .join("\n\n");
    return {
      content: [{ type: "text" as const, text }],
      details: { query, count: results.length },
    };
  },
};

/** Minimal HTML → text: drop script/style, strip tags, collapse whitespace. */
function htmlToText(html: string) {
  return html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|blockquote)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract organic results from DuckDuckGo's HTML endpoint. */
function parseSearchResults(html: string, limit: number) {
  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const pattern = /<a[^>]+class="[^"]*result__a[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippets = /<a[^>]+class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetList: string[] = [];
  for (const match of html.matchAll(snippets)) {
    snippetList.push(htmlToText(match[1]).slice(0, 200));
  }
  let index = 0;
  for (const match of html.matchAll(pattern)) {
    const rawUrl = match[1];
    // DDG wraps outbound links: //duckduckgo.com/l/?uddg=<encoded>&rut=...
    const uddg = /[?&]uddg=([^&]+)/.exec(rawUrl)?.[1];
    const url = uddg ? decodeURIComponent(uddg) : rawUrl.startsWith("//") ? `https:${rawUrl}` : rawUrl;
    const title = htmlToText(match[2]);
    if (!title || !/^https?:\/\//.test(url)) continue;
    results.push({ title, url, snippet: snippetList[index] ?? "" });
    index += 1;
    if (results.length >= limit) break;
  }
  return results;
}

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
  const build = async (sessionManager: SessionManager) => (await createAgentSession({
    cwd: message.vaultRoot,
    authStorage,
    modelRegistry: registry,
    model,
    thinkingLevel: message.thinkingLevel ?? "medium",
    // read/grep/find/ls run inside the sidecar, confined to the vault by
    // confinedFileTools; everything else (bash + Ornata data) is proxied to
    // the host, which enforces the permission mode.
    noTools: "all",
    tools: [
      "read", "grep", "find", "ls",
      bashTool.name, webFetchTool.name, webSearchTool.name,
      notesTool.name,
    ],
    customTools: [
      ...confinedFileTools(message.vaultRoot),
      notesTool,
      bashTool, webFetchTool, webSearchTool,
    ],
    resourceLoader,
    settingsManager: SettingsManager.inMemory({
      compaction: { enabled: true },
    }),
    sessionManager,
  })).session;
  sessionDeps = { vaultRoot: message.vaultRoot, build };
  // Pick up the most recent conversation, so a restart keeps both the
  // transcript and what the model remembers.
  await startSession(SessionManager.continueRecent(message.vaultRoot, sessionsDir(message.vaultRoot)));
  send({
    type: "ready",
    protocolVersion: PROTOCOL_VERSION,
    provider: message.provider,
    model: message.model,
    capabilities: ["streaming", "abort", "compaction", "hostTools"],
  });
}

/** Conversations live with the vault's app data, not on one machine. */
function sessionsDir(vaultRoot: string) {
  return path.join(vaultRoot, ".ornata", "agent", "sessions");
}

async function startSession(sessionManager: SessionManager) {
  if (!sessionDeps) throw new Error("Agent is not initialized");
  unsubscribe?.();
  session?.dispose();
  session = await sessionDeps.build(sessionManager);
  unsubscribe = session.subscribe((event) => {
    const normalized = normalizeEvent(event);
    if (normalized) send({ type: "event", event: normalized });
  });
  send({ type: "event", event: { type: "history", chatId: session.sessionId, messages: transcript(session) } });
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
  } else if (message.type === "newChat" && sessionDeps) {
    await startSession(SessionManager.create(sessionDeps.vaultRoot, sessionsDir(sessionDeps.vaultRoot)));
    send({ type: "response", requestId: message.requestId, ok: true });
  } else if (message.type === "listChats" && sessionDeps) {
    const chats = await SessionManager.list(sessionDeps.vaultRoot, sessionsDir(sessionDeps.vaultRoot));
    // An event rather than a response: the host forwards events to the panel.
    send({
      type: "event",
      event: { type: "chats", chats: chats
        .filter((chat) => chat.messageCount > 0)
        .sort((a, b) => b.modified.getTime() - a.modified.getTime())
        .map((chat) => ({
          id: chat.id,
          path: chat.path,
          title: chat.name ?? userRequest(chat.firstMessage).slice(0, 80),
          modified: chat.modified.toISOString(),
          current: chat.id === session?.sessionId,
        })) },
    });
  } else if (message.type === "openChat" && sessionDeps) {
    // Only conversations stored for this vault can be opened.
    const dir = sessionsDir(sessionDeps.vaultRoot);
    const target = path.resolve(message.path);
    if (path.relative(dir, target).startsWith("..") || path.isAbsolute(path.relative(dir, target))) {
      throw new Error("Not a conversation from this vault");
    }
    await startSession(SessionManager.open(target, dir));
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
