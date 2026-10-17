import {
  ClipboardType, Code2, Columns2, Copy, Download, FileCode, Focus, Link2, MoreHorizontal, Pilcrow, Printer, Trash2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { NoteBreadcrumb } from "@/components/editor/NoteBreadcrumb";
import { ActionSwapIcon } from "@/components/motion/action-swap";
import {
  MorphPopover,
  MorphPopoverContent,
  MorphPopoverTrigger,
} from "@/components/motion/popover-morph";
import { Tooltip } from "@/components/ui/Tooltip";
import { isNoteTab, noteDisplayPath } from "@/lib/noteRef";
import type { TabRef } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useTabs } from "@/stores/tabs";
import { useUi } from "@/stores/ui";
import { useVault } from "@/stores/vault";
import { NavButtons } from "./NavButtons";

/** One grammar for the header's icon buttons: ghost, 28px, hover fill only. */
const HEADER_BUTTON =
  "grid h-7 w-7 place-items-center rounded-md transition-[color,background-color,transform] duration-100 active:scale-[0.96]";

/**
 * A note's header: history arrows, breadcrumb, and its actions. Shown once
 * above the workspace, or inside every pane when the workspace is split
 * (unfocused panes fade back).
 */
export function PaneHeader({
  tab,
  focused,
  closable = false,
}: {
  tab: TabRef | null;
  focused: boolean;
  closable?: boolean;
}) {
  const t = useT();
  const root = useVault((s) => s.root);
  const markdownSource = useUi((s) => s.markdownSource);
  const toggleMarkdownSource = useUi((s) => s.toggleMarkdownSource);
  const [noteMenuOpen, setNoteMenuOpen] = useState(false);
  const note = tab && isNoteTab(tab) ? tab : null;
  const path = note && root ? noteDisplayPath(root, note) : null;

  return (
    <div
      className={cx(
        "flex min-w-0 flex-1 items-center transition-opacity duration-150",
        !focused && "opacity-50 hover:opacity-100",
      )}
    >
          <NavButtons />
          {note && <NoteBreadcrumb note={note} />}

          <div className="ml-auto flex items-center gap-0.5">
            {note && (
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
                  aria-label={
                    markdownSource
                      ? t("editor.showRich")
                      : t("editor.showSource")
                  }
                  onClick={toggleMarkdownSource}
                  className={cx(
                    HEADER_BUTTON,
                    markdownSource
                      ? "bg-active text-ink"
                      : "text-muted hover:bg-hover hover:text-ink",
                  )}
                >
                  <ActionSwapIcon
                    value={markdownSource ? "rich" : "markdown"}
                    animation="roll"
                    className="h-[15px] w-[15px]"
                  >
                    {markdownSource ? (
                      <Pilcrow size={15} strokeWidth={1.75} />
                    ) : (
                      <Code2 size={15} strokeWidth={1.75} />
                    )}
                  </ActionSwapIcon>
                </button>
              </Tooltip>
            )}
            {note && (
              <MorphPopover open={noteMenuOpen} onOpenChange={setNoteMenuOpen}>
                <MorphPopoverTrigger>
                  <button
                    type="button"
                    aria-label={t("editor.noteActions")}
                    className={cx(
                      HEADER_BUTTON,
                      "text-muted hover:bg-hover hover:text-ink",
                    )}
                  >
                    <MoreHorizontal size={16} strokeWidth={1.75} />
                  </button>
                </MorphPopoverTrigger>
                <MorphPopoverContent
                  align="end"
                  sideOffset={6}
                  radius={10}
                  className="w-56 bg-bg p-1"
                >
                  <NoteMenuButton
                    icon={Focus}
                    label={t("palette.toggleFocus")}
                    keys="⌘⇧F"
                    onClick={() => {
                      setNoteMenuOpen(false);
                      useUi.getState().toggleFocusMode();
                      if (useUi.getState().focusMode) toast(t("focus.entered"));
                    }}
                  />
                  <div className="mx-1 my-1 border-t border-line-soft" />
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
                  <div className="mx-1 my-1 border-t border-line-soft" />
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
                  {path && (
                    <NoteMenuButton
                      icon={Link2}
                      label={t("editor.copyPath")}
                      onClick={() => {
                        setNoteMenuOpen(false);
                        void navigator.clipboard.writeText(path);
                        toast(t("common.copied"));
                      }}
                    />
                  )}
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
            {note && (
              <Tooltip label={`${t("split.splitPane")} ⌘⇧\\`} side="bottom">
                <button
                  type="button"
                  aria-label={t("split.splitPane")}
                  onClick={() => useUi.getState().openPaletteAside()}
                  className={cx(HEADER_BUTTON, "text-muted hover:bg-hover hover:text-ink")}
                >
                  <Columns2 size={15} strokeWidth={1.75} />
                </button>
              </Tooltip>
            )}
            {note && closable && (
              <Tooltip label={t("split.closePane")} side="bottom">
                <button
                  type="button"
                  aria-label={t("split.closePane")}
                  onClick={() => tab && useTabs.getState().closePane(tab)}
                  className={cx(HEADER_BUTTON, "text-muted hover:bg-hover hover:text-ink")}
                >
                  <X size={15} strokeWidth={1.75} />
                </button>
              </Tooltip>
            )}
          </div>
    </div>
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
  keys,
  danger = false,
  onClick,
}: {
  icon: typeof Download;
  label: string;
  keys?: string;
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
      {keys && (
        <kbd className="ml-auto font-mono text-[10px] font-normal text-faint">{keys}</kbd>
      )}
    </button>
  );
}
