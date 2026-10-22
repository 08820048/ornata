import {
  ArrowDownAZ,
  ArrowDownToLine,
  CalendarDays,
  Clock,
  FilePlus,
  FolderPlus,
  Hash,
  ListChecks,
  Loader2,
  Pin,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { ActionSwapButton } from "@/components/motion/action-swap";
import { flattenNotes } from "@/lib/tree";
import { FileTree } from "@/components/tree/FileTree";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUi } from "@/stores/ui";
import { useUpdater } from "@/stores/updater";
import { vaultNote } from "@/lib/noteRef";
import type { TreeSort } from "@/lib/types";
import { cx, isMac, keyLabel } from "@/lib/utils";
import { activeDir, useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";

export function Sidebar() {
  const name = useVault((s) => s.name);
  const tree = useVault((s) => s.tree);
  const pinned = useVault((s) => s.pinned);
  const togglePin = useVault((s) => s.togglePin);
  const createNote = useVault((s) => s.createNote);
  const createFolder = useVault((s) => s.createFolder);
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const setTasksOpen = useUi((s) => s.setTasksOpen);
  const setTagsOpen = useUi((s) => s.setTagsOpen);
  const treeSort = useVault((s) => s.treeSort);
  const setTreeSort = useVault((s) => s.setTreeSort);
  const t = useT();

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-line-soft bg-panel">
      {/* drag region + traffic-light clearance */}
      <div data-tauri-drag-region className={cx("flex items-end px-3 pb-1", isMac() ? "h-12" : "h-3")} />

      <div className="px-2 pb-2">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="flex w-full items-center gap-2 rounded-md border border-line-soft bg-bg px-2.5 py-1.5 text-[12.5px] text-faint transition-colors duration-100 hover:border-line hover:text-muted"
        >
          <Search size={14} strokeWidth={2} className="shrink-0" />
          <span>{t("sidebar.search")}</span>
          <kbd className="ml-auto rounded border border-line bg-panel px-1 font-mono text-[10px] leading-4 text-faint">
            {keyLabel("⌘K")}
          </kbd>
        </button>
        <div className="mt-1.5 flex flex-col gap-px">
          <QuickRow
            icon={<CalendarDays size={14} strokeWidth={1.75} />}
            label={t("daily.new")}
            keys={keyLabel("⌘J")}
            onClick={() => void useVault.getState().openDailyNote()}
          />
          <QuickRow
            icon={<ListChecks size={14} strokeWidth={1.75} />}
            label={t("tasks.title")}
            onClick={() => setTasksOpen(true)}
          />
        </div>
      </div>

      <div className="flex items-center px-4 pb-2">
        <span
          className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-faint"
          title={name}
        >
          {name}
        </span>
      </div>

      {pinned.length > 0 && (
        <div className="px-2 pb-2">
          <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            {t("pinned.title")}
          </div>
          {pinned.map((rel) => {
            const node = flattenNotes(tree).find((n) => n.rel === rel);
            return (
              <div
                key={rel}
                role="button"
                tabIndex={0}
                onClick={() => {
                  const vault = useVault.getState();
                  vault.expandTo(rel);
                  vault.setView({ type: "note", note: vaultNote(rel) });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    const vault = useVault.getState();
                    vault.expandTo(rel);
                    vault.setView({ type: "note", note: vaultNote(rel) });
                  }
                }}
                className="group flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-hover"
              >
                <Pin size={12} strokeWidth={2} className="shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate">
                  {node?.name ?? rel.replace(/\.md$/i, "")}
                </span>
                <button
                  type="button"
                  aria-label={t("pinned.remove")}
                  onClick={(event) => {
                    event.stopPropagation();
                    void togglePin(rel);
                  }}
                  className="shrink-0 rounded p-0.5 text-faint opacity-0 transition-opacity duration-100 hover:text-ink group-hover:opacity-100"
                >
                  <X size={12} strokeWidth={2} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between pl-4 pr-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {t("common.notes")}
        </span>
        <div className="flex items-center gap-0.5">
          <ActionSwapButton
            items={[
              { id: "name", label: t("tree.sortName"), icon: <ArrowDownAZ size={14.5} strokeWidth={1.75} />, ariaLabel: t("tree.sortName") },
              { id: "modified", label: t("tree.sortModified"), icon: <Clock size={14.5} strokeWidth={1.75} />, ariaLabel: t("tree.sortModified") },
            ]}
            value={treeSort}
            onValueChange={(value) => setTreeSort(value as TreeSort)}
            variant="ghost"
            size="icon"
            className="h-7 w-7 rounded-md text-faint hover:text-muted"
          />
          <IconAction label={t("tags.title")} onClick={() => setTagsOpen(true)}>
            <Hash size={14.5} strokeWidth={1.75} />
          </IconAction>
          <IconAction
            label={t("common.newNote")}
            onClick={() => createNote(activeDir(useVault.getState()))}
          >
            <FilePlus size={14.5} strokeWidth={1.75} />
          </IconAction>
          <IconAction
            label={t("common.newFolder")}
            onClick={() => createFolder("", t("common.untitled"))}
          >
            <FolderPlus size={14.5} strokeWidth={1.75} />
          </IconAction>
        </div>
      </div>

      <FileTree />

      <UpdateRow />
    </aside>
  );
}

function QuickRow({
  icon,
  label,
  keys,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  keys?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-[28px] w-full items-center gap-2.5 rounded-md px-2.5 text-[12.5px] text-muted transition-colors duration-100 hover:bg-hover hover:text-ink"
    >
      <span className="shrink-0 text-faint">{icon}</span>
      <span className="truncate">{label}</span>
      {keys && (
        <kbd className="ml-auto font-mono text-[10px] font-normal text-faint">{keys}</kbd>
      )}
    </button>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        onClick={onClick}
        className="grid h-6.5 w-6.5 place-items-center rounded-md text-faint transition-colors duration-100 hover:bg-hover hover:text-ink"
      >
        {children}
      </button>
    </Tooltip>
  );
}

function UpdateRow() {
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

  return (
    <div className="border-t border-line-soft px-2 py-1.5">
      <button
        type="button"
        disabled={busy}
        onClick={ready ? restartAndInstall : download}
        className="flex w-full items-center gap-2 rounded-md bg-hover px-2.5 py-1.5 text-[12.5px] font-medium text-ink transition-colors duration-100 hover:bg-active disabled:cursor-default disabled:hover:bg-hover"
      >
        {busy ? (
          <Loader2
            size={14}
            strokeWidth={2}
            className="shrink-0 animate-spin text-faint"
          />
        ) : ready ? (
          <RefreshCw size={14} strokeWidth={2} className="shrink-0" />
        ) : (
          <ArrowDownToLine size={14} strokeWidth={2} className="shrink-0" />
        )}
        <span className="truncate">
          {status === "downloading"
            ? progress == null
              ? t("sidebar.update.downloading")
              : t("sidebar.update.downloadingPercent", {
                  progress: Math.round(progress),
                })
            : status === "installing"
              ? t("sidebar.update.restarting")
              : ready
                ? t("sidebar.update.restart")
                : t("sidebar.update.toVersion", { version: version ?? "" })}
        </span>
        {!busy && !ready && (
          <span className="ml-auto shrink-0 text-[11px] text-faint">
            {t("common.download")}
          </span>
        )}
      </button>
    </div>
  );
}
