import { Plug } from "lucide-react";
import { McpPanel } from "@/components/mcp/McpPanel";
import { Modal } from "@/components/ui/Modal";
import { useT } from "@/stores/locale";
import { useUi } from "@/stores/ui";

/** MCP Settings, opened from the plug icon in the top bar. */
export function McpDialog() {
  const t = useT();
  const open = useUi((s) => s.mcpOpen);
  const setOpen = useUi((s) => s.setMcpOpen);
  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      ariaLabel={t("mcp.title")}
      align="top"
      className="mt-[8vh] w-[580px]"
    >
      <div className="flex items-center gap-2 border-b border-line-soft px-5 py-3.5 text-[14px] font-semibold text-ink">
        <Plug size={15} strokeWidth={2} className="text-muted" />
        {t("mcp.title")}
      </div>
      <div className="max-h-[72vh] overflow-y-auto px-5 py-4">{open && <McpPanel />}</div>
    </Modal>
  );
}
