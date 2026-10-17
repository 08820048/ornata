import { useState } from "react";
import { toast } from "sonner";
import { Segmented, SettingGroup } from "@/components/settings/controls";
import { CopyButton } from "@/components/ui/CopyButton";
import type { MessageKey } from "@/lib/i18n";
import { connectedClients, isConnected, setupCommands } from "@/lib/mcpSetup";
import type { CliAccess } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useMcp, useMcpPolling } from "@/stores/mcp";

const LEVELS: CliAccess[] = ["off", "readOnly", "readWrite", "full"];

/** The MCP / command line controls: who is connected, what they may do, and
 *  how to connect an agent. Shared by the dialog and the Settings window. */
export function McpPanel() {
  const t = useT();
  const status = useMcp((s) => s.status);
  const [busy, setBusy] = useState(false);
  useMcpPolling();

  const report = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : String(error));

  if (!status?.vaultPath) {
    return <p className="py-6 text-[13px] text-faint">{t("mcp.noVault")}</p>;
  }

  const connected = isConnected(status);
  const clients = connectedClients(status).join(", ");
  const installed = status.installedAt !== null;
  const commands = setupCommands(status.executable, installed);

  const banner = connected
    ? t("mcp.status.connectedTo", { client: clients })
    : status.access === "off"
      ? t("mcp.status.off")
      : t("mcp.status.idle");

  const toggleCli = async () => {
    setBusy(true);
    try {
      if (installed) {
        await useMcp.getState().uninstall();
      } else {
        const outcome = await useMcp.getState().install();
        if (!outcome.onPath) {
          toast(t("mcp.cli.notOnPath", { dir: outcome.path.replace(/\/ornata$/, "") }));
        }
      }
    } catch (error) {
      report(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div
        role="status"
        className={cx(
          "flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[12.5px]",
          connected ? "bg-success/12 text-ink" : "bg-sunken text-muted",
        )}
      >
        <span
          aria-hidden
          className={cx("size-2 shrink-0 rounded-full", connected ? "bg-success" : "bg-faint")}
        />
        <span className="min-w-0 truncate">{banner}</span>
      </div>

      <div className="mt-6">
        <SettingGroup title={t("mcp.access.title")} hint={t("mcp.access.hint")}>
          <Segmented
            id="mcp-access"
            value={status.access}
            ariaLabel={t("mcp.access.title")}
            options={LEVELS.map((level) => ({ value: level, label: t(`mcp.access.${level}` as MessageKey) }))}
            onChange={(access) => {
              setBusy(true);
              useMcp
                .getState()
                .setAccess(access)
                .catch(report)
                .finally(() => setBusy(false));
            }}
            className={cx(busy && "pointer-events-none opacity-70")}
          />
          <p className="text-[11.5px] leading-5 text-muted">
            {t(`mcp.access.${status.access}.detail` as MessageKey)}
          </p>
        </SettingGroup>

        <SettingGroup title={t("mcp.connect.title")} hint={t("mcp.connect.detail")}>
          <div className="space-y-2">
            {commands.map((command) => (
              <div key={command.id} className="rounded-xl border border-line-soft">
                <div className="flex items-center justify-between px-3 pt-2 text-[11px] font-medium text-faint">
                  <span>{command.id === "json" ? t("mcp.connect.json") : command.label}</span>
                  <CopyButton value={command.text} side="left" />
                </div>
                <pre className="overflow-x-auto px-3 pb-2.5 pt-1 font-mono text-[11.5px] leading-5 text-ink">
                  {command.text}
                </pre>
              </div>
            ))}
          </div>
        </SettingGroup>

        <SettingGroup title={t("mcp.cli.title")} hint={t("mcp.cli.detail")}>
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate font-mono text-[11.5px] text-muted">
              {installed ? t("mcp.cli.installedAt", { path: status.installedAt ?? "" }) : "ornata"}
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggleCli()}
              className="h-8 shrink-0 rounded-lg border border-line bg-hover px-3 text-[12px] font-medium text-ink transition-colors duration-100 hover:bg-active disabled:opacity-60"
            >
              {installed ? t("mcp.cli.remove") : t("mcp.cli.install")}
            </button>
          </div>
        </SettingGroup>
      </div>
    </div>
  );
}
