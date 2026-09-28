import {
  AlertCircle,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronUp,
  Eye,
  FileSearch,
  FolderSearch,
  Globe,
  LoaderCircle,
  PencilLine,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  TextQuote,
  X,
} from "lucide-react";
import type { OrbState } from "thinking-orbs";
import { ThinkingOrb } from "thinking-orbs";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { CopyButton } from "@/components/ui/CopyButton";
import { ApprovalPreview } from "@/components/agent/ApprovalPreview";
import { EASE_OUT } from "@/lib/ease";
import { ipc } from "@/lib/ipc";
import { noteKey, noteTitle } from "@/lib/noteRef";
import { cx } from "@/lib/utils";
import {
  useAgent,
  type AgentActivity,
  type AgentNoteReference,
  type AgentSelection,
} from "@/stores/agent";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import type {
  AgentConnection,
  AgentConnectionConfig,
  AgentEndpointApi,
  AgentAuthType,
  AgentModel,
  AgentPermission,
  AgentProvider,
} from "@/lib/types";

const PANEL_WIDTH = "clamp(408px, 44vw, 640px)";
/// Tool calls kept visible in the trace before a "show all" reveal.
const VISIBLE_ACTIVITIES = 8;
const AgentMarkdown = lazy(() =>
  import("@/components/agent/AgentMarkdown").then((module) => ({
    default: module.AgentMarkdown,
  })),
);

