import {
  CalendarDays, ChevronLeft, ChevronRight, ClipboardType, Code2, Copy, Download, FileCode, FilePlus, MoreVertical, Pilcrow, Printer, Search, Trash2 } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";
import { NoteBreadcrumb } from "@/components/editor/NoteBreadcrumb";
import { NotesWorkspace } from "@/components/editor/NotesWorkspace";
import { TabBar } from "@/components/editor/TabBar";
import { SPRING_LAYOUT, SPRING_PANEL } from "@/lib/ease";
import { noteDisplayPath } from "@/lib/noteRef";
import { cx } from "@/lib/utils";
import {
  ActionSwapIcon,
} from "@/components/motion/action-swap";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import { Sidebar } from "./Sidebar";
import { NavButtons } from "./NavButtons";
import { ShortcutBar } from "./ShortcutBar";
import { CopyButton } from "@/components/ui/CopyButton";
import { Tooltip } from "@/components/ui/Tooltip";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { useT } from "@/stores/locale";
import { AgentPanel } from "@/components/agent/AgentPanel";

const SIDEBAR_WIDTH = 240;

/** Absolute on-disk path for the current view — handy to hand to an agent. */
function viewPath(
  root: string,
  view: ReturnType<typeof useVault.getState>["view"],
): string | null {
  if (!root || view?.type !== "note") return null;
  return noteDisplayPath(root, view.note);
}

export function AppShell() {
  const view = useVault((s) => s.view);
  const root = useVault((s) => s.root);
  const sidebarHidden = useUi((s) => s.sidebarHidden);
  const markdownSource = useUi((s) => s.markdownSource);
  const focusMode = useUi((s) => s.focusMode);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const toggleMarkdownSource = useUi((s) => s.toggleMarkdownSource);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const t = useT();

  const path = viewPath(root, view);

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
        </motion.div>

        {/* Row 2 — current view title + right-side actions. */}
        <div
          className={cx(
            "flex h-10 bg-transparent shrink-0 items-center px-3 transition-opacity duration-150",
            focusMode && "opacity-0 hover:opacity-100",
          )}
        >
          <NavButtons />
          {view?.type === "note" && <NoteBreadcrumb note={view.note} />}

          <LayoutGroup>
            <div className="ml-auto flex items-center gap-2">
              {view?.type === "note" && (
                <Tooltip
                  label={
                    markdownSource
                      ? t("editor.showRich")
                      : t("editor.showSource")
                  }
                  side="bottom"
                >
                  <button
                    type="button"
                    aria-pressed={markdownSource}
                    onClick={toggleMarkdownSource}
                    className={cx(
                      "grid h-7 w-7 place-items-center rounded-md border transition-[color,background-color,border-color,transform] duration-100 active:scale-[0.96]",
                      markdownSource
                        ? "border-invert bg-invert text-invert-ink"
                        : "border-line bg-hover text-muted hover:bg-active hover:text-ink",
                    )}
                  >
                    <ActionSwapIcon
                      value={markdownSource ? "rich" : "markdown"}
                      animation="roll"
                      className="h-[15px] w-[15px]"
                    >
                      {markdownSource ? (
                        <Pilcrow size={15} strokeWidth={1.9} />
                      ) : (
                        <Code2 size={15} strokeWidth={1.9} />
                      )}
                    </ActionSwapIcon>
                  </button>
                </Tooltip>
              )}
              {path && (
                <motion.div layout transition={SPRING_LAYOUT}>
                  <CopyButton
                    value={path}
                    text={t("editor.copyPath")}
                    copiedText={t("common.copied")}
                  />
                </motion.div>
              )}
              {view?.type === "note" && (
                <MorphPopover
                  open={noteMenuOpen}
                  onOpenChange={setNoteMenuOpen}
                >
                  <MorphPopoverTrigger>
                    <button
                      type="button"
                      aria-label={t("editor.noteActions")}
                      className="grid h-7 w-7 place-items-center rounded-md text-muted transition-colors duration-100 hover:text-ink"
                    >
                      <MoreVertical size={15} strokeWidth={2} />
                    </button>
                  </MorphPopoverTrigger>
                  <MorphPopoverContent
                    align="end"
                    sideOffset={6}
                    radius={10}
                    className="w-48 bg-bg p-1"
                  >
                    <NoteMenuButton
                      icon={Download}
                      label={t("editor.exportMarkdown")}
                      onClick={() => {
                        setNoteMenuOpen(false);
                        dispatchNoteAction("export");
                      }}
                    />
                    <NoteMenuButton
                      icon={Printer}
                      label={t("editor.exportPdf")}
                      onClick={() => {
                        setNoteMenuOpen(false);
                        dispatchNoteAction("print-pdf");
                      }}
                    />
                    <NoteMenuButton
                      icon={FileCode}
                      label={t("editor.exportHtml")}
                      onClick={() => {
                        setNoteMenuOpen(false);
                        dispatchNoteAction("export-html");
                      }}
                    />
                    <NoteMenuButton
                      icon={ClipboardType}
                      label={t("editor.copyRich")}
                      onClick={() => {
                        setNoteMenuOpen(false);
                        dispatchNoteAction("copy-rich");
                      }}
                    />
                    <NoteMenuButton
                      icon={Copy}
                      label={t("editor.copyMarkdown")}
                      onClick={() => {
                        setNoteMenuOpen(false);
                        dispatchNoteAction("copy");
                      }}
                    />
                    <div className="mx-1 my-1 border-t border-line-soft" />
                    <NoteMenuButton
                      icon={Trash2}
                      label={t("editor.deleteNote")}
                      danger
                      onClick={() => {
                        setNoteMenuOpen(false);
                        dispatchNoteAction("delete");
                      }}
                    />
                  </MorphPopoverContent>
                </MorphPopover>
              )}
            </div>
          </LayoutGroup>
        </div>

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

type NoteAction = "export" | "copy" | "delete" | "print-pdf" | "export-html" | "copy-rich";

function dispatchNoteAction(action: NoteAction) {
  window.dispatchEvent(
    new CustomEvent("ornata:note-action", { detail: { action } }),
  );
}

function NoteMenuButton({
  icon: Icon,
  label,
  danger = false,
  onClick,
}: {
  icon: typeof Download;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors duration-100",
        danger
          ? "text-danger hover:bg-danger/8"
          : "text-ink hover:bg-hover",
      )}
    >
      <Icon size={14} strokeWidth={1.75} />
      {label}
    </button>
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
