import { ListChecks, Link2, TextQuote } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";
import { useT } from "@/stores/locale";

/**
 * One-tap actions for the attached note — the things a notes assistant is
 * for, rather than a blank chat box. Each sends a precise instruction (and
 * shows only its short label in the transcript). Suggest links and extract
 * tasks explicitly don't edit: they propose, the user decides.
 */
export type NoteAction = "summarize" | "suggestLinks" | "extractTasks";

export const NOTE_ACTIONS: {
  id: NoteAction;
  icon: typeof TextQuote;
  label: MessageKey;
  prompt: MessageKey;
}[] = [
  { id: "summarize", icon: TextQuote, label: "agent.action.summarize", prompt: "agent.action.summarizePrompt" },
  { id: "suggestLinks", icon: Link2, label: "agent.action.suggestLinks", prompt: "agent.action.suggestLinksPrompt" },
  { id: "extractTasks", icon: ListChecks, label: "agent.action.extractTasks", prompt: "agent.action.extractTasksPrompt" },
];

export function NoteActions({ onRun }: { onRun: (action: (typeof NOTE_ACTIONS)[number]) => void }) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-1 px-1 pb-1.5" role="group" aria-label={t("agent.action.aria")}>
      {NOTE_ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onRun(action)}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-line-soft px-2 text-[11.5px] text-muted transition-colors duration-100 hover:border-line hover:bg-hover hover:text-ink"
          >
            <Icon size={12} />
            {t(action.label)}
          </button>
        );
      })}
    </div>
  );
}
