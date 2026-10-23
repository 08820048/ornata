import {
  IconPlug,
} from "@tabler/icons-react";
import { McpPanel } from "@/components/mcp/McpPanel";
import { Modal } from "@/components/ui/Modal";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";

/** MCP Settings, opened from the plug in the status bar. */
export function McpDialog() {
  const t = useT();
  const open = useUi((s) => s.mcpOpen);
  const setOpen = useUi((s) => s.setMcpOpen);
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel={t("mcp.title")}
      className="w-[640px] max-w-[92vw]"
    >
      <div className="flex items-center gap-2 px-6 pt-5 text-[15px] font-semibold text-ink">
        <IconPlug size={16} stroke={2} className="text-muted" />
        {t("mcp.title")}
      </div>
      <div className="px-6 pb-2 pt-4">{open && <McpPanel />}</div>
      <div className="flex justify-end border-t border-line-soft px-6 py-3">
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-8 rounded-lg bg-invert px-4 text-[12.5px] font-medium text-invert-ink transition-transform duration-100 active:scale-[0.97]"
        >
          {t("common.done")}
        </button>
      </div>
    </Modal>
  );
}
