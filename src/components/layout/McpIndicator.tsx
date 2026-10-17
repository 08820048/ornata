import { Plug } from "lucide-react";
import { Tooltip } from "@/components/ui/Tooltip";
import { connectedClients, mcpState } from "@/lib/mcpSetup";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useMcp, useMcpPolling } from "@/stores/mcp";
import { useUi } from "@/stores/ui";

/** Status-bar plug: green while an agent is connected over MCP, gray otherwise.
 *  Click to open MCP Settings. */
export function McpIndicator() {
  const t = useT();
  const status = useMcp((s) => s.status);
  useMcpPolling();
  const state = mcpState(status);
  const connected = state === "server" || state === "stdio";
  const label =
    state === "server"
      ? t("mcp.status.serverOn", { port: status?.server.port ?? 0 })
      : state === "stdio"
        ? t("mcp.indicator.connected", { client: connectedClients(status).join(", ") })
        : state === "off"
          ? t("mcp.status.off")
          : t("mcp.indicator.idle");

  return (
    <div className="flex shrink-0 items-center">
      <Tooltip label={label} side="top">
        <button
          type="button"
          aria-label={label}
          onClick={() => useUi.getState().setMcpOpen(true)}
          className={cx(
            "grid h-5 w-6 place-items-center rounded transition-[color,background-color,transform] duration-100 hover:bg-hover active:scale-[0.96]",
            connected ? "text-success" : "text-faint hover:text-muted",
          )}
        >
          <Plug size={13.5} strokeWidth={2} />
        </button>
      </Tooltip>
    </div>
  );
}
