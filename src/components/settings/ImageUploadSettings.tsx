import { useEffect, useState } from "react";
import {
  IconLoader2,
  IconPhotoUp,
} from "@tabler/icons-react";
import { ipc } from "@/lib/ipc";
import type { ImageUploadMode } from "@/lib/types";
import { cx } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import { useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";

const MODES: Array<{ value: ImageUploadMode; labelKey: "settings.imageUpload.off" | "settings.imageUpload.custom" }> = [
  { value: "local", labelKey: "settings.imageUpload.off" },
  { value: "custom", labelKey: "settings.imageUpload.custom" },
];

// 1×1 transparent PNG used by "verify upload" — a real, decodable image so
// uploaders that inspect the file (PicGo, imgur, …) accept it.
const VERIFY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function ImageUploadSettings() {
  const t = useT();
  const upload = useVault((s) => s.imageUpload);
  const setImageUpload = useVault((s) => s.setImageUpload);
  // Local command state: edits stay in the box until blur/Enter so we don't
  // rewrite config.json on every keystroke.
  const [command, setCommand] = useState(upload.command);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    setCommand(upload.command);
  }, [upload.command]);

  const commitCommand = () => {
    const next = command.trim();
    if (next === upload.command.trim()) return;
    void setImageUpload({ mode: upload.mode, command: next });
  };

  const verify = async () => {
    const next = command.trim();
    if (!next) {
      toast.info(t("settings.imageUpload.saveFirst"));
      return;
    }
    setVerifying(true);
    try {
      const url = await ipc.uploadImage(VERIFY_PNG_BASE64, "png", next);
      toast.success(
        t("settings.imageUpload.verified", {
          url: url.length > 60 ? `${url.slice(0, 60)}…` : url,
        }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="rounded-xl border border-line-soft px-3 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted">
          <IconPhotoUp size={13.5} stroke={1.75} className="shrink-0" />
          <span>{t("settings.imageUpload")}</span>
        </div>
        <div
          role="group"
          aria-label={t("settings.imageUpload")}
          className="grid h-8 w-[224px] shrink-0 grid-cols-2 rounded-lg bg-sunken p-0.5"
        >
          {MODES.map(({ value, labelKey }) => (
            <button
              key={value}
              type="button"
              aria-pressed={upload.mode === value}
              className={cx(
                "relative isolate flex h-7 items-center justify-center gap-1 rounded-md text-[12px] font-medium transition-colors duration-100",
                upload.mode === value
                  ? "text-invert-ink"
                  : "text-muted hover:text-ink",
              )}
              onClick={() =>
                void setImageUpload({ mode: value, command: command.trim() })
              }
            >
              {upload.mode === value && (
                <span className="segment-active absolute inset-0 -z-10 rounded-md bg-invert" />
              )}
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>

      {upload.mode === "custom" && (
        <div className="mt-3">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onBlur={commitCommand}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitCommand();
                  e.currentTarget.blur();
                }
              }}
              placeholder={t("settings.imageUpload.commandPlaceholder")}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              aria-label={t("settings.imageUpload.commandLabel")}
              className="min-w-0 flex-1 rounded-lg border border-line-soft bg-panel px-3 py-2 font-mono text-[11.5px] text-ink outline-none transition-colors placeholder:text-faint focus:border-faint"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => void verify()}
              disabled={verifying}
              className="shrink-0"
            >
              {verifying ? (
                <IconLoader2 size={13.5} stroke={1.75} className="animate-spin" />
              ) : null}
              {verifying
                ? t("settings.imageUpload.verifying")
                : t("settings.imageUpload.verify")}
            </Button>
          </div>
          <p className="mt-2 text-[10.5px] leading-4 text-faint">
            {t("settings.imageUpload.commandHint")}
          </p>
        </div>
      )}
    </div>
  );
}
