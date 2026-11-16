import {
  IconChevronRight,
  IconColumns2,
  IconDots,
  IconFilePlus,
  IconFolderOpen,
  IconFolderPlus,
  IconFolderSymlink,
  IconPencil,
  IconPin,
  IconPinnedOff,
  IconTrash,
} from "@tabler/icons-react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ContextMenu, type MenuItem, type MenuPosition } from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import { ipc } from "@/lib/ipc";
import { coverNotes, crumbsOf, folderAt, gridLayout } from "@/lib/library";
import { vaultNote } from "@/lib/noteRef";
import { openRelAside } from "@/lib/openAside";
import { sortChildren } from "@/lib/tree";
import type { TreeNode } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useLibrary } from "@/stores/library";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";
import { FolderCard } from "./FolderCard";
import { MoveDialog } from "./MoveDialog";
import { ThumbPage } from "./NotePreview";
import { useNoteHeads } from "./useNoteHeads";
import { useSeen } from "./useSeen";

type Menu = { rel: string; position: MenuPosition; items: MenuItem[] };

/** Side padding of the grid, as in the header above it. */
const PAD = 24;

/**
 * The library tab: the current folder as a grid of cards — a folder shows as
 * a folder holding its latest notes as paper, a note as its first page in
 * miniature. Clicking a folder steps into it; clicking a note opens it.
 */
