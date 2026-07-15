import {
  AlertCircle,
  ArrowUp,
  BookOpenText,
  Check,
  ChevronUp,
  Copy,
  Eye,
  FileSearch,
  FolderSearch,
  LoaderCircle,
  PencilLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Terminal,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cx } from "@/lib/utils";
import {
  useAgent,
  type AgentActivity,
} from "@/stores/agent";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import type { AgentPermission } from "@/lib/types";

const PANEL_WIDTH = 408;
const INSTALL_COMMAND =
  "npm install -g --ignore-scripts @earendil-works/pi-coding-agent";
const AgentMarkdown = lazy(() =>
  import("@/components/agent/AgentMarkdown").then((module) => ({
    default: module.AgentMarkdown,
  })),
);

export function AgentPanel() {
  const open = useUi((state) => state.agentOpen);
  const setOpen = useUi((state) => state.setAgentOpen);
  const root = useVault((state) => state.root);
  const connection = useAgent((state) => state.connection);
  const pi = useAgent((state) => state.pi);
  const model = useAgent((state) => state.model);
  const messages = useAgent((state) => state.messages);
  const activities = useAgent((state) => state.activities);
  const error = useAgent((state) => state.error);
  const initialize = useAgent((state) => state.initialize);
  const send = useAgent((state) => state.send);
  const abort = useAgent((state) => state.abort);
  const retry = useAgent((state) => state.retry);
  const permission = useAgent((state) => state.permission);
  const setPermission = useAgent((state) => state.setPermission);
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const t = useT();

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
    void send(message);
  };

  const copyInstall = () => {
    void navigator.clipboard.writeText(INSTALL_COMMAND);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const prepare = () => {
    const agent = useAgent.getState();
    if (root && agent.vaultRoot !== root) void agent.initialize(root);
  };

  const unavailable = connection === "missing";
  const starting = connection === "starting";
  const running = connection === "running";
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
              height: "min(720px, calc(100% - 24px))",
            }}
            className="pointer-events-auto absolute bottom-3 right-3 flex origin-bottom-right flex-col overflow-hidden rounded-[20px] bg-bg shadow-2xl shadow-black/20 will-change-[transform,opacity] dark:shadow-black/60"
          >
        <header className="relative grid h-14 shrink-0 place-items-center px-14">
          <p className="max-w-full truncate text-center font-mono text-[11px] text-faint">
            {model ?? t("agent.modelUnknown")}
          </p>
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
              detail={pi?.version ? t("agent.piVersion", { version: pi.version }) : undefined}
            />
          ) : unavailable ? (
            <div className="mx-auto flex min-h-full max-w-[310px] flex-col justify-center py-8">
              <CenteredState
                icon={<Sparkles size={20} />}
                title={t("agent.missingTitle")}
                detail={t("agent.missingDetail")}
              />
              <button
                type="button"
                onClick={copyInstall}
                className="mt-5 flex min-h-10 w-full items-center gap-2 rounded-xl bg-hover px-3 text-left font-mono text-[10.5px] text-muted transition-[background-color,transform] duration-100 hover:bg-active active:scale-[0.96]"
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span className="min-w-0 flex-1 truncate">
                  {copied ? t("common.copied") : INSTALL_COMMAND}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void retry()}
                className="mt-2 inline-flex min-h-10 items-center justify-center gap-2 rounded-xl text-[12.5px] font-medium text-muted transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
              >
                <RefreshCw size={14} />
                {t("agent.retry")}
              </button>
            </div>
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
                  className={cx(index > 0 && "border-t border-line-soft pt-6")}
                >
                  {message.role === "user" ? (
                    <>
                      <p className="mb-2 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                        {t("agent.you")}
                      </p>
                      <div className="text-pretty text-[13px] leading-6 text-ink">
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      {message.id === lastAssistantId && activities.length > 0 && (
                        <AgentTrace activities={activities} running={running} />
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
                    </>
                  )}
                </motion.section>
              ))}
              <div ref={endRef} />
            </div>
          )}
        </div>

        {!unavailable && (
          <footer className="shrink-0 px-5 pb-4 pt-2">
            {error && (
              <div className="mb-2 flex items-start gap-2 rounded-xl bg-hover px-3 py-2 text-[11.5px] leading-5 text-muted">
                <AlertCircle className="mt-0.5 shrink-0" size={13} />
                <span className="line-clamp-2" title={error}>
                  {error || t("agent.error")}
                </span>
              </div>
            )}
            <div className="rounded-2xl border border-line-soft bg-bg p-2 transition-[border-color] duration-100 focus-within:border-line">
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
    icon: Terminal,
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
      <span className="inline-flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
        <Sparkles size={13} />
        {t(permissionLabel)}
      </span>
      <h3 className="mt-4 text-balance text-[20px] font-semibold leading-7 tracking-[-0.02em] text-ink">
        {t("agent.emptyTitle")}
      </h3>
      <p className="mt-2 text-pretty text-[12.5px] leading-5 text-muted">
        {t("agent.emptyDetail")}
      </p>

      <div className="mt-6 border-y border-line-soft py-4">
        <div className="flex items-center justify-between border-b border-line-soft pb-3">
          <span className="font-mono text-[11px] font-medium text-muted">
            {t("agent.run")}
          </span>
          <span className="flex items-center gap-1.5 text-[10px] text-faint">
            <span className="size-1.5 rounded-full bg-muted" />
            {t("agent.status.ready")}
          </span>
        </div>
        <div className="mt-4 flex flex-col gap-4">
          {capabilities.map(([Icon, label, detail]) => (
            <div key={label} className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hover text-muted">
                <Icon size={13.5} />
              </span>
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
  running,
}: {
  activities: AgentActivity[];
  running: boolean;
}) {
  const t = useT();
  return (
    <div className="border-y border-line-soft py-4">
      <div className="flex items-center justify-between border-b border-line-soft pb-3">
        <span className="font-mono text-[11px] font-medium text-muted">
          {t("agent.run")}
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-faint">
          <span className={cx("size-1.5 rounded-full bg-muted", running && "animate-pulse")} />
          {running ? t("agent.status.working") : t("agent.status.ready")}
        </span>
      </div>
      <div className="mt-4 flex flex-col gap-3.5">
        <AnimatePresence initial={false}>
          {activities.map((activity) => {
            const Icon = toolIcon(activity.name);
            return (
              <motion.div
                key={activity.id}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.14, ease: EASE_OUT }}
                className="flex items-start gap-3"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-hover text-muted">
                  {activity.status === "running" ? (
                    <LoaderCircle className="animate-spin" size={13} />
                  ) : activity.status === "error" ? (
                    <AlertCircle size={13} />
                  ) : (
                    <Icon size={13} />
                  )}
                </span>
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
      </div>
    </div>
  );
}

function toolIcon(name: string) {
  if (name === "read") return BookOpenText;
  if (name === "grep") return Search;
  if (name === "find") return FileSearch;
  if (name === "ls") return FolderSearch;
  if (name === "edit" || name === "write") return PencilLine;
  if (name === "bash") return Terminal;
  return Sparkles;
}

function toolLabel(name: string, t: ReturnType<typeof useT>) {
  if (name === "read") return t("agent.tool.read");
  if (name === "grep") return t("agent.tool.grep");
  if (name === "find") return t("agent.tool.find");
  if (name === "ls") return t("agent.tool.ls");
  if (name === "edit") return t("agent.tool.edit");
  if (name === "write") return t("agent.tool.write");
  if (name === "bash") return t("agent.tool.bash");
  if (name === "ornata_notes") return t("agent.tool.notes");
  if (name === "ornata_todos") return t("agent.tool.todos");
  if (name === "ornata_bookmarks") return t("agent.tool.bookmarks");
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
