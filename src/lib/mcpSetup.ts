import type { McpStatus } from "@/lib/types";

export interface SetupCommand {
  id: "claude" | "codex" | "gemini" | "json";
  /** Display name; the JSON entry is labelled by the caller. */
  label: string;
  text: string;
}

const needsQuotes = (value: string) => /[\s"'\\$`]/.test(value);

/** How an agent should start the server: `ornata` once it's on the PATH,
 *  otherwise the app's own executable. */
export function serverCommand(executable: string, installed: boolean): string {
  if (installed) return "ornata";
  return needsQuotes(executable) ? JSON.stringify(executable) : executable;
}

/** One-line setup for each agent that speaks MCP. */
export function setupCommands(executable: string, installed: boolean): SetupCommand[] {
  const bin = serverCommand(executable, installed);
  const raw = installed ? "ornata" : executable;
  return [
    { id: "claude", label: "Claude Code", text: `claude mcp add ornata -- ${bin} mcp` },
    { id: "codex", label: "Codex CLI", text: `codex mcp add ornata -- ${bin} mcp` },
    { id: "gemini", label: "Gemini CLI", text: `gemini mcp add ornata ${bin} mcp` },
    {
      id: "json",
      label: "JSON",
      text: JSON.stringify({ mcpServers: { ornata: { command: raw, args: ["mcp"] } } }, null, 2),
    },
  ];
}

/** Green only when access is on and an agent process is actually running. */
export function isConnected(status: McpStatus | null): boolean {
  return Boolean(status && status.access !== "off" && status.sessions.length > 0);
}

export function connectedClients(status: McpStatus | null): string[] {
  if (!status) return [];
  return [...new Set(status.sessions.map((s) => s.client || "agent"))];
}
