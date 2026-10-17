import { ChevronUp, Eye, PencilLine, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { EASE_OUT } from "@/lib/ease";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import type { AgentPermission } from "@/lib/types";

export const PERMISSIONS: Array<{
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

export function PermissionSelector({
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
