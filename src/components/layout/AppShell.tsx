import { CalendarDays, ChevronLeft, ChevronRight, FilePlus, Search } from "lucide-react";
import { motion } from "motion/react";
import { NotesWorkspace } from "@/components/editor/NotesWorkspace";
import { TabBar } from "@/components/editor/TabBar";
import { SPRING_PANEL } from "@/lib/ease";
import { tabOfView } from "@/lib/noteRef";
import { cx } from "@/lib/utils";
import { McpIndicator } from "./McpIndicator";
import { PaneHeader } from "./PaneHeader";
import { Sidebar } from "./Sidebar";
import { ShortcutBar } from "./ShortcutBar";
import { Tooltip } from "@/components/ui/Tooltip";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";
import { AgentPanel } from "@/components/agent/AgentPanel";

const SIDEBAR_WIDTH = 240;

export function AppShell() {
  const view = useVault((s) => s.view);
  const split = useTabs((s) => s.split);
  const sidebarHidden = useUi((s) => s.sidebarHidden);
  const focusMode = useUi((s) => s.focusMode);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const t = useT();


  return (
    <div className="relative flex h-full bg-bg">
      {/* Collapse by animating width (spring) with the panel clipped at a
          fixed inner width — slides cleanly, no content reflow-jitter. */}
      <motion.div
        animate={{ width: sidebarHidden ? 0 : SIDEBAR_WIDTH }}
        initial={false}
        transition={SPRING_PANEL}
        className="h-full shrink-0 overflow-hidden"
      >
        <div style={{ width: SIDEBAR_WIDTH }} className="h-full">
          <Sidebar />
        </div>
      </motion.div>

      {!focusMode && <SidebarEdgeToggle
        hidden={sidebarHidden}
        label={`${t("editor.toggleSidebar")} ⌘\\`}
        onClick={toggleSidebar}
      />}

      <main className="relative flex min-w-0 flex-1 flex-col">
        {/* Row 1 — titlebar: sidebar toggle + open-note tabs. The strip shares
            the sidebar's panel tone; the active tab takes the content bg so it
            reads as merged with the pane below, code-editor style. */}
        <motion.div
          data-tauri-drag-region
          className={cx(
            "flex h-11 shrink-0 items-stretch gap-1.5 bg-panel pr-3 transition-opacity duration-150",
            focusMode && "opacity-0 hover:opacity-100",
          )}
          animate={{ paddingLeft: sidebarHidden ? 84 : 10 }}
          initial={false}
          transition={SPRING_PANEL}
        >
          <TabBar />
          <McpIndicator />
        </motion.div>

        {/* Row 2 — the focused note's header. With a split open, every pane
            carries its own header instead (see NotesWorkspace). */}
        {!split && (
          <div
            className={cx(
              "flex h-10 bg-transparent shrink-0 items-center px-3 transition-opacity duration-150",
              focusMode && "opacity-0 hover:opacity-100",
            )}
          >
            <PaneHeader tab={view ? tabOfView(view) : null} focused />
          </div>
        )}

        <div className="relative min-h-0 flex-1">
          {/* Workspace stays mounted (hidden) across view switches — open
              tabs keep their live editors, so returning to notes is instant. */}
          <NotesWorkspace visible={view !== null} />
          {!view && <EmptyState />}
          <AgentPanel />
        </div>
        <ShortcutBar />
      </main>
    </div>
  );
}

/** Round chevron straddling the sidebar's edge; rides the sidebar's width
 *  spring so it stays glued to the divider while collapsing. */
function SidebarEdgeToggle({
  hidden,
  label,
  onClick,
}: {
  hidden: boolean;
  label: string;
  onClick: () => void;
}) {
  const Icon = hidden ? ChevronRight : ChevronLeft;
  return (
    <motion.div
      className="absolute top-1/2 z-20 -translate-y-1/2"
      animate={{ left: hidden ? 6 : SIDEBAR_WIDTH - 11 }}
      initial={false}
      transition={SPRING_PANEL}
    >
      <Tooltip label={label} side="right">
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          className="grid size-[22px] place-items-center rounded-full border border-line bg-bg text-faint opacity-70 shadow-sm transition-[opacity,color,transform] duration-100 hover:text-ink hover:opacity-100 active:scale-[0.94]"
        >
          <Icon size={13} strokeWidth={2} />
        </button>
      </Tooltip>
    </motion.div>
  );
}

function AppMark() {
  return (
    <img
      src="/ornata-icon.png"
      width="64"
      height="64"
      alt=""
      aria-hidden="true"
      className="h-16 w-16 rounded-2xl"
    />
  );
}

function EmptyAction({
  icon,
  label,
  keys,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  keys: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-line bg-panel px-3 py-2 text-[13px] font-medium text-muted transition-colors duration-100 hover:bg-hover hover:text-ink"
    >
      {icon}
      {label}
      <kbd className="ml-1 rounded border border-line bg-bg px-1.5 py-0.5 font-mono text-[10.5px] text-faint">
        {keys}
      </kbd>
    </button>
  );
}

function EmptyState() {
  const setPaletteOpen = useUi((s) => s.setPaletteOpen);
  const createNote = useVault((s) => s.createNote);
  const t = useT();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 pb-24">
      <AppMark />
      <div className="text-center">
        <p className="text-[16px] font-semibold tracking-[-0.01em] text-ink">
          {t("editor.emptyTitle")}
        </p>
        <p className="mt-1 text-[13px] text-faint">
          {t("editor.emptyDetail")}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <EmptyAction
          icon={<Search size={14} strokeWidth={2} />}
          label={t("common.search")}
          keys="⌘K"
          onClick={() => setPaletteOpen(true)}
        />
        <EmptyAction
          icon={<FilePlus size={14} strokeWidth={2} />}
          label={t("common.newNote")}
          keys="⌘N"
          onClick={() => createNote("")}
        />
        <EmptyAction
          icon={<CalendarDays size={14} strokeWidth={2} />}
          label={t("daily.new")}
          keys="⌘J"
          onClick={() => void useVault.getState().openDailyNote()}
        />
      </div>
    </div>
  );
}
