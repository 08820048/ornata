import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Segmented, SettingRow } from "@/components/settings/controls";
import type { MessageKey } from "@/lib/i18n";
import { ipc } from "@/lib/ipc";
import { broadcastSettings } from "@/lib/settingsSync";
import type { LineWidth, Typography } from "@/lib/types";
import {
  DEFAULT_TYPOGRAPHY,
  FONT_SIZES,
  LINE_HEIGHTS,
  normalizeTypography,
} from "@/lib/typography";
import { useT } from "@/stores/locale";

const WIDTHS: Array<{ value: LineWidth; label: MessageKey }> = [
  { value: "narrow", label: "settings.typography.width.narrow" },
  { value: "medium", label: "settings.typography.width.medium" },
  { value: "wide", label: "settings.typography.width.wide" },
];

const keysOf = <T extends string>(map: Record<T, number>) => Object.keys(map) as T[];

/**
 * Text size, line width and line height of the note page. The settings
 * window only stores the choice; the main window applies it when the change
 * is broadcast (and on its own launch).
 */
export function TypographySettings() {
  const t = useT();
  const [value, setValue] = useState<Typography | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipc
      .getTypography()
      .then((loaded) => {
        if (!cancelled) setValue(normalizeTypography(loaded));
      })
      .catch(() => {
        if (!cancelled) setValue(DEFAULT_TYPOGRAPHY);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!value) return null;

  const save = (next: Typography) => {
    const previous = value;
    setValue(next);
    broadcastSettings({ typography: next });
    ipc.setTypography(next).catch((err) => {
      setValue(previous);
      broadcastSettings({ typography: previous });
      toast.error(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <>
      <SettingRow label={t("settings.typography.size")}>
        <Segmented
          id="settings-typography-size"
          value={value.fontSize}
          ariaLabel={t("settings.typography.size")}
          options={keysOf(FONT_SIZES).map((key) => ({ value: key, label: String(FONT_SIZES[key]) }))}
          onChange={(fontSize) => save({ ...value, fontSize })}
          className="w-[240px]"
        />
      </SettingRow>
      <SettingRow
        label={t("settings.typography.width")}
        hint={t("settings.typography.widthDetail")}
      >
        <Segmented
          id="settings-typography-width"
          value={value.lineWidth}
          ariaLabel={t("settings.typography.width")}
          options={WIDTHS.map(({ value: key, label }) => ({ value: key, label: t(label) }))}
          onChange={(lineWidth) => save({ ...value, lineWidth })}
          className="w-[240px]"
        />
      </SettingRow>
      <SettingRow label={t("settings.typography.leading")}>
        <Segmented
          id="settings-typography-leading"
          value={value.lineHeight}
          ariaLabel={t("settings.typography.leading")}
          options={keysOf(LINE_HEIGHTS).map((key) => ({
            value: key,
            label: LINE_HEIGHTS[key].toFixed(1),
          }))}
          onChange={(lineHeight) => save({ ...value, lineHeight })}
          className="w-[240px]"
        />
      </SettingRow>
    </>
  );
}
