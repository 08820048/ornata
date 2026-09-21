import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import { SPRING_LAYOUT } from "@/lib/ease";
import { cx } from "@/lib/utils";

/** A titled block of related setting rows. */
export function SettingGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-7 first:mt-0">
      <h2 className="text-[12.5px] font-semibold text-ink">{title}</h2>
      {hint && (
        <p className="mt-1 text-[11px] leading-4 text-faint">{hint}</p>
      )}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

/** Label (+ optional hint) on the left, a control on the right. */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-[13px] text-ink">{label}</p>
        {hint && (
          <p className="mt-0.5 text-[11px] leading-4 text-faint">{hint}</p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

/** Inverted-pill segmented control (the app's signature active style). */
export function Segmented<T extends string>({
  id,
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: {
  id: string;
  value: T;
  options: Array<SegmentOption<T>>;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cx("grid h-9 rounded-[10px] bg-sunken p-0.5", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const active = option.value === value;
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cx(
              "relative isolate flex items-center justify-center gap-1.5 rounded-md px-3 text-[12px] font-medium transition-colors duration-100",
              active ? "text-invert-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={id}
                initial={false}
                transition={SPRING_LAYOUT}
                className="segment-active absolute inset-0 -z-10 rounded-md bg-invert"
              />
            )}
            {Icon && <Icon size={13} strokeWidth={1.75} />}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Minimal toggle switch. */
export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        "relative h-6 w-11 rounded-full p-1 transition-[background-color,transform] duration-150 active:scale-[0.96]",
        checked ? "bg-invert" : "bg-sunken",
      )}
    >
      <motion.span
        animate={{ x: checked ? 20 : 0 }}
        transition={SPRING_LAYOUT}
        className={cx(
          "block size-4 rounded-full",
          checked ? "bg-invert-ink" : "bg-muted",
        )}
      />
    </button>
  );
}

export function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-bg px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}
