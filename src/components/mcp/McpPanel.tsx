import { useState } from "react";
import { toast } from "sonner";
import { Segmented } from "@/components/settings/controls";
import { CopyButton } from "@/components/ui/CopyButton";
import type { MessageKey } from "@/lib/i18n";
import { connectedClients, isConnected, setupCommands, type SetupCommand } from "@/lib/mcpSetup";
import type { CliAccess } from "@/lib/types";
import { cx } from "@/lib/utils";
import { useT } from "@/stores/locale";
import { useMcp, useMcpPolling } from "@/stores/mcp";

const LEVELS: CliAccess[] = ["off", "readOnly", "readWrite", "full"];

/**
 * MCP controls, laid out like a small preferences sheet rather than a
 * document: a status line, one access row, one agent's setup at a time (tabs),
 * and the command line tool. Shared by the dialog and the Settings window.
 */
export function McpPanel() {
  const t = useT();
  const status = useMcp((s) => s.status);
  const [busy, setBusy] = useState(false);
  const [agent, setAgent] = useState<SetupCommand["id"]>("claude");
  useMcpPolling();

  const report = (error: unknown) =>
    toast.error(error instanceof Error ? error.message : String(error));

  if (!status?.vaultPath) {
    return <p className="py-6 text-[13px] text-faint">{t("mcp.noVault")}</p>;
  }

  const connected = isConnected(status);
  const installed = status.installedAt !== null;
  const commands = setupCommands(status.executable, installed);
  const current = commands.find((command) => command.id === agent) ?? commands[0];
  const vaultName = status.vaultPath.split("/").filter(Boolean).pop() ?? status.vaultPath;

  const banner = connected
    ? t("mcp.status.connectedTo", { client: connectedClients(status).join(", ") })
    : status.access === "off"
      ? t("mcp.status.off")
      : t("mcp.status.idle");

  const setAccess = (access: CliAccess) => {
    setBusy(true);
    useMcp
      .getState()
      .setAccess(access)
      .catch(report)
      .finally(() => setBusy(false));
  };

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
    <div className="space-y-5">
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

      <section>
        <h3 className="text-[13px] font-semibold text-ink">{t("mcp.access.title")}</h3>
        <p className="mt-0.5 text-[11.5px] text-faint">{t("mcp.access.hint")}</p>
        <div className="mt-2.5 flex items-center justify-between gap-4">
          <span className="min-w-0 truncate text-[13px] text-ink" title={status.vaultPath}>
            {vaultName}
          </span>
          <select
            aria-label={t("mcp.access.title")}
            value={status.access}
            disabled={busy}
            onChange={(event) => setAccess(event.target.value as CliAccess)}
            className="h-8 shrink-0 cursor-pointer rounded-lg border border-line bg-bg px-2.5 text-[12.5px] text-ink outline-none transition-colors duration-100 hover:bg-hover focus-visible:border-ink disabled:opacity-60"
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {t(`mcp.access.${level}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-[11.5px] leading-5 text-muted">
          {t(`mcp.access.${status.access}.detail` as MessageKey)}
        </p>
      </section>

      <section>
        <h3 className="text-[13px] font-semibold text-ink">{t("mcp.connect.title")}</h3>
        <p className="mt-0.5 text-[11.5px] text-faint">{t("mcp.connect.detail")}</p>
        <Segmented
          id="mcp-agent"
          value={agent}
          ariaLabel={t("mcp.connect.title")}
          options={commands.map((command) => ({
            value: command.id,
            label: command.id === "json" ? "JSON" : command.label,
          }))}
          onChange={setAgent}
          className="mt-2.5"
        />
        <div className="relative mt-2 rounded-xl border border-line-soft bg-sunken">
          <pre className="max-h-[132px] overflow-auto px-3.5 py-3 pr-11 font-mono text-[11.5px] leading-5 text-ink">
            {current.text}
          </pre>
          <span className="absolute right-1.5 top-1.5">
            <CopyButton value={current.text} side="left" />
          </span>
        </div>
        {current.id === "json" && (
          <p className="mt-1.5 text-[11px] text-faint">{t("mcp.connect.json")}</p>
        )}
      </section>

      <section className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-[13px] font-semibold text-ink">{t("mcp.cli.title")}</h3>
          <p className="mt-0.5 truncate text-[11.5px] text-faint">
            {installed ? t("mcp.cli.installedAt", { path: status.installedAt ?? "" }) : t("mcp.cli.detail")}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleCli()}
          className="h-8 shrink-0 rounded-lg border border-line bg-hover px-3 text-[12px] font-medium text-ink transition-colors duration-100 hover:bg-active disabled:opacity-60"
        >
          {installed ? t("mcp.cli.remove") : t("mcp.cli.install")}
        </button>
      </section>
    </div>
  );
}
