import {
  IconArrowBarDown,
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useUpdater } from "@/stores/updater";

/** Status-bar update prompt, left of the cursor / history / word info: shown
 *  only while an update is available, downloading, ready or installing. */
export function UpdateHint() {
  const t = useT();
  const status = useUpdater((s) => s.status);
  const version = useUpdater((s) => s.version);
  const progress = useUpdater((s) => s.progress);
  const download = useUpdater((s) => s.download);
  const restartAndInstall = useUpdater((s) => s.restartAndInstall);

  if (
    status !== "available" &&
    status !== "downloading" &&
    status !== "ready" &&
    status !== "installing"
  ) {
    return null;
  }
  const busy = status === "downloading" || status === "installing";
  const ready = status === "ready";

  const label =
    status === "downloading"
      ? progress == null
        ? t("sidebar.update.downloading")
        : t("sidebar.update.downloadingPercent", { progress: Math.round(progress) })
      : status === "installing"
        ? t("sidebar.update.restarting")
        : ready
          ? t("sidebar.update.restart")
          : t("sidebar.update.toVersion", { version: version ?? "" });

  return (
    <Tooltip label={label} side="top">
      <button
        type="button"
        disabled={busy}
        aria-label={label}
        onClick={ready ? restartAndInstall : download}
        className={cx(
          "mr-2 flex h-5 shrink-0 items-center gap-1.5 rounded px-1.5 text-[11px] font-medium tabular-nums text-ink transition-[color,background-color,transform] duration-100 hover:bg-hover active:scale-[0.97]",
          busy && "cursor-default text-muted hover:bg-transparent active:scale-100",
        )}
      >
        {busy ? (
          <IconLoader2 size={12} stroke={2} className="shrink-0 animate-spin" />
        ) : ready ? (
          <IconRefresh size={12} stroke={2} className="shrink-0" />
        ) : (
          <IconArrowBarDown size={12} stroke={2} className="shrink-0" />
        )}
        <span className="truncate">
          {status === "available" ? `v${version ?? ""}` : label}
        </span>
      </button>
    </Tooltip>
  );
}
