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
  server: { running: false, port: 13200, activity: null, ...server },
});
const session = { pid: 1, vault: "/v", client: "claude-code", startedMs: 1 };

describe("setup commands", () => {
  test("HTTP agents point at the local server URL", () => {
    const by = Object.fromEntries(setupCommands(APP, false, 13200).map((c) => [c.id, c.text]));
    expect(by.claude).toBe("claude mcp add ornata --transport http http://127.0.0.1:13200/mcp");
    expect(by.codex).toBe("codex mcp add ornata --url http://127.0.0.1:13200/mcp");
    expect(by.gemini).toBe("gemini mcp add --transport http ornata http://127.0.0.1:13200/mcp");
    expect(JSON.parse(by.json)).toEqual({ mcpServers: { ornata: { url: "http://127.0.0.1:13200/mcp" } } });
  });

  test("VS Code uses its own shape, and any other client just gets the URL", () => {
    const by = Object.fromEntries(setupCommands(APP, false, 13200).map((c) => [c.id, c.text]));
    expect(JSON.parse(by.vscode)).toEqual({
      servers: { ornata: { type: "http", url: "http://127.0.0.1:13200/mcp" } },
    });
    expect(by.other).toBe("http://127.0.0.1:13200/mcp");
  });

  test("the port follows the server, and Claude Desktop uses stdio", () => {
    const commands = setupCommands("/Users/me/My Apps/Ornata", false, 13205);
    expect(commands.find((c) => c.id === "claude")!.text).toContain(":13205/mcp");
    expect(JSON.parse(commands.find((c) => c.id === "desktop")!.text)).toEqual({
      mcpServers: { ornata: { command: "/Users/me/My Apps/Ornata", args: ["mcp"] } },
    });
    expect(JSON.parse(setupCommands(APP, true, 1).find((c) => c.id === "desktop")!.text).mcpServers.ornata.command).toBe("ornata");
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
