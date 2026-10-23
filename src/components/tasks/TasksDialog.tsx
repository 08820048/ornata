import {
  IconCheck,
  IconFileText,
} from "@tabler/icons-react";
import { notifyNotesChanged } from "@/lib/vaultEvents";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ipc } from "@/lib/ipc";
import { cx } from "@/lib/utils";
import { vaultNote } from "@/lib/noteRef";
import type { OpenTask } from "@/lib/types";
import { Modal } from "@/components/ui/Modal";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";

/**
 * Every unchecked `- [ ]` item across the vault, grouped by note. Tasks live
 * in the notes themselves; ticking one here rewrites that line on disk.
 */
export function TasksDialog() {
  const open = useUi((s) => s.tasksOpen);
  const setOpen = useUi((s) => s.setTasksOpen);
  const status = useVault((s) => s.status);
  const [tasks, setTasks] = useState<OpenTask[] | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const t = useT();

  useEffect(() => {
    if (!open || status !== "ready") return;
    let cancelled = false;
    setDone(new Set());
    ipc
      .openTasks()
      .then((list) => {
        if (!cancelled) setTasks(list);
      })
      .catch(() => {
        if (!cancelled) setTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open, status]);

  const groups = useMemo(() => {
    const byNote = new Map<string, OpenTask[]>();
    for (const task of tasks ?? []) {
      const list = byNote.get(task.rel) ?? [];
      list.push(task);
      byNote.set(task.rel, list);
    }
    return [...byNote.values()];
  }, [tasks]);

  const close = () => setOpen(false);

  const openNote = (rel: string) => {
    close();
    setTimeout(() => {
      const vault = useVault.getState();
      const note = vaultNote(rel);
      vault.expandTo(rel);
      vault.setView({ type: "note", note });
      useTabs.getState().requestScrollTop(note);
    }, 0);
  };

  const toggle = async (task: OpenTask) => {
    const key = taskKey(task);
    const checking = !done.has(key);
    const flip = (on: boolean) =>
      setDone((prev) => {
        const next = new Set(prev);
        if (on) next.add(key);
        else next.delete(key);
        return next;
      });
    flip(checking);
    try {
      await (checking ? ipc.completeTask : ipc.reopenTask)(task.rel, task.line, task.text);
      notifyNotesChanged();
    } catch (err) {
      flip(!checking);
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  if (status !== "ready") return null;

  return (
    <Modal
      open={open}
      onClose={close}
      ariaLabel={t("tasks.aria")}
      align="top"
      className="mt-[14vh] w-[560px]"
    >
      <div className="border-b border-line-soft px-4 py-3 text-[13px] font-semibold text-ink">
        {t("tasks.title")}
        {tasks && (
          <span className="ml-2 font-normal tabular-nums text-faint">
            {tasks.length - done.size}
          </span>
        )}
      </div>
      <div className="max-h-[56vh] overflow-y-auto p-2">
        {tasks?.length === 0 && (
          <p className="px-3 py-8 text-center text-[13px] text-faint">
            {t("tasks.empty")}
          </p>
        )}
        {groups.map((group) => (
          <section key={group[0].rel} className="mb-2 last:mb-0">
            <button
              type="button"
              onClick={() => openNote(group[0].rel)}
              className="flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11.5px] font-medium text-faint transition-colors duration-100 hover:text-ink"
            >
              <IconFileText size={12} stroke={2} className="shrink-0" />
              <span className="truncate">{group[0].rel.replace(/\.md$/i, "")}</span>
            </button>
            <ul>
              {group.map((task) => {
                const checked = done.has(taskKey(task));
                return (
                  <li key={taskKey(task)} className="flex items-start gap-1">
                    <button
                      type="button"
                      aria-pressed={checked}
                      aria-label={t("tasks.complete", { text: task.text })}
                      onClick={() => void toggle(task)}
                      className="group grid h-7 w-7 shrink-0 place-items-center rounded"
                    >
                      <span
                        className={cx(
                          "grid size-4 place-items-center rounded-[2px] border-2 border-todo transition-colors duration-100",
                          checked ? "bg-todo text-[var(--accent-ink)]" : "bg-transparent group-hover:bg-todo/15",
                        )}
                      >
                        {checked && <IconCheck size={11} stroke={3} />}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => openNote(task.rel)}
                      className="min-w-0 flex-1 rounded px-1.5 py-1 text-left text-[13px] leading-5 text-ink transition-colors duration-100 hover:bg-hover"
                    >
                      <span className={checked ? "text-faint line-through" : undefined}>
                        {task.text}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  );
}

function taskKey(task: OpenTask) {
  return `${task.rel}:${task.line}`;
}
