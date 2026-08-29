import {
  FolderOpen,
  Languages,
  Monitor,
  Moon,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { motion } from "motion/react";
import { SPRING_LAYOUT } from "@/lib/ease";
import type { MessageKey } from "@/lib/i18n";
import type { Language, Theme } from "@/lib/types";
import { cx } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { UpdateControl } from "@/components/settings/UpdateControl";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useLocale, useT } from "@/stores/locale";

const THEMES: Array<{ value: Theme; label: MessageKey; icon: typeof Sun }> = [
  { value: "system", label: "settings.theme.system", icon: Monitor },
  { value: "light", label: "settings.theme.light", icon: Sun },
  { value: "dark", label: "settings.theme.dark", icon: Moon },
];

const LANGUAGES: Array<{ value: Language; label: MessageKey }> = [
  { value: "en", label: "settings.language.en" },
  { value: "zh-CN", label: "settings.language.zhCN" },
];

const SHORTCUTS: Array<{ label: MessageKey; keys: string[] }> = [
  { label: "settings.shortcut.palette", keys: ["⌘", "K"] },
  { label: "settings.shortcut.newNote", keys: ["⌘", "N"] },
  { label: "settings.shortcut.sidebar", keys: ["⌘", "\\"] },
  { label: "settings.shortcut.theme", keys: ["⌘", "⇧", "D"] },
  { label: "settings.shortcut.settings", keys: ["⌘", ","] },
  { label: "settings.shortcut.closeTab", keys: ["⌘", "W"] },
];

export function SettingsModal() {
  const open = useUi((s) => s.settingsOpen);
  const setOpen = useUi((s) => s.setSettingsOpen);
  const theme = useVault((s) => s.theme);
  const setTheme = useVault((s) => s.setTheme);
  const outlineSound = useVault((s) => s.outlineSound);
  const setOutlineSound = useVault((s) => s.setOutlineSound);
  const root = useVault((s) => s.root);
  const chooseVault = useVault((s) => s.chooseVault);
  const language = useLocale((s) => s.language);
  const setLanguage = useLocale((s) => s.setLanguage);
  const t = useT();

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel={t("common.settings")}
      className="w-[560px]"
    >
      <header className="flex items-center gap-3 px-5 py-4">
        <Settings
          size={18}
          strokeWidth={1.8}
          className="shrink-0 text-muted"
        />
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em]">
            {t("common.settings")}
          </h2>
          <p className="mt-0.5 text-[11.5px] text-faint">
            {t("settings.subtitle")}
          </p>
        </div>
        <button
          type="button"
          aria-label={t("settings.close")}
          onClick={() => setOpen(false)}
          className="ml-auto grid h-8 w-8 place-items-center rounded-md text-faint transition-colors hover:bg-hover hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
        >
          <X size={15} strokeWidth={2} />
        </button>
      </header>

      <div className="page-scroll max-h-[calc(100vh-96px)] px-5 pb-5">
        <section className="flex min-h-10 items-center justify-between gap-4 pt-5">
          <div className="flex flex-col gap-1">
            <span className="flex items-center gap-0.5 text-[10.5px] text-faint">
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>D</Kbd>
              <span className="ml-0.5">{t("settings.toCycle")}</span>
            </span>
            <Label>{t("settings.appearance")}</Label>
          </div>
          <div
            role="group"
            aria-label={t("settings.theme")}
            className="grid h-10 w-[252px] shrink-0 grid-cols-3 rounded-[10px] bg-sunken p-1"
          >
            {THEMES.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={theme === value}
                className={cx(
                  "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-[color,transform] duration-100 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.96]",
                  theme === value
                    ? "text-invert-ink"
                    : "text-muted hover:text-ink",
                )}
                onClick={() => setTheme(value)}
              >
                {theme === value && (
                  <motion.span
                    layoutId="settings-theme-active"
                    initial={false}
                    transition={SPRING_LAYOUT}
                    className="segment-active absolute inset-0 -z-10 rounded-md bg-invert"
                  />
                )}
                <Icon size={13} strokeWidth={1.75} />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 flex min-h-10 items-center justify-between gap-4">
          <Label>{t("settings.language")}</Label>
          <div
            role="group"
            aria-label={t("settings.language.aria")}
            className="grid h-10 w-[252px] shrink-0 grid-cols-2 rounded-[10px] bg-sunken p-1"
          >
            {LANGUAGES.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={language === value}
                className={cx(
                  "relative isolate flex h-8 items-center justify-center gap-1.5 rounded-md text-[12px] font-medium transition-[color,transform] duration-100 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] active:scale-[0.96]",
                  language === value
                    ? "text-invert-ink"
                    : "text-muted hover:text-ink",
                )}
                onClick={() => void setLanguage(value)}
              >
                {language === value && (
                  <motion.span
                    layoutId="settings-language-active"
                    initial={false}
                    transition={SPRING_LAYOUT}
                    className="segment-active absolute inset-0 -z-10 rounded-md bg-invert"
                  />
                )}
                <Languages size={13} strokeWidth={1.75} />
                <span>{t(label)}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="mt-3 flex min-h-10 items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[12.5px] font-medium text-ink">
              {t("settings.outlineSound")}
            </p>
            <p className="mt-0.5 text-[10.5px] leading-4 text-faint">
              {t("settings.outlineSoundDetail")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={outlineSound}
            aria-label={t("settings.outlineSound")}
            onClick={() => void setOutlineSound(!outlineSound)}
            className={cx(
              "relative h-6 w-11 shrink-0 rounded-full p-1 transition-[background-color,transform] duration-150 after:absolute after:inset-x-0 after:-inset-y-2 after:content-[''] active:scale-[0.96]",
              outlineSound ? "bg-invert" : "bg-sunken",
            )}
          >
            <motion.span
              animate={{ x: outlineSound ? 20 : 0 }}
              transition={SPRING_LAYOUT}
              className={cx(
                "block size-4 rounded-full",
                outlineSound ? "bg-invert-ink" : "bg-muted",
              )}
            />
          </button>
        </section>

        <section className="mt-5">
          <Label>{t("settings.vault")}</Label>
          <div className="mt-2 flex items-center gap-2">
            <p
              className="min-w-0 flex-1 truncate rounded-lg border border-line-soft bg-panel px-3 py-2 font-mono text-[11.5px] text-muted"
              title={root}
            >
              {root}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={chooseVault}
              className="shrink-0"
            >
              <FolderOpen size={13.5} strokeWidth={1.75} />
              {t("settings.change")}
            </Button>
          </div>
        </section>

        <section className="mt-5">
          <Label>{t("settings.shortcuts")}</Label>
          <div className="mt-2 overflow-hidden rounded-xl border border-line-soft">
            {SHORTCUTS.map((shortcut, i) => (
              <div
                key={shortcut.label}
                className={cx(
                  "flex items-center justify-between px-3 py-2 text-[13px] text-muted",
                  i > 0 && "border-t border-line-soft",
                )}
              >
                <span>{t(shortcut.label)}</span>
                <span className="flex items-center gap-1">
                  {shortcut.keys.map((k, j) => (
                    <Kbd key={j}>{k}</Kbd>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-5">
          <Label>{t("settings.updates")}</Label>
          <UpdateControl />
        </section>

        <p className="mt-6 text-center text-[11px] text-faint">
          {t("settings.footer")}
        </p>
      </div>
    </Modal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
      {children}
    </h3>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-grid h-5 min-w-5 place-items-center rounded border border-line bg-bg px-1 font-mono text-[10.5px] text-muted">
      {children}
    </kbd>
  );
}
