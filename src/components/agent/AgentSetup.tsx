import { Check, PencilLine, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ipc } from "@/lib/ipc";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import type { AgentConnection, AgentConnectionConfig, AgentEndpointApi, AgentAuthType, AgentModel, AgentProvider } from "@/lib/types";

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

export function AgentSetup({
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
