import {
  IconLoader2,
  IconRefresh,
} from "@tabler/icons-react";
import { AnimatePresence, motion } from "motion/react";
import { Button } from "@/components/ui/Button";
import { EASE_OUT } from "@/lib/ease";
import { useUpdater } from "@/stores/updater";
import { useT } from "@/stores/locale";
import packageInfo from "../../../package.json";

const SWAP = {
  duration: 0.14,
  ease: EASE_OUT,
} as const;

export function UpdateControl() {
  const status = useUpdater((state) => state.status);
  const version = useUpdater((state) => state.version);
  const progress = useUpdater((state) => state.progress);
  const check = useUpdater((state) => state.check);
  const download = useUpdater((state) => state.download);
  const restartAndInstall = useUpdater((state) => state.restartAndInstall);
  const t = useT();

  const description =
    status === "available"
      ? t("updates.available", { version: version ?? "" })
      : status === "downloading"
        ? t("updates.downloading", { version: version ?? "" })
        : status === "ready"
          ? t("updates.ready", { version: version ?? "" })
          : status === "installing"
            ? t("updates.installing")
            : status === "checking"
              ? t("updates.checking")
              : status === "error"
                ? t("updates.error")
                : t("updates.currentVersion", {
                    version: packageInfo.version,
                  });

  return (
    <div className="mt-2 flex min-h-10 items-center justify-between gap-3">
      <p
        aria-live="polite"
        className="min-w-0 flex-1 truncate text-[12.5px] text-muted"
      >
        {description}
      </p>

      <div className="flex h-10 min-w-36 shrink-0 items-center justify-end">
        <AnimatePresence initial={false} mode="wait">
          {status === "available" ? (
            <motion.button
              key="available"
              type="button"
              onClick={download}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={SWAP}
              className="relative h-8 min-w-20 rounded-lg border border-success/25 bg-success/8 px-3 font-mono text-[12px] font-semibold tabular-nums text-success transition-[background-color,scale] duration-100 ease-out after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] hover:bg-success/12 active:scale-[0.96]"
              aria-label={t("updates.downloadAria", { version: version ?? "" })}
            >
              v{version}
            </motion.button>
          ) : status === "downloading" ? (
            <motion.div
              key="downloading"
              role="progressbar"
              aria-label={t("updates.downloadingAria", {
                version: version ?? "",
              })}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={progress ?? undefined}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={SWAP}
              className="relative h-8 w-36 overflow-hidden rounded-lg border border-success/25 bg-success/8"
            >
              <motion.span
                className="absolute inset-y-0 left-0 bg-success/22"
                initial={false}
                animate={{ width: `${progress ?? 8}%` }}
                transition={{ duration: 0.16, ease: EASE_OUT }}
              />
              <span className="relative grid h-full place-items-center font-mono text-[11.5px] font-semibold tabular-nums text-success">
                {progress == null
                  ? t("sidebar.update.downloading")
                  : `${Math.round(progress)}%`}
              </span>
            </motion.div>
          ) : status === "ready" ? (
            <motion.button
              key="ready"
              type="button"
              onClick={restartAndInstall}
              initial={{ opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -2 }}
              transition={SWAP}
              className="relative h-8 rounded-lg border border-success/25 bg-success/8 px-3 text-[12px] font-semibold text-success transition-[background-color,scale] duration-100 ease-out after:absolute after:-inset-y-1 after:inset-x-0 after:content-[''] hover:bg-success/12 active:scale-[0.96]"
            >
              {t("updates.restart")}
            </motion.button>
          ) : status === "installing" ? (
            <motion.div
              key="installing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SWAP}
              className="flex h-8 items-center gap-1.5 px-2 text-[12px] font-medium text-success"
            >
              <IconLoader2 size={13} stroke={1.8} className="animate-spin" />
              {t("updates.restarting")}
            </motion.div>
          ) : (
            <Button
              key="check"
              variant="outline"
              size="sm"
              onClick={() => check({ silent: false })}
              disabled={status === "checking"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SWAP}
              className="relative after:absolute after:-inset-y-1.5 after:inset-x-0 after:content-['']"
            >
              <IconRefresh
                size={13}
                stroke={1.75}
                className={status === "checking" ? "animate-spin" : undefined}
              />
              {t("common.check")}
            </Button>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
