import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  IconCheck,
  IconDeviceDesktop,
  IconMoon,
  IconPalette,
  IconSun,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { Tooltip } from "@/components/ui/Tooltip";
import { EASE_OUT } from "@/lib/ease";
import { DARK_PALETTES, LIGHT_PALETTES, type PaletteInfo } from "@/lib/palettes";
import type { Theme } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";
import type { MessageKey } from "@/lib/i18n";

const MODES: Array<{ value: Theme; label: MessageKey; icon: typeof IconSun }> = [
  { value: "system", label: "settings.theme.system", icon: IconDeviceDesktop },
  { value: "light", label: "settings.theme.light", icon: IconSun },
  { value: "dark", label: "settings.theme.dark", icon: IconMoon },
];

/** Status-bar palette icon: a small popover to flip light/dark/auto and pick
 *  the colour scheme for the mode in use, without opening Settings. */
export function ThemeSwitcher() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState({ right: 0, bottom: 0 });

  const theme = useVault((s) => s.theme);
  const lightPalette = useVault((s) => s.lightPalette);
  const darkPalette = useVault((s) => s.darkPalette);
  const setTheme = useVault((s) => s.setTheme);
  const setLightPalette = useVault((s) => s.setLightPalette);
  const setDarkPalette = useVault((s) => s.setDarkPalette);

  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);

  const toggle = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) {
      setAnchor({
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.top + 6,
      });
    }
    setOpen((value) => !value);
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const palettes: ReadonlyArray<PaletteInfo<string>> = dark ? DARK_PALETTES : LIGHT_PALETTES;
  const current = dark ? darkPalette : lightPalette;
  const choose = (id: string) =>
    dark ? void setDarkPalette(id as typeof darkPalette) : void setLightPalette(id as typeof lightPalette);

  return (
    <>
      <Tooltip label={t("theme.switch")} side="top">
        <button
          ref={button}
          type="button"
          aria-label={t("theme.switch")}
          aria-expanded={open}
          onClick={toggle}
          className={cx(
            "grid h-5 w-6 cursor-pointer place-items-center rounded transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-muted active:scale-[0.96]",
            open ? "bg-hover text-muted" : "text-faint",
          )}
        >
          <IconPalette size={13.5} stroke={2} />
        </button>
      </Tooltip>
      {open &&
        createPortal(
          <motion.div
            ref={panel}
            role="dialog"
            aria-label={t("theme.switch")}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: EASE_OUT }}
            className="fixed z-100 w-[216px] rounded-md border border-line bg-menu p-1.5 shadow-lg shadow-black/8 dark:shadow-black/40"
            style={{ right: anchor.right, bottom: anchor.bottom }}
          >
            <div role="group" className="grid grid-cols-3 gap-0.5 rounded-md bg-sunken p-0.5">
              {MODES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={theme === value}
                  onClick={() => void setTheme(value)}
                  className={cx(
                    "flex h-7 items-center justify-center gap-1 rounded text-[11.5px] font-medium transition-colors duration-100",
                    theme === value
                      ? "bg-invert text-invert-ink"
                      : "text-muted hover:text-ink",
                  )}
                >
                  <Icon size={12} stroke={1.75} />
                  {t(label)}
                </button>
              ))}
            </div>
            <p className="px-2 pb-1 pt-2.5 text-[10.5px] text-faint">
              {t(dark ? "settings.palette.dark" : "settings.palette.light")}
            </p>
            <div role="group">
              {palettes.map(({ id, label, swatch }) => (
                <button
                  key={id}
                  type="button"
                  aria-pressed={current === id}
                  onClick={() => choose(id)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] text-ink transition-colors duration-100 hover:bg-hover"
                >
                  <span
                    className="relative size-4 shrink-0 overflow-hidden rounded-full ring-1 ring-line"
                    style={{ background: swatch.bg }}
                  >
                    <span
                      className="absolute bottom-0 right-0 size-2 rounded-tl-full"
                      style={{ background: swatch.accent }}
                    />
                  </span>
                  <span className="flex-1 truncate">{t(label)}</span>
                  {current === id && <IconCheck size={13} stroke={2} className="shrink-0 text-muted" />}
                </button>
              ))}
            </div>
          </motion.div>,
          document.body,
        )}
    </>
  );
}
