import { describe, expect, test } from "bun:test";
import { connectedClients, isConnected, serverCommand, setupCommands } from "../src/lib/mcpSetup";
import type { McpStatus } from "../src/lib/types";

const APP = "/Applications/Ornata.app/Contents/MacOS/Ornata";
const status = (over: Partial<McpStatus>): McpStatus => ({
  vaultPath: "/v",
  access: "readOnly",
  sessions: [],
  executable: APP,
  installedAt: null,
  ...over,
});

describe("setup commands", () => {
  test("use ornata when installed, else the quoted app path", () => {
    expect(serverCommand(APP, true)).toBe("ornata");
    expect(serverCommand("/usr/local/bin/ornata", false)).toBe("/usr/local/bin/ornata");
    expect(serverCommand("/Users/me/My Apps/Ornata", false)).toBe('"/Users/me/My Apps/Ornata"');
    const commands = Object.fromEntries(setupCommands(APP, true).map((c) => [c.id, c.text]));
    expect(commands.claude).toBe("claude mcp add ornata -- ornata mcp");
    expect(commands.codex).toBe("codex mcp add ornata -- ornata mcp");
    expect(commands.gemini).toBe("gemini mcp add ornata ornata mcp");
  });

  test("the JSON config is valid and unquoted", () => {
    const json = setupCommands("/Users/me/My Apps/Ornata", false).find((c) => c.id === "json")!;
    expect(JSON.parse(json.text)).toEqual({
      mcpServers: { ornata: { command: "/Users/me/My Apps/Ornata", args: ["mcp"] } },
    });
  });
});

describe("connection state", () => {
  const session = { pid: 1, vault: "/v", client: "claude-code", startedMs: 1 };

  test("connected needs a live session and access that isn't off", () => {
    expect(isConnected(null)).toBe(false);
    expect(isConnected(status({}))).toBe(false);
    expect(isConnected(status({ sessions: [session] }))).toBe(true);
    expect(isConnected(status({ sessions: [session], access: "off" }))).toBe(false);
  });

  test("lists each client once", () => {
    const two = status({ sessions: [session, { ...session, pid: 2 }, { ...session, pid: 3, client: "" }] });
    expect(connectedClients(two)).toEqual(["claude-code", "agent"]);
    expect(connectedClients(null)).toEqual([]);
  });
});
