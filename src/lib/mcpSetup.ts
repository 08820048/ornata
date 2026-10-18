import type { McpStatus } from "@/lib/types";

export interface SetupCommand {
  id: "claude" | "codex" | "gemini" | "json" | "vscode" | "desktop" | "other";
  label: string;
  text: string;
}

const needsQuotes = (value: string) => /[\s"'\\$`]/.test(value);

/** How an agent starts the stdio server: `ornata` once it's on the PATH,
 *  otherwise the app's own executable. */
export function serverCommand(executable: string, installed: boolean): string {
  if (installed) return "ornata";
  return needsQuotes(executable) ? JSON.stringify(executable) : executable;
}

export const serverUrl = (port: number) => `http://127.0.0.1:${port}/mcp`;

/** Setup for each agent. Claude Code, Gemini, Cursor, and VS Code connect to
 *  the app's local server and send the token; Codex and Claude Desktop start
 *  `ornata mcp` themselves over stdio, which needs no port and no token. */
export function setupCommands(executable: string, installed: boolean, port: number, token: string): SetupCommand[] {
  const url = serverUrl(port);
  const raw = installed ? "ornata" : executable;
  const bin = serverCommand(executable, installed);
  const auth = `Bearer ${token}`;
  return [
    { id: "claude", label: "Claude Code", text: `claude mcp add ornata --transport http ${url} --header "Authorization: ${auth}"` },
    { id: "codex", label: "Codex CLI", text: `codex mcp add ornata -- ${bin} mcp` },
    { id: "gemini", label: "Gemini CLI", text: `gemini mcp add --transport http --header "Authorization: ${auth}" ornata ${url}` },
    {
      id: "json",
      label: "Cursor",
      text: JSON.stringify({ mcpServers: { ornata: { url, headers: { Authorization: auth } } } }, null, 2),
    },
    {
      id: "vscode",
      label: "VS Code",
      text: JSON.stringify({ servers: { ornata: { type: "http", url, headers: { Authorization: auth } } } }, null, 2),
    },
    {
      id: "desktop",
      label: "Claude Desktop",
      text: JSON.stringify({ mcpServers: { ornata: { command: raw, args: ["mcp"] } } }, null, 2),
    },
    // Any other MCP client: the URL and the header it must send.
    { id: "other", label: "Other", text: `${url}\nAuthorization: ${auth}` },
  ];
}

/** The no-server alternative: the agent runs `ornata mcp` itself, so Ornata
 *  can stay closed. */
export function stdioCommand(executable: string, installed: boolean): string {
  return `claude mcp add ornata -- ${serverCommand(executable, installed)} mcp`;
}

export type McpState = "off" | "server" | "stdio" | "idle";

/** off: agent access is switched off · server: the in-app server is running ·
 *  stdio: an `ornata mcp` process is running · idle: neither. */
export function mcpState(status: McpStatus | null): McpState {
  if (!status || !status.vaultPath || status.access === "off") return "off";
  if (status.server.running) return "server";
  return status.sessions.length > 0 ? "stdio" : "idle";
}

/** Green in the status bar. */
export function isConnected(status: McpStatus | null): boolean {
  const state = mcpState(status);
  return state === "server" || state === "stdio";
}

/** Agents seen on stdio, plus the last one to use the server. */
export function connectedClients(status: McpStatus | null): string[] {
  if (!status) return [];
  const names = status.sessions.map((s) => s.client || "agent");
  const last = status.server.activity?.lastClient;
  if (status.server.running && last) names.push(last);
  return [...new Set(names)];
}
