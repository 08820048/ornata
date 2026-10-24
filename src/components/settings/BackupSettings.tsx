import { useCallback, useEffect, useState } from "react";
import { IconFolderOpen } from "@tabler/icons-react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/Button";
import { ipc } from "@/lib/ipc";
import type { BackupInfo } from "@/lib/types";
import { useLocale, useT } from "@/stores/locale";
import { toast } from "sonner";

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Backup folder, the last run's outcome, and a "back up now" button. */
export function BackupSettings() {
  const t = useT();
  const language = useLocale((s) => s.language);
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    ipc.getBackup().then(setInfo).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    let off: (() => void) | undefined;
    let cancelled = false;
    listen("ornata-backup", refresh)
      .then((un) => (cancelled ? un() : (off = un)))
      .catch(() => undefined);
    return () => {
      cancelled = true;
      off?.();
    };
  }, [refresh]);

  const backUp = useCallback(async () => {
    setBusy(true);
    try {
      setInfo(await ipc.runBackupNow());
    } catch (err) {
      toast.error(t("toast.backupFailed"), {
        description: err instanceof Error ? err.message : String(err),
      });
      refresh();
    } finally {
      setBusy(false);
    }
  }, [refresh, t]);

  // Picking a folder takes the first backup straight away, so the setting
  // proves itself instead of waiting for the scheduler.
  const adopt = useCallback(
    async (pick: () => Promise<BackupInfo | null>) => {
      try {
        const next = await pick();
        if (!next) return;
        setInfo(next);
        await backUp();
      } catch (err) {
        toast.error(t("toast.backupFailed"), {
          description: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [backUp, t],
  );

  if (!info) return null;
  const { folder, suggestions, last } = info;
  const when = last
    ? new Date(last.atMs).toLocaleString(language === "zh-CN" ? "zh-CN" : "en", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";

  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <p
          className="min-w-0 flex-1 truncate rounded-lg border border-line-soft bg-panel px-3 py-2 font-mono text-[11.5px] text-muted"
          title={folder ?? undefined}
        >
          {folder ?? t("settings.backup.none")}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => void adopt(() => ipc.chooseBackupFolder())}
          className="shrink-0"
        >
          <IconFolderOpen size={13.5} stroke={1.75} />
          {t("settings.backup.choose")}
        </Button>
      </div>

      {suggestions.filter((s) => s.path !== folder).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions
            .filter((s) => s.path !== folder)
            .map((s) => (
              <button
                key={s.path}
                type="button"
                disabled={busy}
                onClick={() => void adopt(() => ipc.setBackupFolder(s.path))}
                className="h-7 rounded-full bg-sunken px-3 text-[12px] font-medium text-muted transition-colors duration-100 hover:bg-active hover:text-ink disabled:opacity-60"
              >
                {t("settings.backup.use", { name: s.label })}
              </button>
            ))}
        </div>
      )}

      {folder && (
        <>
          <p
            className={
              last && !last.ok
                ? "text-[12px] leading-4 text-danger"
                : "text-[12px] leading-4 text-faint"
            }
          >
            {!last
              ? t("settings.backup.never")
              : last.ok
                ? t("settings.backup.last", { when, size: formatBytes(last.size) })
                : t("settings.backup.failed", { error: last.detail })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={busy} onClick={() => void backUp()}>
              {busy ? t("settings.backup.running") : t("settings.backup.now")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void ipc.revealBackupFolder()}>
              {t("settings.backup.show")}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => void ipc.setBackupFolder(null).then(setInfo)}
            >
              {t("settings.backup.off")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
