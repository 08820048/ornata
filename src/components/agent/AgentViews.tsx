import { AlertCircle, BookOpenText, FileSearch, FolderSearch, Globe, LoaderCircle, PencilLine, Search, Sparkles, Terminal } from "lucide-react";
import type { OrbState } from "thinking-orbs";
import { ThinkingOrb } from "thinking-orbs";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { useAgent, type AgentActivity } from "@/stores/agent";
import { useT } from "@/stores/locale";
import { PERMISSIONS } from "@/components/agent/PermissionSelector";

/// Tool calls kept visible in the trace before a "show all" reveal.
const VISIBLE_ACTIVITIES = 8;

export function ResponseLoading() {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 text-faint">
      <span className="size-1 animate-pulse rounded-full bg-current" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
      <span className="size-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
    </span>
  );
}

export function AgentWelcome({ onSuggestion }: { onSuggestion: (value: string) => void }) {
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

export function AgentTrace({
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
export function orbStateForTool(name: string): OrbState {
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

export function toolLabel(name: string, t: ReturnType<typeof useT>) {
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

export function CenteredState({
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
