import { useEffect, useRef, useState } from "react";
import {
  IconCircleHalf2,
  IconFolder,
  IconLayoutKanban,
  IconPencil,
  IconPlus,
  IconX,
} from "@tabler/icons-react";
import { ContextMenu, type MenuItem, type MenuPosition } from "@/components/ui/ContextMenu";
import { Tooltip } from "@/components/ui/Tooltip";
import type { TreeNode } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useProjects } from "@/stores/projects";
import { useVault } from "@/stores/vault";

function folders(nodes: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const node of nodes) {
    if (node.kind !== "folder") continue;
    out.push(node);
    folders(node.children ?? [], out);
  }
  return out;
}

/** Inline name field for renaming a project's folder. */
function RenameField({
  name,
  onSubmit,
  onCancel,
}: {
  name: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const value = inputRef.current?.value.trim();
    if (save && value && value !== name) onSubmit(value);
    else onCancel();
  };

  return (
    <div className="flex h-[30px] items-center gap-2 px-2">
      <IconLayoutKanban size={14} stroke={1.75} className="shrink-0 text-faint" />
      <input
        ref={inputRef}
        defaultValue={name}
        className="w-full min-w-0 rounded-sm bg-bg px-1 text-[13px] text-ink outline-none ring-1 ring-line"
        onBlur={() => finish(true)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") finish(true);
          if (event.key === "Escape") finish(false);
        }}
      />
    </div>
  );
}

/** The sidebar in project mode: marked folders with their progress. */
export function ProjectsSidebar() {
  const t = useT();
  const projects = useProjects((s) => s.projects);
  const selected = useProjects((s) => s.selected);
  const view = useVault((s) => s.view);
  const tree = useVault((s) => s.tree);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [rowMenu, setRowMenu] = useState<{ at: MenuPosition; rel: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const showing = view?.type === "projects";

  const addItems: MenuItem[] = folders(tree)
    .filter((folder) => !projects.some((p) => p.rel === folder.rel))
    .map((folder) => ({
      label: folder.rel,
      icon: IconFolder,
      onSelect: () => void useProjects.getState().mark(folder.rel, true),
    }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between pl-4 pr-2 pb-1">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          {t("projects.title")}
        </span>
        <Tooltip label={t("projects.add")}>
          <button
            type="button"
            aria-label={t("projects.add")}
            onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect();
              setMenu({ x: rect.left, y: rect.bottom + 4 });
            }}
            className="grid h-6.5 w-6.5 place-items-center rounded-md text-faint transition-colors duration-100 hover:bg-hover hover:text-ink"
          >
            <IconPlus size={14.5} stroke={1.75} />
          </button>
        </Tooltip>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {projects.length === 0 && (
          <p className="px-2 py-3 text-[12px] leading-5 text-faint">{t("projects.sidebarEmpty")}</p>
        )}
        {projects.map((project) => {
          const total = project.todo + project.doing + project.done;
          const current = showing && project.rel === selected;
          if (renaming === project.rel) {
            return (
              <RenameField
                key={project.rel}
                name={project.name}
                onCancel={() => setRenaming(null)}
                onSubmit={(value) => {
                  setRenaming(null);
                  void useProjects.getState().rename(project.rel, value);
                }}
              />
            );
          }
          return (
            <button
              key={project.rel}
              type="button"
              title={project.rel}
              onClick={() => useProjects.getState().open(project.rel)}
              onContextMenu={(event) => {
                event.preventDefault();
                // Else the menu's own window listener sees this same event and closes it.
                event.stopPropagation();
                setRowMenu({ at: { x: event.clientX, y: event.clientY }, rel: project.rel });
              }}
              className={cx(
                "flex h-[30px] w-full items-center gap-2 rounded-md px-2 text-left text-[13px] transition-colors duration-100",
                current ? "bg-invert text-invert-ink" : "text-ink hover:bg-hover",
              )}
            >
              <IconLayoutKanban
                size={14}
                stroke={1.75}
                className={cx("shrink-0", current ? "opacity-70" : "text-faint")}
              />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              {project.doing > 0 && (
                <span
                  className={cx(
                    "flex shrink-0 items-center gap-0.5 text-[11px] tabular-nums",
                    current ? "opacity-70" : "text-muted",
                  )}
                >
                  <IconCircleHalf2 size={11} stroke={2} />
                  {project.doing}
                </span>
              )}
              <span className={cx("shrink-0 text-[11px] tabular-nums", current ? "opacity-70" : "text-faint")}>
                {project.done}/{total}
              </span>
            </button>
          );
        })}
      </div>
      {menu && (
        <ContextMenu
          position={menu}
          onClose={() => setMenu(null)}
          items={
            addItems.length
              ? addItems
              : [{ label: t("projects.noFolders"), onSelect: () => undefined }]
          }
        />
      )}
      {rowMenu && (
        <ContextMenu
          position={rowMenu.at}
          onClose={() => setRowMenu(null)}
          items={[
            {
              label: t("projects.rename"),
              icon: IconPencil,
              onSelect: () => setRenaming(rowMenu.rel),
            },
            {
              label: t("projects.remove"),
              icon: IconX,
              onSelect: () => void useProjects.getState().mark(rowMenu.rel, false),
            },
          ]}
        />
      )}
    </div>
  );
}
