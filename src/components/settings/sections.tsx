import {
  FolderOpen,
  Languages,
  Monitor,
  Moon,
  Sun,
} from "lucide-react";
import type { MessageKey } from "@/lib/i18n";
import type { Language, Theme } from "@/lib/types";
import { Button } from "@/components/ui/Button";
import {
  Kbd,
  Segmented,
  SettingGroup,
  SettingRow,
  Toggle,
} from "@/components/settings/controls";
import { ImageUploadSettings } from "@/components/settings/ImageUploadSettings";
import { PdfExportSettings } from "@/components/settings/PdfExportSettings";
import { UpdateControl } from "@/components/settings/UpdateControl";
import { SHORTCUTS } from "@/lib/shortcuts";
import { keyLabel } from "@/lib/utils";
import { useLocale, useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";
import packageInfo from "../../../package.json";

const THEMES: Array<{ value: Theme; label: MessageKey; icon: typeof Sun }> = [
  { value: "system", label: "settings.theme.system", icon: Monitor },
  { value: "light", label: "settings.theme.light", icon: Sun },
  { value: "dark", label: "settings.theme.dark", icon: Moon },
];

const LANGUAGES: Array<{ value: Language; label: MessageKey }> = [
  { value: "en", label: "settings.language.en" },
  { value: "zh-CN", label: "settings.language.zhCN" },
];

export function GeneralSection() {
  const t = useT();
  const language = useLocale((s) => s.language);
  const setLanguage = useLocale((s) => s.setLanguage);

  return (
    <>
      <SettingGroup title={t("settings.language")}>
        <SettingRow label={t("settings.language.app")}>
          <Segmented
            id="settings-language"
            value={language}
            ariaLabel={t("settings.language.aria")}
            options={LANGUAGES.map(({ value, label }) => ({
              value,
              label: t(label),
              icon: Languages,
            }))}
            onChange={(value) => void setLanguage(value)}
            className="w-[248px]"
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title={t("settings.about")}>
        <SettingRow label={t("settings.version")}>
          <span className="font-mono text-[12px] tabular-nums text-muted">
            {packageInfo.version}
          </span>
        </SettingRow>
      </SettingGroup>
    </>
  );
}

export function AppearanceSection() {
  const t = useT();
  const theme = useVault((s) => s.theme);
  const setTheme = useVault((s) => s.setTheme);

  return (
    <SettingGroup
      title={t("settings.appearance")}
      hint={`${keyLabel("⌘⇧D")} ${t("settings.toCycle")}`}
    >
      <SettingRow label={t("settings.theme")}>
        <Segmented
          id="settings-theme"
          value={theme}
          ariaLabel={t("settings.theme")}
          options={THEMES.map(({ value, label, icon }) => ({
            value,
            label: t(label),
            icon,
          }))}
          onChange={(value) => void setTheme(value)}
          className="w-[268px]"
        />
      </SettingRow>
    </SettingGroup>
  );
}

export function EditorSection() {
  const t = useT();
  const outlineSound = useVault((s) => s.outlineSound);
  const setOutlineSound = useVault((s) => s.setOutlineSound);
  const cursorAnimation = useVault((s) => s.cursorAnimation);
  const setCursorAnimation = useVault((s) => s.setCursorAnimation);

  return (
    <SettingGroup title={t("settings.editor")}>
      <SettingRow
        label={t("settings.cursorAnimation")}
        hint={t("settings.cursorAnimationDetail")}
      >
        <Toggle
          checked={cursorAnimation}
          onChange={(value) => void setCursorAnimation(value)}
          label={t("settings.cursorAnimation")}
        />
      </SettingRow>
      <SettingRow
        label={t("settings.outlineSound")}
        hint={t("settings.outlineSoundDetail")}
      >
        <Toggle
          checked={outlineSound}
          onChange={(value) => void setOutlineSound(value)}
          label={t("settings.outlineSound")}
        />
      </SettingRow>
    </SettingGroup>
  );
}

export function ImageSection() {
  const t = useT();
  return (
    <SettingGroup title={t("settings.imageUpload")}>
      <ImageUploadSettings />
    </SettingGroup>
  );
}

export function ExportSection() {
  const t = useT();
  return (
    <SettingGroup title={t("settings.pdf")}>
      <PdfExportSettings />
    </SettingGroup>
  );
}

export function VaultSection() {
  const t = useT();
  const root = useVault((s) => s.root);
  const chooseVault = useVault((s) => s.chooseVault);

  return (
    <SettingGroup title={t("settings.vault")}>
      <div className="flex items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate rounded-lg border border-line-soft bg-panel px-3 py-2 font-mono text-[11.5px] text-muted"
          title={root}
        >
          {root || t("settings.vaultNone")}
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void chooseVault()}
          className="shrink-0"
        >
          <FolderOpen size={13.5} strokeWidth={1.75} />
          {t("settings.change")}
        </Button>
      </div>
    </SettingGroup>
  );
}

export function ShortcutsSection() {
  const t = useT();
  return (
    <SettingGroup title={t("settings.shortcuts")}>
      <div className="overflow-hidden rounded-xl border border-line-soft">
        {Object.values(SHORTCUTS).map((shortcut, i) => (
          <div
            key={shortcut.label}
            className={
              "flex items-center justify-between px-3 py-2 text-[13px] text-muted" +
              (i > 0 ? " border-t border-line-soft" : "")
            }
          >
            <span>{t(shortcut.label)}</span>
            <span className="flex items-center gap-1">
              {shortcut.keys.map((key, j) => (
                <Kbd key={j}>{key}</Kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </SettingGroup>
  );
}

export function UpdatesSection() {
  const t = useT();
  return (
    <SettingGroup title={t("settings.updates")}>
      <UpdateControl />
    </SettingGroup>
  );
}
