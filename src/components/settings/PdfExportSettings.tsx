import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Segmented, SettingRow } from "@/components/settings/controls";
import type { MessageKey } from "@/lib/i18n";
import { ipc } from "@/lib/ipc";
import type { PageMargins, PaperSize, PdfSettings } from "@/lib/types";
import { useT } from "@/stores/locale";

const PAPERS: Array<{ value: PaperSize; label: MessageKey }> = [
  { value: "system", label: "settings.pdf.paper.system" },
  { value: "a4", label: "settings.pdf.paper.a4" },
  { value: "letter", label: "settings.pdf.paper.letter" },
  { value: "a5", label: "settings.pdf.paper.a5" },
];

const MARGINS: Array<{ value: PageMargins; label: MessageKey }> = [
  { value: "narrow", label: "settings.pdf.margins.narrow" },
  { value: "normal", label: "settings.pdf.margins.normal" },
  { value: "wide", label: "settings.pdf.margins.wide" },
];

/**
 * Page setup for "Export as PDF". Only the backend reads it (at export
 * time), so it lives here rather than in the vault store: loaded on mount,
 * saved on change.
 */
export function PdfExportSettings() {
  const t = useT();
  const [pdf, setPdf] = useState<PdfSettings | null>(null);

  useEffect(() => {
    let cancelled = false;
    ipc
      .getPdfSettings()
      .then((value) => {
        if (!cancelled) setPdf(value);
      })
      .catch(() => {
        if (!cancelled) setPdf({ paper: "system", margins: "normal" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!pdf) return null;

  const save = (next: PdfSettings) => {
    const previous = pdf;
    setPdf(next);
    ipc.setPdfSettings(next).catch((err) => {
      setPdf(previous);
      toast.error(err instanceof Error ? err.message : String(err));
    });
  };

  return (
    <>
      <SettingRow label={t("settings.pdf.paper")} hint={t("settings.pdf.paperDetail")}>
        <Segmented
          id="settings-pdf-paper"
          value={pdf.paper}
          ariaLabel={t("settings.pdf.paper")}
          options={PAPERS.map(({ value, label }) => ({ value, label: t(label) }))}
          onChange={(paper) => save({ ...pdf, paper })}
          className="w-[300px]"
        />
      </SettingRow>
      <SettingRow label={t("settings.pdf.margins")} hint={t("settings.pdf.marginsDetail")}>
        <Segmented
          id="settings-pdf-margins"
          value={pdf.margins}
          ariaLabel={t("settings.pdf.margins")}
          options={MARGINS.map(({ value, label }) => ({ value, label: t(label) }))}
          onChange={(margins) => save({ ...pdf, margins })}
          className="w-[240px]"
        />
      </SettingRow>
    </>
  );
}
