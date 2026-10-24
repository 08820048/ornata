import type { PaletteInfo } from "@/lib/palettes";
import { useT } from "@/stores/locale";
import { cx } from "@/lib/utils";

/** A row of palette cards — a miniature page (sidebar, text lines, accent) —
 *  with the chosen one ringed. */
export function PalettePicker<T extends string>({
  value,
  palettes,
  onChange,
  ariaLabel,
}: {
  value: T;
  palettes: ReadonlyArray<PaletteInfo<T>>;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  const t = useT();
  return (
    <div role="group" aria-label={ariaLabel} className="grid grid-cols-5 gap-x-3.5 gap-y-3">
      {palettes.map(({ id, label, swatch }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(id)}
            className="group flex min-w-0 flex-col gap-1.5 text-left"
          >
            <span
              className={cx(
                "mx-0.5 flex h-[54px] overflow-hidden rounded-lg transition-shadow duration-100",
                active
                  ? "ring-2 ring-ink ring-offset-2 ring-offset-bg"
                  : "ring-1 ring-line group-hover:ring-faint",
              )}
              style={{ background: swatch.bg }}
            >
              <span className="w-[24%]" style={{ background: swatch.panel }} />
              <span className="flex flex-1 flex-col justify-center gap-1.5 px-2.5">
                <span
                  className="h-[3px] w-4/5 rounded-full"
                  style={{ background: swatch.ink, opacity: 0.75 }}
                />
                <span
                  className="h-[3px] w-3/5 rounded-full"
                  style={{ background: swatch.ink, opacity: 0.4 }}
                />
                <span
                  className="h-[3px] w-2/5 rounded-full"
                  style={{ background: swatch.accent }}
                />
              </span>
            </span>
            <span
              className={cx(
                "truncate text-[11.5px]",
                active ? "font-medium text-ink" : "text-muted",
              )}
            >
              {t(label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
