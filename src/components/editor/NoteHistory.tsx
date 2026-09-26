import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { diffLines, type DiffRow } from "@/lib/diff";
import { ipc } from "@/lib/ipc";
import type { SnapshotMeta } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";

/**
 * Snapshot browser for one note: list on the left, line diff (snapshot vs
 * current) on the right, restore behind a two-step confirm. Restoring
 * snapshots the current state first (via `flushCurrent` + a forced backend
 * snapshot), so a restore is itself recoverable.
 */
export function NoteHistory({
  rel,
  onClose,
  flushCurrent,
  onRestored,
}: {
  rel: string;
  onClose: () => void;
  flushCurrent: () => Promise<void>;
  onRestored: () => void;
}) {
  const t = useT();
  const [snapshots, setSnapshots] = useState<SnapshotMeta[] | null>(null);
  const [selected, setSelected] = useState<SnapshotMeta | null>(null);
  const [rows, setRows] = useState<DiffRow[] | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ipc
      .noteHistory(rel)
      .then((list) => {
        if (!cancelled) setSnapshots(list);
      })
      .catch(() => {
        if (!cancelled) setSnapshots([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rel]);

  useEffect(() => {
    if (!selected) {
      setRows(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      ipc.readHistorySnapshot(rel, selected.timestamp),
      ipc.readNote(rel),
    ])
      .then(([snapshot, current]) => {
        if (!cancelled) setRows(diffLines(snapshot, current));
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [rel, selected]);

  const restore = async () => {
    if (!selected || restoring) return;
    setRestoring(true);
    try {
      await flushCurrent();
      await ipc.snapshotNote(rel);
      const snapshot = await ipc.readHistorySnapshot(rel, selected.timestamp);
      await ipc.writeNote(rel, snapshot);
      onRestored();
      onClose();
    } catch {
      setRestoring(false);
      setConfirming(false);
    }
  };

  const formatTime = (timestamp: number) =>
    new Date(timestamp).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <Modal open onClose={onClose} className="w-[860px]" ariaLabel={t("history.title")}>
      <div className="flex h-[68vh] flex-col p-5">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-[15px] font-semibold text-ink">{t("history.title")}</h2>
          {snapshots && snapshots.length > 0 && (
            <span className="text-[11px] text-faint">
              {t("history.count", { count: snapshots.length })}
            </span>
          )}
        </div>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="w-52 shrink-0 overflow-y-auto pr-1">
            {snapshots === null ? null : snapshots.length === 0 ? (
              <p className="px-2 py-6 text-[12.5px] leading-relaxed text-faint">
                {t("history.empty")}
              </p>
            ) : (
              <div className="flex flex-col gap-0.5">
                {snapshots.map((snapshot) => {
                  const active = selected?.timestamp === snapshot.timestamp;
                  return (
                    <button
                      key={snapshot.timestamp}
                      type="button"
                      onClick={() => {
                        setSelected(snapshot);
                        setConfirming(false);
                      }}
                      className={cx(
                        "block w-full rounded px-2.5 py-1.5 text-left transition-colors duration-100",
                        active ? "bg-invert text-invert-ink" : "text-muted hover:bg-hover",
                      )}
                    >
                      <div className="text-[12.5px]">{formatTime(snapshot.timestamp)}</div>
                      <div
                        className={cx(
                          "text-[10.5px] tabular-nums",
                          active ? "text-invert-ink/70" : "text-faint",
                        )}
                      >
                        {(snapshot.size / 1024).toFixed(1)} KB
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {selected && rows ? (
              <>
                <div className="flex items-center justify-between pb-2">
                  <span className="text-[10.5px] text-faint">
                    − {t("history.legendSnapshot")} · + {t("history.legendCurrent")}
                  </span>
                  <button
                    type="button"
                    disabled={restoring}
                    onClick={() => (confirming ? restore() : setConfirming(true))}
                    onBlur={() => setConfirming(false)}
                    className={cx(
                      "rounded border px-2.5 py-1 text-[11px] font-medium transition-colors duration-100",
                      confirming
                        ? "border-danger bg-danger text-white"
                        : "border-line text-muted hover:bg-hover",
                    )}
                  >
                    {confirming ? t("history.confirmRestore") : t("history.restore")}
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rounded border border-line-soft bg-sunken p-2 font-mono text-[11.5px] leading-[1.6]">
                  {rows.map((row, index) => (
                    <div
                      key={index}
                      className={cx(
                        "whitespace-pre-wrap break-words rounded px-1",
                        row.kind === "del" && "diff-del",
                        row.kind === "add" && "diff-add",
                        row.kind === "same" && "text-faint",
                      )}
                    >
                      {row.kind === "del" ? "− " : row.kind === "add" ? "+ " : ""}
                      {row.text === "" ? " " : row.text}
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-1 items-center justify-center text-[12.5px] text-faint">
                {t("history.pickSnapshot")}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