export function LibraryView({ active }: { active: boolean }) {
  const tree = useVault((s) => s.tree);
  const treeSort = useVault((s) => s.treeSort);
  const vaultName = useVault((s) => s.name);
  const pinned = useVault((s) => s.pinned);
  const dir = useLibrary((s) => s.dir);
  const setDir = useLibrary((s) => s.setDir);
  const t = useT();
  const scroller = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [moving, setMoving] = useState<TreeNode | null>(null);

  // Card sizes come from the pane's width (columns are computed, not auto-fit).
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const children = useMemo(() => folderAt(tree, dir), [tree, dir]);
  // The folder was renamed, moved or deleted: fall back to the top level.
  useEffect(() => {
    if (children === null) setDir("");
  }, [children, setDir]);

  const entries = useMemo(() => sortChildren(children ?? [], treeSort), [children, treeSort]);
  const covers = useMemo(
    () =>
      new Map(
        entries.filter((node) => node.kind === "folder").map((node) => [node.rel, coverNotes(node)]),
      ),
    [entries],
  );
  const previewed = useMemo(
    () =>
      entries.flatMap((node) =>
        node.kind === "note" ? [node] : (covers.get(node.rel) ?? []).slice(0, 1),
      ),
    [entries, covers],
  );
  const headOf = useNoteHeads(previewed, active);
  const mixed = entries.some((node) => node.kind === "folder");
  const layout = gridLayout(Math.max(1, width - PAD * 2), mixed);

  const enter = (rel: string) => {
    setDir(rel);
    scroller.current?.scrollTo({ top: 0 });
  };
  const openNote = (rel: string) =>
    useVault.getState().setView({ type: "note", note: vaultNote(rel) });
  const reveal = (rel: string) =>
    void ipc.revealEntry(rel).catch((error) => {
      toast.error(error instanceof Error ? error.message : String(error));
    });
  const rename = (node: TreeNode, name: string) => {
    setRenaming(null);
    const next = name.trim();
    if (next && next !== node.name) void useVault.getState().renameEntry(node.rel, next);
  };

  const itemsFor = (node: TreeNode): MenuItem[] => {
    const shared: MenuItem[] = [
      { label: t("tree.rename"), icon: IconPencil, onSelect: () => setRenaming(node.rel) },
      { label: t("library.moveTo"), icon: IconFolderSymlink, onSelect: () => setMoving(node) },
      { label: t("tree.revealInFinder"), icon: IconFolderOpen, onSelect: () => reveal(node.rel) },
      {
        label: t("tree.trash"),
        icon: IconTrash,
        danger: true,
        onSelect: () => void useVault.getState().deleteEntry(node.rel),
      },
    ];
    if (node.kind === "folder") {
      return [
        { label: t("library.open"), icon: IconFolderOpen, onSelect: () => enter(node.rel) },
        {
          label: t("library.newNoteHere"),
          icon: IconFilePlus,
          onSelect: () => void useVault.getState().createNote(node.rel),
        },
        ...shared,
      ];
    }
    const isPinned = pinned.includes(node.rel);
    return [
      { label: t("library.open"), icon: IconFolderOpen, onSelect: () => openNote(node.rel) },
      { label: t("split.openAside"), icon: IconColumns2, onSelect: () => openRelAside(node.rel) },
      {
        label: t(isPinned ? "pinned.remove" : "pinned.add"),
        icon: isPinned ? IconPinnedOff : IconPin,
        onSelect: () => void useVault.getState().togglePin(node.rel),
      },
      ...shared,
    ];
  };
  const openMenu = (node: TreeNode, position: MenuPosition) =>
    setMenu({ rel: node.rel, position, items: itemsFor(node) });

  return (
    <div ref={scroller} className="h-full overflow-y-auto">
      <div style={{ paddingInline: PAD }} className="pb-8">
        <div className="flex h-11 items-center gap-1 text-[13px]">
          <Crumb label={vaultName || t("library.title")} current={!dir} onClick={() => enter("")} />
          {crumbsOf(dir).map((crumb, index, all) => (
            <span key={crumb.rel} className="flex min-w-0 items-center gap-1">
              <IconChevronRight size={12} stroke={2} className="shrink-0 text-faint" />
              <Crumb
                label={crumb.name}
                current={index === all.length - 1}
                onClick={() => enter(crumb.rel)}
              />
            </span>
          ))}
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <HeaderAction
              label={t("common.newNote")}
              onClick={() => void useVault.getState().createNote(dir)}
            >
              <IconFilePlus size={15} stroke={1.75} />
            </HeaderAction>
            <HeaderAction
              label={t("common.newFolder")}
              onClick={() =>
                void useVault
                  .getState()
                  .createFolder(dir, t("common.untitled"))
                  .then((rel) => rel && setRenaming(rel))
              }
            >
              <IconFolderPlus size={15} stroke={1.75} />
            </HeaderAction>
          </div>
        </div>

        {entries.length === 0 ? (
          <p className="pt-24 text-center text-[13px] text-faint">{t("library.empty")}</p>
        ) : (
          width > 0 && (
            <div
              className="library-grid grid pt-[14px]"
              style={{
                gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))`,
                gap: layout.gap,
              }}
            >
              {entries.map((node) => (
                <Cell
                  key={node.rel}
                  node={node}
                  layout={layout}
                  cover={covers.get(node.rel) ?? []}
                  text={headOf(node.kind === "note" ? node.rel : (covers.get(node.rel)?.[0]?.rel ?? ""))}
                  pinned={pinned.includes(node.rel)}
                  menuOpen={menu?.rel === node.rel}
                  renaming={renaming === node.rel}
                  onOpen={() => (node.kind === "folder" ? enter(node.rel) : openNote(node.rel))}
                  onNewNote={() => void useVault.getState().createNote(node.rel)}
                  onMenu={(position) => openMenu(node, position)}
                  onRename={(name) => rename(node, name)}
                />
              ))}
            </div>
          )
        )}
      </div>
      {menu && (
        <ContextMenu position={menu.position} items={menu.items} onClose={() => setMenu(null)} />
      )}
      <MoveDialog node={moving} onClose={() => setMoving(null)} />
    </div>
  );
}

function Cell({
  node,
  layout,
  cover,
  text,
  pinned,
  menuOpen,
  renaming,
  onOpen,
  onNewNote,
  onMenu,
  onRename,
}: {
  node: TreeNode;
  layout: ReturnType<typeof gridLayout>;
  cover: TreeNode[];
  text: string | null;
  pinned: boolean;
  menuOpen: boolean;
  renaming: boolean;
  onOpen: () => void;
  onNewNote: () => void;
  onMenu: (position: MenuPosition) => void;
  onRename: (name: string) => void;
}) {
  const t = useT();
  const [ref, seen] = useSeen();
  const cardProps = {
    ref,
    role: "button",
    tabIndex: 0,
    onClick: () => {
      if (!renaming) onOpen();
    },
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onOpen();
      }
    },
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      // Keep the opening event from reaching ContextMenu's own dismiss listener.
      event.stopPropagation();
      onMenu({ x: event.clientX, y: event.clientY });
    },
  };

  if (node.kind === "folder") {
    return (
      <FolderCard
        node={node}
        cover={cover}
        coverText={text}
        width={layout.colWidth}
        height={layout.rowHeight}
        seen={seen}
        cardProps={cardProps}
        onNewNote={onNewNote}
        onMenu={onMenu}
        nameSlot={
          renaming ? (
            <RenameField
              initial={node.name}
              onDone={onRename}
              className="text-[15px] font-semibold leading-[22px]"
            />
          ) : undefined
        }
      />
    );
  }

  return (
    // Beside folders a note sits at the bottom of the taller row, so pages line up.
    <div className="flex min-w-0 flex-col justify-end" style={{ height: layout.rowHeight }}>
      <div
        {...cardProps}
        title={node.rel}
        data-menu={menuOpen}
        style={{ height: layout.noteHeight }}
        className="library-note relative w-full cursor-pointer outline-none"
      >
        <div className="library-note-shadow" />
        <div className="library-note-face">
          <ThumbPage title={node.name} text={text} pad={18} ready={seen}>
            {renaming ? (
              <RenameField
                initial={node.name}
                onDone={onRename}
                className="library-title mb-2 text-[14px] font-bold leading-[20px]"
              />
            ) : undefined}
          </ThumbPage>
        </div>
        <div className="library-note-ring" />
        {pinned && (
          <IconPin
            size={13}
            stroke={2}
            aria-label={t("pinned.title")}
            className="library-note-pin absolute right-[15px] top-[15px] text-faint"
          />
        )}
        <div className="library-note-more absolute right-2 top-2">
          <Tooltip label={t("library.more")}>
            <button
              type="button"
              aria-label={t("library.more")}
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                onMenu({ x: rect.left, y: rect.bottom + 4 });
              }}
              className="library-pill grid size-7 place-items-center rounded-full text-muted transition-colors duration-100 hover:text-ink"
            >
              <IconDots size={15} stroke={1.75} />
            </button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}

/** The name, editable in place: Enter or leaving the field keeps it, Escape drops it. */
function RenameField({
  initial,
  onDone,
  className,
}: {
  initial: string;
  onDone: (name: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(initial);
  const done = useRef(false);
  const finish = (name: string) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onFocus={(event) => event.currentTarget.select()}
      onClick={(event) => event.stopPropagation()}
      onBlur={() => finish(value)}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Enter") finish(value);
        if (event.key === "Escape") finish(initial);
      }}
      className={cx(
        "w-full min-w-0 shrink-0 rounded-[4px] bg-sunken px-1 text-ink outline-none",
        className,
      )}
    />
  );
}

function Crumb({
  label,
  current,
  onClick,
}: {
  label: string;
  current: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={current ? "page" : undefined}
      className={cx(
        "min-w-0 truncate rounded px-1.5 py-0.5 transition-colors duration-100",
        current ? "font-semibold text-ink" : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      {label}
    </button>
  );
}

function HeaderAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        className="grid h-7 w-7 place-items-center rounded-md text-muted transition-[color,background-color,transform] duration-100 hover:bg-hover hover:text-ink active:scale-[0.96]"
      >
        {children}
      </button>
    </Tooltip>
  );
}
