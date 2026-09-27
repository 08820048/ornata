import { ImageOff } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Modal } from "@/components/ui/Modal";
import { ipc } from "@/lib/ipc";
import type { UnusedAsset } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";

/**
 * Maintenance dialog listing vault assets no note references. Trash-only
 * (recoverable), two-step confirm, fresh pastes excluded by a backend grace
 * window.
 */
export function UnusedAssetsDialog() {
  const open = useUi((s) => s.unusedAssetsOpen);
  const setOpen = useUi((s) => s.setUnusedAssetsOpen);
  const [assets, setAssets] = useState<UnusedAsset[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const t = useT();

  useEffect(() => {
    if (!open) return;
    setConfirming(false);
    let cancelled = false;
    ipc
      .listUnusedAssets()
      .then((list) => {
        if (!cancelled) setAssets(list);
      })
      .catch(() => {
        if (!cancelled) setAssets([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const totalBytes = (assets ?? []).reduce((sum, asset) => sum + asset.size, 0);
  const totalKb = (totalBytes / 1024).toFixed(1);

  const clean = async () => {
    if (cleaning || !assets?.length) return;
    setCleaning(true);
    try {
      const trashed = await ipc.trashAssets(assets.map((asset) => asset.name));
      toast(t("assets.trashed", { count: trashed }));
      setAssets([]);
      setConfirming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setCleaning(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel={t("assets.title")}
      align="top"
      className="mt-[14vh] w-[520px]"
    >
      <div className="flex items-baseline justify-between border-b border-line-soft px-4 py-3">
        <span className="text-[13px] font-semibold text-ink">{t("assets.title")}</span>
        {assets && assets.length > 0 && (
          <span className="text-[11px] tabular-nums text-faint">
            {assets.length} · {totalKb} KB
          </span>
        )}
      </div>
      <div className="max-h-[46vh] overflow-y-auto p-2">
        {assets === null ? null : assets.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] leading-relaxed text-faint">
            {t("assets.empty")}
          </p>
        ) : (
          assets.map((asset) => (
            <div
              key={asset.name}
              className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[12.5px]"
            >
              <ImageOff size={13} strokeWidth={1.75} className="shrink-0 text-faint" />
              <span className="min-w-0 flex-1 truncate font-mono text-ink">{asset.name}</span>
              <span className="shrink-0 text-[11px] tabular-nums text-faint">
                {(asset.size / 1024).toFixed(1)} KB
              </span>
            </div>
          ))
        )}
      </div>
      {assets && assets.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t border-line-soft px-4 py-3">
          <span className="text-[11px] leading-relaxed text-faint">{t("assets.hint")}</span>
          <button
            type="button"
            disabled={cleaning}
            onClick={() => (confirming ? void clean() : setConfirming(true))}
            onBlur={() => setConfirming(false)}
            className={cx(
              "shrink-0 rounded-md border px-3 py-1.5 text-[12px] font-medium transition-colors duration-100",
              confirming
                ? "border-danger bg-danger text-white"
                : "border-line text-muted hover:bg-hover",
            )}
          >
            {confirming ? t("assets.confirm") : t("assets.cleanup")}
          </button>
        </div>
      )}
    </Modal>
  );
}
