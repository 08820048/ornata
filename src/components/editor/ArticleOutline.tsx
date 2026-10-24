import { useState } from "react";
import { playOutlineTick } from "@/lib/outlineSound";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";

export interface OutlineItem {
  key: string;
  text: string;
  level: 1 | 2 | 3;
}

export function ArticleOutline({
  items,
  activeKey,
  onSelect,
}: {
  items: OutlineItem[];
  activeKey: string | null;
  onSelect: (index: number) => void;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const soundEnabled = useVault((state) => state.outlineSound);
  const t = useT();

  if (items.length === 0) return null;

  return (
    <nav
      aria-label={t("editor.outline")}
      onMouseLeave={() => setHoveredIndex(null)}
      onBlur={(event) => {
        if (
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        ) {
          setHoveredIndex(null);
        }
      }}
      style={{
        right: "max(36px, calc((100% - 1200px) / 2 + 36px))",
      }}
      className="pointer-events-auto absolute top-1/2 z-20 flex w-14 -translate-y-1/2 flex-col items-end overflow-visible py-3"
    >
      {items.map((item, index) => {
        const proximity =
          hoveredIndex === null ? null : Math.abs(index - hoveredIndex);
        const focused = proximity === 0;
        const active = item.key === activeKey;

        return (
          <button
            key={item.key}
            type="button"
            aria-current={active ? "location" : undefined}
            aria-label={t("editor.outlineJump", { title: item.text })}
            onMouseEnter={() => {
              if (hoveredIndex !== index && soundEnabled) playOutlineTick();
              setHoveredIndex(index);
            }}
            onFocus={() => setHoveredIndex(index)}
            onClick={() => onSelect(index)}
            style={{
              height: `clamp(8px, calc(70vh / ${items.length}), 14px)`,
            }}
            className="group relative flex h-3.5 w-14 shrink-0 items-center justify-end rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <span
              aria-hidden="true"
              className={cx(
                "block rounded-full transition-[width,height,opacity,background-color] duration-150 [transition-timing-function:var(--ease-out)]",
                hoveredIndex === null
                  ? active
                    ? "h-0.5 w-2.5 bg-ink opacity-100"
                    : "h-px w-2.5 bg-muted opacity-60"
                  : proximity === 0
                    ? "h-0.5 w-7 bg-ink opacity-100"
                    : proximity === 1
                      ? "h-px w-5 bg-muted opacity-75"
                      : proximity === 2
                        ? "h-px w-3 bg-muted opacity-55"
                        : "h-px w-2.5 bg-faint opacity-55",
              )}
            />
            <span
              aria-hidden="true"
              className={cx(
                "pointer-events-none absolute right-11 top-1/2 w-56 -translate-y-1/2 rounded-md bg-panel px-3 py-2.5 text-left shadow-xl shadow-black/10 transition-[opacity,scale,translate,filter] duration-150 [transition-timing-function:var(--ease-out)] dark:shadow-black/45",
                focused
                  ? "translate-x-0 scale-100 opacity-100 blur-0"
                  : "translate-x-1.5 scale-[0.98] opacity-0 blur-[3px]",
              )}
            >
              <span className="block font-mono text-[9.5px] uppercase tracking-[0.08em] text-faint">
                {t("editor.outlineSection")}
              </span>
              <span className="mt-1 block line-clamp-3 text-[12px] font-semibold leading-5 text-ink [text-wrap:pretty]">
                {item.text}
              </span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
