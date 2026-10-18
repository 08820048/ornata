import { describe, expect, test } from "bun:test";
import {
  connectedClients,
  isConnected,
  mcpState,
  serverCommand,
  setupCommands,
  stdioCommand,
} from "../src/lib/mcpSetup";
import type { McpStatus } from "../src/lib/types";

const APP = "/Applications/Ornata.app/Contents/MacOS/Ornata";
const status = (over: Partial<McpStatus> = {}, server: Partial<McpStatus["server"]> = {}): McpStatus => ({
  vaultPath: "/v",
  access: "readOnly",
  sessions: [],
  executable: APP,
  installedAt: null,
  ...over,
  server: { running: false, port: 13200, activity: null, token: "t", ...server },
});
const session = { pid: 1, vault: "/v", client: "claude-code", startedMs: 1 };

describe("setup commands", () => {
  const T = "tok123";
  const by = (installed = false, port = 13200, exe = APP) =>
    Object.fromEntries(setupCommands(exe, installed, port, T).map((c) => [c.id, c.text]));

  test("HTTP agents point at the local server and send the token", () => {
    const c = by();
    expect(c.claude).toBe('claude mcp add ornata --transport http http://127.0.0.1:13200/mcp --header "Authorization: Bearer tok123"');
    expect(c.gemini).toBe('gemini mcp add --transport http --header "Authorization: Bearer tok123" ornata http://127.0.0.1:13200/mcp');
    expect(JSON.parse(c.json)).toEqual({
      mcpServers: { ornata: { url: "http://127.0.0.1:13200/mcp", headers: { Authorization: "Bearer tok123" } } },
    });
    expect(JSON.parse(c.vscode)).toEqual({
      servers: { ornata: { type: "http", url: "http://127.0.0.1:13200/mcp", headers: { Authorization: "Bearer tok123" } } },
    });
    expect(c.other).toBe("http://127.0.0.1:13200/mcp\nAuthorization: Bearer tok123");
  });

  test("Codex and Claude Desktop run Ornata over stdio: no port, no token", () => {
    const c = by(true);
    expect(c.codex).toBe("codex mcp add ornata -- ornata mcp");
    expect(c.codex).not.toContain("tok123");
    expect(JSON.parse(c.desktop)).toEqual({ mcpServers: { ornata: { command: "ornata", args: ["mcp"] } } });
    expect(JSON.parse(by(false, 1, "/Users/me/My Apps/Ornata").desktop).mcpServers.ornata.command).toBe("/Users/me/My Apps/Ornata");
  });

  test("the port follows the server", () => {
    expect(by(false, 13205).claude).toContain(":13205/mcp");
  });

  test("the no-server alternative uses ornata once installed, else the quoted path", () => {
    expect(serverCommand("/Users/me/My Apps/Ornata", false)).toBe('"/Users/me/My Apps/Ornata"');
    expect(stdioCommand(APP, true)).toBe("claude mcp add ornata -- ornata mcp");
    expect(stdioCommand(APP, false)).toBe(`claude mcp add ornata -- ${APP} mcp`);
  });
});

describe("connection state", () => {
  test("off beats everything; then the server; then stdio; else idle", () => {
    expect(mcpState(null)).toBe("off");
    expect(mcpState(status({ vaultPath: null }))).toBe("off");
    expect(mcpState(status({ access: "off", sessions: [session] }, { running: true }))).toBe("off");
    expect(mcpState(status({ sessions: [session] }, { running: true }))).toBe("server");
    expect(mcpState(status({ sessions: [session] }))).toBe("stdio");
    expect(mcpState(status())).toBe("idle");
  });

  test("green means the server is on or an agent is on stdio", () => {
    expect(isConnected(status())).toBe(false);
    expect(isConnected(status({}, { running: true }))).toBe(true);
    expect(isConnected(status({ sessions: [session] }))).toBe(true);
    expect(isConnected(status({ access: "off" }, { running: true }))).toBe(false);
  });

  test("lists each client once, including the server's last user", () => {
    const both = status(
      { sessions: [session, { ...session, pid: 2, client: "" }] },
      { running: true, activity: { lastClient: "claude-code", lastSeenMs: 1, sessions: 1 } },
    );
    expect(connectedClients(both)).toEqual(["claude-code", "agent"]);
    expect(connectedClients(status({}, { activity: { lastClient: "x", lastSeenMs: 1, sessions: 1 } }))).toEqual([]);
    expect(connectedClients(null)).toEqual([]);
  });
});
