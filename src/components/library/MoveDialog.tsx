import { IconFolder, IconHome } from "@tabler/icons-react";
import { useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { allFolders, parentOf } from "@/lib/library";
import type { TreeNode } from "@/lib/types";
import { useT } from "@/stores/locale";
import { useVault } from "@/stores/vault";

/** "Move to…": pick the folder a note or folder goes into. */
export function MoveDialog({ node, onClose }: { node: TreeNode | null; onClose: () => void }) {
  const tree = useVault((s) => s.tree);
  const vaultName = useVault((s) => s.name);
  const t = useT();
  const [query, setQuery] = useState("");

  const targets = useMemo(() => {
    if (!node) return [];
    const here = parentOf(node.rel);
    const inside = (rel: string) => rel === node.rel || rel.startsWith(`${node.rel}/`);
    const needle = query.trim().toLowerCase();
    return [{ rel: "", label: vaultName || t("library.title") }, ...allFolders(tree).map((f) => ({ rel: f.rel, label: f.rel }))]
      // Not where it already is, and never into itself.
      .filter((target) => target.rel !== here && !(node.kind === "folder" && inside(target.rel)))
      .filter((target) => !needle || target.label.toLowerCase().includes(needle));
  }, [node, tree, vaultName, query, t]);

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal open={node !== null} onClose={close} align="top" className="mt-[14vh] w-[440px]" ariaLabel={t("library.moveTo")}>
      <div className="truncate border-b border-line-soft px-4 py-2.5 text-[13px] font-semibold text-ink">
        {t("library.moveTitle", { name: node?.name ?? "" })}
      </div>
      <div className="px-2 pt-2">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("library.moveFilter")}
          className="w-full rounded-md bg-sunken px-2.5 py-1.5 text-[13px] text-ink outline-none placeholder:text-faint"
        />
      </div>
      <div className="max-h-[48vh] overflow-y-auto p-2">
        {targets.length === 0 ? (
          <p className="px-3 py-8 text-center text-[13px] text-faint">{t("library.moveNone")}</p>
        ) : (
          targets.map((target) => (
            <button
              key={target.rel}
              type="button"
              onClick={() => {
                if (node) void useVault.getState().moveEntry(node.rel, target.rel);
                close();
              }}
              className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-left text-[13px] text-ink transition-colors duration-100 hover:bg-hover"
            >
              {target.rel ? (
                <IconFolder size={14} stroke={1.75} className="shrink-0 text-faint" />
              ) : (
                <IconHome size={14} stroke={1.75} className="shrink-0 text-faint" />
              )}
              <span className="min-w-0 flex-1 truncate">{target.label}</span>
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}