export function AgentPanel() {
  const open = useUi((state) => state.agentOpen);
  const setOpen = useUi((state) => state.setAgentOpen);
  const root = useVault((state) => state.root);
  const view = useVault((state) => state.view);
  const connection = useAgent((state) => state.connection);
  const pi = useAgent((state) => state.pi);
  const modelConnection = useAgent((state) => state.modelConnection);
  const connections = useAgent((state) => state.connections);
  const activeConnectionSlug = useAgent((state) => state.activeConnectionSlug);
  const model = useAgent((state) => state.model);
  const messages = useAgent((state) => state.messages);
  const activities = useAgent((state) => state.activities);
  const approval = useAgent((state) => state.approval);
  const error = useAgent((state) => state.error);
  const initialize = useAgent((state) => state.initialize);
  const send = useAgent((state) => state.send);
  const abort = useAgent((state) => state.abort);
  const respondApproval = useAgent((state) => state.respondApproval);
  const saveConnection = useAgent((state) => state.saveConnection);
  const activateConnection = useAgent((state) => state.activateConnection);
  const deleteConnection = useAgent((state) => state.deleteConnection);
  const permission = useAgent((state) => state.permission);
  const setPermission = useAgent((state) => state.setPermission);
  const selection = useAgent((state) => state.selection);
  const setSelection = useAgent((state) => state.setSelection);
  const [draft, setDraft] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  // The auto-attached current note can be dismissed; it comes back only when
  // a different note is opened.
  const [noteDismissed, setNoteDismissed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const currentNote: AgentNoteReference | null =
    view?.type === "note" && !noteDismissed
      ? {
          sourceKey: noteKey(view.note),
          source:
            view.note.kind === "vault"
              ? `notes/${view.note.rel}`
              : view.note.path,
          title: noteTitle(view.note),
        }
      : null;

  // A newly opened note re-arms the attachment even if the previous one was
  // dismissed — the dismissal only covers the note it was made on.
  useEffect(() => {
    setNoteDismissed(false);
  }, [view?.type === "note" ? noteKey(view.note) : ""]);

  useEffect(() => {
    if (open && root && useAgent.getState().vaultRoot !== root) {
      void initialize(root);
    }
  }, [initialize, open, root]);

  useEffect(() => {
    if (!open) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activities, messages, open]);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, setOpen]);

  const submit = () => {
    const message = draft.trim();
    if (!message || connection === "running") return;
    setDraft("");
    void send(message, currentNote);
  };

  const prepare = () => {
    const agent = useAgent.getState();
    if (root && agent.vaultRoot !== root) void agent.initialize(root);
  };

  const unavailable = connection === "missing";
  const starting = connection === "starting";
  const running = connection === "running";
  // Newest tool call still in flight — drives the live status line above the
  // composer so the agent's current action stays visible while it works.
  const liveActivity =
    activities
      .slice()
      .reverse()
      .find((activity) => activity.status === "running") ?? null;
  const composerStatus = starting
    ? t("agent.status.connecting")
    : running
      ? t("agent.status.working")
      : t("agent.status.ready");
  const showComposerAction = running || Boolean(draft.trim());
  const lastAssistantId = [...messages]
    .reverse()
    .find((message) => message.role === "assistant")?.id;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      <AnimatePresence initial={false}>
        {!open ? (
          <motion.button
            key="agent-launcher"
            type="button"
            aria-label={t("agent.launcher")}
            onClick={() => setOpen(true)}
            onMouseEnter={prepare}
            onFocus={prepare}
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.16, ease: EASE_OUT }}
            className="pointer-events-auto absolute bottom-8 right-5 inline-flex h-10 items-center gap-2 rounded-full bg-bg pl-2 pr-4 text-[12.5px] font-medium text-ink shadow-lg shadow-black/10 transition-[box-shadow,transform] duration-100 hover:shadow-xl hover:shadow-black/15 active:scale-[0.96] dark:shadow-black/40 dark:hover:shadow-black/50"
          >
            <span className="grid size-6 place-items-center rounded-full bg-invert text-invert-ink">
              <Sparkles size={12.5} strokeWidth={1.9} />
            </span>
            {t("agent.launcher")}
          </motion.button>
        ) : (
          <motion.aside
            key="agent-overlay"
            role="dialog"
            aria-label={t("agent.title")}
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{
              width: PANEL_WIDTH,
              maxWidth: "calc(100% - 24px)",
              height: "75%",
            }}
            className="pointer-events-auto absolute bottom-3 right-3 flex origin-bottom-right flex-col overflow-hidden rounded-[20px] bg-bg shadow-2xl shadow-black/20 will-change-[transform,opacity] dark:shadow-black/60"
          >
        <header className="relative grid h-14 shrink-0 place-items-center px-14">
          <button
            type="button"
            disabled={running}
            onClick={() => setShowSetup(true)}
            className="max-w-full truncate rounded-lg px-2 py-1 text-center font-mono text-[11px] text-faint transition-[background-color,color] duration-100 hover:bg-hover hover:text-ink disabled:pointer-events-none"
          >
            {model ?? t("agent.modelUnknown")}
          </button>
          <button
            type="button"
            aria-label={t("agent.close")}
            onClick={() => setOpen(false)}
            className="absolute right-3 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-faint transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
          >
            <X size={16} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6">
          {starting ? (
            <CenteredState
              icon={<LoaderCircle className="animate-spin" size={20} />}
              title={t("agent.starting")}
              detail={pi?.runtimeVersion ? t("agent.piVersion", { version: pi.runtimeVersion }) : undefined}
            />
          ) : unavailable || showSetup ? (
            <AgentSetup
              initial={modelConnection}
              connections={connections}
              activeSlug={activeConnectionSlug}
              onCancel={modelConnection?.credentialConfigured ? () => setShowSetup(false) : undefined}
              onActivate={activateConnection}
              onDelete={deleteConnection}
              onSave={async (connection, apiKey) => {
                const saved = await saveConnection(connection, apiKey);
                if (saved) setShowSetup(false);
                return saved;
              }}
            />
          ) : messages.length === 0 ? (
            <AgentWelcome onSuggestion={setDraft} />
          ) : (
            <div className="flex flex-col gap-6">
              {messages.map((message, index) => (
                <motion.section
                  key={message.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className={cx(index > 0 && "pt-2")}
                >
                  {message.role === "user" ? (
                    <>
                      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                        {t("agent.you")}
                      </p>
                      {message.selection && (
                        <SelectionAttachment selection={message.selection} />
                      )}
                      <div className="text-pretty text-[13px] leading-6 text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {message.id === lastAssistantId && activities.length > 0 && (
                        <AgentTrace activities={activities} />
                      )}
                      <div className={cx("flex items-center gap-2", activities.length > 0 && message.id === lastAssistantId && "mt-5")}>
                        <Sparkles size={13} className="text-muted" />
                        <p className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                          {t("agent.answer")}
                        </p>
                      </div>
                      <div className="mt-2 text-ink">
                        {message.content ? (
                          <Suspense fallback={<ResponseLoading />}>
                            <AgentMarkdown>{message.content}</AgentMarkdown>
                          </Suspense>
                        ) : (
                          <ResponseLoading />
                        )}
                      </div>
                      {message.content && (
                        <div className="-mb-2 -mr-2 mt-1 flex justify-end">
                          <CopyButton
                            value={message.content}
                            label={t("agent.copyResponse")}
                            className="size-10 rounded-xl"
                          />
                        </div>
                      )}
                    </>
                  )}
                </motion.section>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {!unavailable && !showSetup && (
          <footer className="shrink-0 px-5 pb-4 pt-2">
            <AnimatePresence initial={false}>
              {running && liveActivity && (
                <motion.div
                  key={liveActivity.id}
                  initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -3, filter: "blur(3px)" }}
                  transition={{ duration: 0.16, ease: EASE_OUT }}
                  className="mb-2 flex items-center gap-2.5 px-1 text-[11px] text-muted"
                >
                  <ThinkingOrb
                    state={orbStateForTool(liveActivity.name)}
                    size={20}
                    className="shrink-0"
                    aria-label={toolLabel(liveActivity.name, t)}
                  />
                  <span className="shrink-0 font-medium text-ink">
                    {toolLabel(liveActivity.name, t)}
                  </span>
                  {liveActivity.detail && (
                    <span className="truncate font-mono text-[10.5px] text-faint" title={liveActivity.detail}>
                      {liveActivity.detail}
                    </span>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
            {approval && (
              <ApprovalCard
                approval={approval}
                onRespond={(allow) => void respondApproval(allow)}
              />
            )}
            {error && (
              <div className="mb-2 flex items-start gap-2 rounded-xl bg-hover px-3 py-2 text-[11.5px] leading-5 text-muted">
                <AlertCircle className="mt-0.5 shrink-0" size={13} />
                <span className="line-clamp-2" title={error}>
                  {error || t("agent.error")}
                </span>
              </div>
            )}
            <div className="relative mt-2 rounded-2xl border border-line-soft bg-bg p-2 transition-[border-color] duration-100 focus-within:border-line">
              <span
                role="status"
                aria-live="polite"
                className="absolute -top-2.5 left-4 z-10 inline-flex h-5 items-center gap-1.5 bg-bg px-1.5 text-[10px] text-faint"
              >
                <span
                  aria-hidden="true"
                  className="relative size-[11px] shrink-0 overflow-hidden"
                >
                  <ThinkingOrb
                    state={starting ? "connecting" : running ? "working" : "breathing"}
                    size={20}
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 scale-[0.55]"
                  />
                </span>
                {composerStatus}
              </span>
              <AnimatePresence initial={false}>
                {currentNote && (
                  <motion.div
                    key={currentNote.sourceKey}
                    initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{
                      opacity: 0,
                      y: -4,
                      filter: "blur(4px)",
                      transition: { duration: 0.14, ease: EASE_OUT },
                    }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    <NoteAttachment
                      note={currentNote}
                      onRemove={() => setNoteDismissed(true)}
                    />
                  </motion.div>
                )}
                {selection && (
                  <motion.div
                    key={`${selection.sourceKey}:${selection.text}`}
                    initial={{ opacity: 0, y: 5, filter: "blur(4px)" }}
                    animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                    exit={{
                      opacity: 0,
                      y: -4,
                      filter: "blur(4px)",
                      transition: { duration: 0.14, ease: EASE_OUT },
                    }}
                    transition={{ duration: 0.16, ease: EASE_OUT }}
                  >
                    <SelectionAttachment
                      compact
                      selection={selection}
                      onRemove={() => setSelection(null)}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                rows={1}
                disabled={starting}
                placeholder={t("agent.placeholder")}
                className="max-h-32 min-h-10 w-full resize-none bg-transparent px-2.5 py-2 text-[13px] leading-5 text-ink outline-none placeholder:text-faint disabled:opacity-50"
              />
              <div className="flex items-center justify-between pl-2.5">
                <PermissionSelector
                  value={permission}
                  disabled={starting || running}
                  onChange={(next) => void setPermission(next)}
                />
                <AnimatePresence initial={false}>
                  {showComposerAction && (
                    <motion.button
                      key="composer-action"
                      type="button"
                      aria-label={running ? t("agent.stop") : t("agent.send")}
                      onClick={running ? () => void abort() : submit}
                      disabled={!running && starting}
                      initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                      animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                      exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                      transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                      className="grid size-10 shrink-0 place-items-center rounded-full transition-transform duration-100 active:scale-[0.96] disabled:opacity-25"
                    >
                      <span className="grid size-8 place-items-center rounded-full bg-invert text-invert-ink">
                        <AnimatePresence initial={false} mode="popLayout">
                          <motion.span
                            key={running ? "stop" : "send"}
                            initial={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                            animate={{ scale: 1, opacity: 1, filter: "blur(0px)" }}
                            exit={{ scale: 0.25, opacity: 0, filter: "blur(4px)" }}
                            transition={{ type: "spring", duration: 0.3, bounce: 0 }}
                          >
                            {running ? (
                              <Square size={10} fill="currentColor" />
                            ) : (
                              <ArrowUp size={14} strokeWidth={2.2} />
                            )}
                          </motion.span>
                        </AnimatePresence>
                      </span>
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </footer>
        )}
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}

const AUTH_LABELS: Record<AgentAuthType,
  | "agent.auth.apiKey"
  | "agent.auth.oauth"
  | "agent.auth.iam"
  | "agent.auth.serviceAccount"
  | "agent.auth.environment"
  | "agent.auth.none"
> = {
  apiKey: "agent.auth.apiKey",
  oauth: "agent.auth.oauth",
  iam: "agent.auth.iam",
  serviceAccount: "agent.auth.serviceAccount",
  environment: "agent.auth.environment",
  none: "agent.auth.none",
};

function AgentSetup({
  initial,
  connections,
  activeSlug,
  onSave,
  onActivate,
  onDelete,
  onCancel,
}: {
  initial: AgentConnection | null;
  connections: AgentConnection[];
  activeSlug: string | null;
  onSave: (connection: AgentConnectionConfig, apiKey?: string) => Promise<boolean>;
  onActivate: (slug: string) => Promise<boolean>;
  onDelete: (slug: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const t = useT();
  const [providers, setProviders] = useState<AgentProvider[]>([]);
  const [models, setModels] = useState<AgentModel[]>([]);
  const [showForm, setShowForm] = useState(connections.length === 0);
  const [editing, setEditing] = useState<AgentConnection | null>(connections.length ? initial : null);
  const [slug, setSlug] = useState(initial?.slug ?? `connection-${crypto.randomUUID().slice(0, 8)}`);
  const [name, setName] = useState(initial?.name ?? "");
  const [provider, setProvider] = useState(initial?.provider ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [authType, setAuthType] = useState<AgentAuthType>(initial?.authType ?? "apiKey");
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [endpointApi, setEndpointApi] = useState<AgentEndpointApi>(
    initial?.endpointApi ?? "openai-completions",
  );
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [validation, setValidation] = useState<string | null>(null);
  const [oauthReady, setOauthReady] = useState(
    initial?.authType === "oauth" && initial.credentialConfigured,
  );
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);
  const [oauthPrompt, setOauthPrompt] = useState<{
    requestId: string;
    type: string;
    message: string;
    placeholder?: string;
    options?: Array<{ id: string; label: string; description?: string }>;
  } | null>(null);
  const [oauthInput, setOauthInput] = useState("");
  const custom = provider === "custom" || provider === "ollama";
  const selectedProvider = providers.find((item) => item.id === provider) ?? null;

  useEffect(() => {
    void ipc.agentProvidersList().then((items) => {
      const sorted = [...items].sort((left, right) => left.name.localeCompare(right.name));
      setProviders(sorted);
      if (!provider) {
        const first = sorted.find((item) => item.id === "openai") ?? sorted[0];
        if (first) {
          setProvider(first.id);
          setName(first.name);
          setAuthType(first.authMethods[0] ?? "environment");
        }
      }
    }).catch((error) => setValidation(String(error)));
  }, []);

  useEffect(() => {
    if (!provider || custom) {
      setModels([]);
      return;
    }
    void ipc.agentModelsList(provider).then((items) => {
      setModels(items);
      setModel((current) => current || items[0]?.id || "");
    }).catch((error) => setValidation(String(error)));
  }, [custom, provider]);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<Record<string, unknown>>("ornata-agent-oauth-event", ({ payload }) => {
      if (payload.type === "oauthEvent") {
        const event = payload.event as Record<string, unknown> | undefined;
        if (event?.type === "auth_url" && typeof event.url === "string") {
          void openUrl(event.url);
          setOauthStatus(typeof event.instructions === "string" ? event.instructions : t("agent.oauth.browser"));
        } else if (event?.type === "device_code") {
          if (typeof event.verificationUri === "string") void openUrl(event.verificationUri);
          setOauthStatus(`${t("agent.oauth.code")} ${String(event.userCode ?? "")}`);
        } else if (event?.type === "progress") {
          setOauthStatus(String(event.message ?? ""));
        }
      } else if (payload.type === "oauthPrompt") {
        const prompt = payload.prompt as Record<string, unknown> | undefined;
        if (typeof payload.requestId === "string" && prompt && typeof prompt.type === "string" && typeof prompt.message === "string") {
          setOauthPrompt({
            requestId: payload.requestId,
            type: prompt.type,
            message: prompt.message,
            placeholder: typeof prompt.placeholder === "string" ? prompt.placeholder : undefined,
            options: Array.isArray(prompt.options) ? prompt.options as Array<{ id: string; label: string }> : undefined,
          });
        }
      } else if (payload.type === "complete") {
        setOauthReady(true);
        setOauthPrompt(null);
        setOauthStatus(t("agent.oauth.connected"));
      } else if (payload.type === "error") {
        setOauthStatus(null);
        setValidation(typeof payload.message === "string" ? payload.message : t("agent.oauth.failed"));
      }
    }).then((dispose) => { unlisten = dispose; });
    return () => { unlisten?.(); };
  }, [t]);

  const beginEdit = (connection: AgentConnection | null) => {
    const nextSlug = connection?.slug ?? `connection-${crypto.randomUUID().slice(0, 8)}`;
    const fallbackProvider = providers.find((item) => item.id === "openai") ?? providers[0];
    const nextProvider = connection?.provider ?? fallbackProvider?.id ?? "";
    setEditing(connection);
    setSlug(nextSlug);
    setName(connection?.name ?? fallbackProvider?.name ?? "");
    setProvider(nextProvider);
    setModel(connection?.model ?? "");
    setAuthType(connection?.authType ?? fallbackProvider?.authMethods[0] ?? "environment");
    setBaseUrl(connection?.baseUrl ?? "");
    setEndpointApi(connection?.endpointApi ?? "openai-completions");
    setApiKey("");
    setOauthReady(connection?.authType === "oauth" && connection.credentialConfigured);
    setOauthStatus(null);
    setValidation(null);
    setShowForm(true);
  };

  const chooseProvider = (next: string) => {
    const nextProvider = providers.find((item) => item.id === next);
    setProvider(next);
    setName(nextProvider?.name ?? next);
    setModel("");
    setAuthType(nextProvider?.authMethods[0] ?? "environment");
    setBaseUrl(next === "ollama" ? "http://localhost:11434/v1" : "");
    setEndpointApi("openai-completions");
    setOauthReady(false);
    setValidation(null);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!model.trim()) {
      setValidation(t("agent.setup.modelRequired"));
      return;
    }
    if (custom && !baseUrl.trim()) {
      setValidation(t("agent.setup.endpointRequired"));
      return;
    }
    const changedProvider = editing && editing.provider !== provider;
    if (authType === "apiKey" && (!editing?.credentialConfigured || changedProvider) && !apiKey.trim()) {
      setValidation(t("agent.setup.keyRequired"));
      return;
    }
    if (authType === "oauth" && !oauthReady) {
      setValidation(t("agent.oauth.required"));
      return;
    }
    setSaving(true);
    setValidation(null);
    await onSave(
      {
        slug,
        name: name.trim() || selectedProvider?.name || provider,
        provider,
        model: model.trim(),
        authType,
        baseUrl: custom ? baseUrl.trim() : null,
        endpointApi: custom ? endpointApi : null,
      },
      apiKey.trim() || undefined,
    );
    setSaving(false);
  };

  const fieldClass =
    "mt-1.5 h-10 w-full rounded-xl border border-line-soft bg-bg px-3 text-[12px] text-ink outline-none transition-[border-color] duration-100 focus:border-line";

  return (
    <form onSubmit={submit} className="mx-auto flex min-h-full w-full max-w-[360px] flex-col py-5">
      <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
        <ShieldCheck size={13} />
        {t("agent.setup.eyebrow")}
      </span>
      <h3 className="mt-4 text-[20px] font-semibold tracking-[-0.02em] text-ink">
        {showForm ? (editing ? t("agent.setup.changeTitle") : t("agent.setup.title")) : t("agent.connections.title")}
      </h3>
      <p className="mt-2 text-[12px] leading-5 text-muted">
        {t("agent.setup.detail")}
      </p>

      {!showForm ? (
        <div className="mt-5 flex flex-col gap-2">
          {connections.map((connection) => (
            <div key={connection.slug} className={cx("flex items-center gap-3 rounded-xl border p-3", connection.slug === activeSlug ? "border-line bg-hover" : "border-line-soft")}>
              <button type="button" onClick={() => void onActivate(connection.slug)} className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[12px] font-medium text-ink">{connection.name}</span>
                <span className="mt-0.5 block truncate text-[10.5px] text-faint">{connection.provider} · {connection.model}</span>
              </button>
              {connection.slug === activeSlug && <Check size={13} className="text-muted" />}
              <button type="button" onClick={() => beginEdit(connection)} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-active hover:text-ink"><PencilLine size={13} /></button>
              <button type="button" onClick={() => {
                if (window.confirm(t("agent.connections.deleteConfirm"))) void onDelete(connection.slug);
              }} className="grid size-8 place-items-center rounded-lg text-faint hover:bg-active hover:text-danger"><X size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={() => beginEdit(null)} className="mt-1 h-10 rounded-xl border border-dashed border-line text-[12px] font-medium text-muted hover:bg-hover hover:text-ink">{t("agent.connections.add")}</button>
        </div>
      ) : (<>
      <label className="mt-5 text-[10.5px] font-medium text-muted">
        {t("agent.setup.provider")}
        <select value={provider} onChange={(event) => chooseProvider(event.target.value)} className={fieldClass}>
          {providers.map((item) => (
            <option key={item.id} value={item.id}>{item.name} ({item.modelCount})</option>
          ))}
        </select>
      </label>
      <label className="mt-3 text-[10.5px] font-medium text-muted">
        {t("agent.connections.name")}
        <input value={name} onChange={(event) => setName(event.target.value)} className={fieldClass} />
      </label>
      <label className="mt-3 text-[10.5px] font-medium text-muted">
        {t("agent.setup.model")}
        {custom ? (
          <input value={model} onChange={(event) => setModel(event.target.value)} className={fieldClass} placeholder="model-id" />
        ) : (
          <select value={model} onChange={(event) => setModel(event.target.value)} className={fieldClass}>
            {!models.length && <option value="">{t("agent.models.loading")}</option>}
            {models.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.id}</option>)}
          </select>
        )}
      </label>
      {selectedProvider && (
        <label className="mt-3 text-[10.5px] font-medium text-muted">
          {t("agent.setup.auth")}
          <select disabled={selectedProvider.authMethods.length === 1} value={authType} onChange={(event) => { setAuthType(event.target.value as AgentAuthType); setOauthReady(false); }} className={fieldClass}>
            {selectedProvider.authMethods.map((method) => <option key={method} value={method}>{t(AUTH_LABELS[method])}</option>)}
          </select>
        </label>
      )}
      {(["iam", "serviceAccount", "environment"] as AgentAuthType[]).includes(authType) && (
        <p className="mt-2 text-[10.5px] leading-4 text-faint">{t("agent.auth.ambientDetail")}</p>
      )}
      {custom && (
        <>
          <label className="mt-3 text-[10.5px] font-medium text-muted">
            {t("agent.setup.endpoint")}
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className={fieldClass} placeholder="http://localhost:11434/v1" />
          </label>
          <label className="mt-3 text-[10.5px] font-medium text-muted">
            {t("agent.setup.protocol")}
            <select value={endpointApi} onChange={(event) => setEndpointApi(event.target.value as AgentEndpointApi)} className={fieldClass}>
              <option value="openai-completions">OpenAI compatible</option>
              <option value="anthropic-messages">Anthropic Messages</option>
            </select>
          </label>
        </>
      )}
      {authType === "apiKey" && (
        <label className="mt-3 text-[10.5px] font-medium text-muted">
          {t("agent.setup.apiKey")}
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            className={fieldClass}
            placeholder={editing?.credentialConfigured ? t("agent.setup.keepKey") : "sk-…"}
          />
        </label>
      )}
      {authType === "oauth" && (
        <div className="mt-4 rounded-xl bg-hover p-3">
          <button type="button" disabled={oauthReady} onClick={() => {
            setValidation(null);
            setOauthStatus(t("agent.oauth.starting"));
            void ipc.agentOAuthStart(provider, slug).catch((error) => setValidation(String(error)));
          }} className="h-9 w-full rounded-lg bg-invert text-[11.5px] font-medium text-invert-ink disabled:opacity-50">
            {oauthReady ? t("agent.oauth.connected") : t("agent.oauth.signIn")}
          </button>
          {oauthStatus && <p className="mt-2 text-[10.5px] leading-4 text-muted">{oauthStatus}</p>}
          {oauthPrompt && (
            <div className="mt-2">
              <p className="text-[10.5px] leading-4 text-muted">{oauthPrompt.message}</p>
              {oauthPrompt.type === "select" ? (
                <select value={oauthInput} onChange={(event) => setOauthInput(event.target.value)} className={fieldClass}>
                  <option value="">—</option>
                  {oauthPrompt.options?.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              ) : (
                <input type={oauthPrompt.type === "secret" ? "password" : "text"} value={oauthInput} onChange={(event) => setOauthInput(event.target.value)} placeholder={oauthPrompt.placeholder} className={fieldClass} />
              )}
              <button type="button" onClick={() => {
                void ipc.agentOAuthRespond(oauthPrompt.requestId, oauthInput);
                setOauthPrompt(null);
                setOauthInput("");
              }} className="mt-2 h-8 w-full rounded-lg border border-line text-[11px] font-medium text-ink">{t("common.confirm")}</button>
            </div>
          )}
        </div>
      )}
      {validation && <p className="mt-3 text-[11px] leading-4 text-danger">{validation}</p>}
      <div className="mt-5 flex gap-2">
        <button type="button" onClick={() => connections.length ? setShowForm(false) : onCancel?.()} className="h-10 flex-1 rounded-xl text-[12px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink">{t("common.cancel")}</button>
        <button type="submit" disabled={saving} className="h-10 flex-1 rounded-xl bg-invert text-[12px] font-medium text-invert-ink transition-transform active:scale-[0.97] disabled:opacity-50">
          {saving ? t("agent.setup.connecting") : t("agent.setup.connect")}
        </button>
      </div>
      <p className="mt-3 text-center text-[10px] leading-4 text-faint">
        {t("agent.setup.keychain")}
      </p>
      </>)}
      {!showForm && onCancel && <button type="button" onClick={onCancel} className="mt-4 h-10 rounded-xl text-[12px] font-medium text-muted hover:bg-hover hover:text-ink">{t("common.done")}</button>}
    </form>
  );
}

function ApprovalCard({
  approval,
  onRespond,
}: {
  approval: { resource: string; action: string; args: Record<string, unknown> };
  onRespond: (allow: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="mb-2 rounded-2xl border border-line bg-bg p-3 shadow-lg shadow-black/5">
      <div className="flex items-start gap-2.5">
        <PencilLine className="mt-1 shrink-0 text-muted" size={15} />
        <ApprovalPreview approval={approval} />
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => onRespond(false)} className="h-8 rounded-lg px-3 text-[11px] font-medium text-muted transition-colors hover:bg-hover hover:text-ink">
          {t("agent.approval.deny")}
        </button>
        <button type="button" onClick={() => onRespond(true)} className="h-8 rounded-lg bg-invert px-3 text-[11px] font-medium text-invert-ink transition-transform active:scale-[0.97]">
          {t("agent.approval.allow")}
        </button>
      </div>
    </div>
  );
}

function NoteAttachment({
  note,
  onRemove,
}: {
  note: AgentNoteReference;
  onRemove?: () => void;
}) {
  const t = useT();

  return (
    <div className="relative mb-1 flex min-h-12 items-center gap-2.5 rounded-xl bg-hover p-2 pr-10">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-soft bg-bg text-muted">
        <BookOpenText size={14} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-ink" title={note.title}>
          {note.title}
        </span>
        <span className="mt-0.5 block text-[10.5px] text-faint">
          {t("agent.currentNote")}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={t("agent.removeNote")}
          onClick={onRemove}
          className="absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-faint transition-[background-color,color,transform] duration-100 hover:bg-active hover:text-ink active:scale-[0.96]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function SelectionAttachment({
  selection,
  compact = false,
  onRemove,
}: {
  selection: AgentSelection;
  compact?: boolean;
  onRemove?: () => void;
}) {
  const t = useT();
  const label = `${t("agent.selection")} · ${selection.title}`;

  if (!compact) {
    return (
      <div className="mb-3 rounded-xl bg-hover px-3 py-2.5">
        <div className="flex items-center gap-2 text-[10.5px] text-faint">
          <TextQuote size={12.5} />
          <span className="truncate">{label}</span>
        </div>
        <p className="mt-2 max-h-36 overflow-y-auto whitespace-pre-wrap break-words text-[12px] leading-5 text-muted">
          {selection.text}
        </p>
      </div>
    );
  }

  const preview = selection.text.replace(/\s+/g, " ").trim();
  return (
    <div className="relative mb-1 flex min-h-14 items-center gap-2.5 rounded-xl bg-hover p-2 pr-10">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg border border-line-soft bg-bg text-muted">
        <TextQuote size={14} />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12px] font-medium text-ink" title={selection.text}>
          {preview}
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-faint">
          {label}
        </span>
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label={t("agent.removeSelection")}
          onClick={onRemove}
          className="absolute right-0 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-faint transition-[background-color,color,transform] duration-100 hover:bg-active hover:text-ink active:scale-[0.96]"
        >
          <X size={13} />
        </button>
      )}
    </div>
  );
}

const PERMISSIONS: Array<{
  value: AgentPermission;
  label: "agent.permission.readOnly" | "agent.permission.readWrite" | "agent.permission.fullAccess";
  detail: "agent.permission.readOnlyDetail" | "agent.permission.readWriteDetail" | "agent.permission.fullAccessDetail";
  icon: typeof Eye;
}> = [
  {
    value: "readOnly",
    label: "agent.permission.readOnly",
    detail: "agent.permission.readOnlyDetail",
    icon: Eye,
  },
  {
    value: "readWrite",
    label: "agent.permission.readWrite",
    detail: "agent.permission.readWriteDetail",
    icon: PencilLine,
  },
  {
    value: "fullAccess",
    label: "agent.permission.fullAccess",
    detail: "agent.permission.fullAccessDetail",
    icon: ShieldCheck,
  },
];

function PermissionSelector({
  value,
  disabled,
  onChange,
}: {
  value: AgentPermission;
  disabled: boolean;
  onChange: (value: AgentPermission) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const t = useT();
  const selected = PERMISSIONS.find((option) => option.value === value) ?? PERMISSIONS[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            role="listbox"
            aria-label={t("agent.permission.label")}
            initial={{ opacity: 0, y: 5, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: EASE_OUT }}
            className="absolute bottom-[calc(100%+8px)] left-[-10px] z-10 w-[292px] origin-bottom-left overflow-hidden rounded-2xl bg-bg p-1.5 shadow-xl shadow-black/15 dark:shadow-black/50"
          >
            {PERMISSIONS.map((option) => {
              const Icon = option.icon;
              const active = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cx(
                    "flex min-h-14 w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-[background-color,color,transform] duration-100 active:scale-[0.98]",
                    active
                      ? "bg-invert text-invert-ink"
                      : "text-ink hover:bg-hover",
                  )}
                >
                  <Icon
                    size={15}
                    className={cx(
                      "mt-0.5 shrink-0",
                      !active && option.value === "fullAccess"
                        ? "text-danger"
                        : active
                          ? "text-invert-ink"
                          : "text-muted",
                    )}
                  />
                  <span className="min-w-0">
                    <span className="block text-[12px] font-medium">
                      {t(option.label)}
                    </span>
                    <span
                      className={cx(
                        "mt-0.5 block text-[10.5px] leading-4",
                        active ? "text-invert-ink/70" : "text-faint",
                      )}
                    >
                      {t(option.detail)}
                    </span>
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="-ml-2 inline-flex min-h-8 items-center gap-1.5 rounded-lg px-2 text-[10.5px] font-medium text-muted transition-[background-color,color,transform] duration-100 hover:bg-bg hover:text-ink active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45"
      >
        <ShieldCheck size={12.5} />
        {t(selected.label)}
        <ChevronUp
          size={12}
          className={cx("transition-transform duration-100", !open && "rotate-180")}
        />
      </button>
    </div>
  );
}

function ResponseLoading() {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 text-faint">
      <span className="size-1 animate-pulse rounded-full bg-current" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
    </span>
  );
}

function AgentWelcome({ onSuggestion }: { onSuggestion: (value: string) => void }) {
  const t = useT();
  const permission = useAgent((state) => state.permission);
  const permissionLabel =
    PERMISSIONS.find((option) => option.value === permission)?.label ??
    "agent.permission.readOnly";
  const capabilities = [
    [BookOpenText, t("agent.capability.read"), t("agent.capability.readDetail")],
    [Search, t("agent.capability.search"), t("agent.capability.searchDetail")],
    [Sparkles, t("agent.capability.answer"), t("agent.capability.answerDetail")],
  ] as const;
  const suggestions = [
    t("agent.suggestion.summary"),
    t("agent.suggestion.find"),
    t("agent.suggestion.connect"),
  ];

  return (
    <div className="mx-auto flex min-h-full max-w-[336px] flex-col justify-center py-5">
      <div className="mb-4">
        <ThinkingOrb
          state={permission === "readOnly" ? "breathing" : "shaping"}
          size={64}
          aria-label={t(permissionLabel)}
        />
      </div>
      <h3 className="mt-4 text-balance text-[20px] font-semibold leading-7 tracking-[-0.02em] text-ink">
        {t("agent.emptyTitle")}
      </h3>
      <p className="mt-2 text-pretty text-[12.5px] leading-5 text-muted">
        {t("agent.emptyDetail")}
      </p>

      <div className="mt-6">
        <span className="font-mono text-[11px] font-medium text-muted">
          {t("agent.run")}
        </span>
        <div className="mt-4 flex flex-col gap-4">
          {capabilities.map(([Icon, label, detail]) => (
            <div key={label} className="flex items-start gap-3">
              <Icon className="mt-1 shrink-0 text-muted" size={15} />
              <div className="min-w-0 flex-1 pt-0.5">
                <p className="text-[12.5px] font-medium text-ink">{label}</p>
                <p className="mt-0.5 text-pretty text-[10.5px] leading-4 text-faint">
                  {detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="min-h-10 rounded-xl px-3 text-left text-[12px] leading-5 text-muted transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
          >
            {suggestion}
          </button>
        ))}
      </div>
    </div>
  );
}

function AgentTrace({
  activities,
}: {
  activities: AgentActivity[];
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);
  // Long sessions rack up dozens of tool calls; show the latest slice until
  // the user asks for the full history so the panel DOM stays small.
  const visible = expanded ? activities : activities.slice(-VISIBLE_ACTIVITIES);
  const hidden = activities.length - visible.length;
  return (
    <div className="py-1">
      <span className="font-mono text-[11px] font-medium text-muted">
        {t("agent.run")}
      </span>
      <div className="mt-3.5 flex flex-col gap-3">
        <AnimatePresence initial={false}>
          {visible.map((activity) => {
            const Icon = toolIcon(activity.name);
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14, ease: EASE_OUT }}
                className="flex items-start gap-3"
              >
                {activity.status === "running" ? (
                  <LoaderCircle
                    className="mt-1 shrink-0 animate-spin text-muted"
                    size={15}
                  />
                ) : activity.status === "error" ? (
                  <AlertCircle className="mt-1 shrink-0 text-muted" size={15} />
                ) : (
                  <Icon className="mt-1 shrink-0 text-muted" size={15} />
                )}
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-[12.5px] font-medium text-ink">
                    {toolLabel(activity.name, t)}
                  </p>
                  {activity.detail && (
                    <p className="mt-0.5 truncate font-mono text-[10.5px] text-faint" title={activity.detail}>
                      {activity.detail}
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="self-start text-[10.5px] font-medium text-muted transition-colors hover:text-ink"
          >
            {t("agent.trace.showAll", { count: hidden })}
          </button>
        )}
      </div>
    </div>
  );
}

/** Map the in-flight tool call to a thinking-orb animation. */
function orbStateForTool(name: string): OrbState {
  if (name === "grep" || name === "find" || name === "web_search") {
    return "searching";
  }
  if (name === "web_fetch" || name === "ls") return "connecting";
  if (name === "edit" || name === "write" || name === "ornata_notes") {
    return "composing";
  }
  if (name === "bash" || name === "ornata_bash") return "working";
  return "breathing";
}

function toolIcon(name: string) {
  if (name === "read") return BookOpenText;
  if (name === "grep") return Search;
  if (name === "find") return FileSearch;
  if (name === "ls") return FolderSearch;
  if (name === "edit" || name === "write") return PencilLine;
  if (name === "bash" || name === "ornata_bash") return Terminal;
  if (name === "web_search") return Globe;
  if (name === "web_fetch") return Globe;
  return Sparkles;
}

function toolLabel(name: string, t: ReturnType<typeof useT>) {
  if (name === "read") return t("agent.tool.read");
  if (name === "grep") return t("agent.tool.grep");
  if (name === "find") return t("agent.tool.find");
  if (name === "ls") return t("agent.tool.ls");
  if (name === "edit") return t("agent.tool.edit");
  if (name === "write") return t("agent.tool.write");
  if (name === "bash" || name === "ornata_bash") return t("agent.tool.bash");
  if (name === "web_search") return t("agent.tool.webSearch");
  if (name === "web_fetch") return t("agent.tool.webFetch");
  if (name === "ornata_notes") return t("agent.tool.notes");
  return t("agent.tool.other", { tool: name });
}

function CenteredState({
  icon,
  title,
  detail,
}: {
  icon: React.ReactNode;
  title: string;
  detail?: string;
}) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center py-10 text-center">
      <span className="grid size-11 place-items-center rounded-2xl bg-hover text-muted">
        {icon}
      </span>
      <h3 className="mt-4 text-balance text-[14px] font-semibold text-ink">
        {title}
      </h3>
      {detail && (
        <p className="mt-2 max-w-[280px] text-pretty text-[12px] leading-5 text-faint">
          {detail}
        </p>
      )}
    </div>
  );
}
