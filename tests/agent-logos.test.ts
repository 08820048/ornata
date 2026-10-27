import { expect, test } from "bun:test";
import { agentLogo, agentLogoArt } from "../src/components/projects/agentLogos";
import { AGENT_LOGOS } from "../src/components/projects/agentLogoData";

test("agents are recognised by the name they report for themselves", () => {
  const cases: Array<[string, string | null]> = [
    ["claude-code", "claude"],
    ["Claude-Code", "claude"],
    ["codex-mcp-client", "codex"],
    ["openai-mcp", "openai"],
    ["gemini-cli", "gemini"],
    ["cursor-vscode", "cursor"],
    ["GitHub Copilot", "githubcopilot"],
    ["windsurf", "windsurf"],
    ["amp", "amp"],
    ["Amp-CLI", "amp"],
    ["glm-4", "zhipu"],
    ["opencode", "opencode"],
    ["pi", "pi"],
    ["pi-coding-agent", "pi"],
    ["kimi-cli", "kimi"],
    ["pipeline", null],
    ["rmcp", null],
    ["example", null],
    ["", null],
  ];
  for (const [name, logo] of cases) expect(agentLogo(name)).toBe(logo as never);
});

test("every logo has markup, colour ones set their own fills", () => {
  for (const [name, logo] of Object.entries(AGENT_LOGOS)) {
    expect(logo.svg.includes("<path"), name).toBe(true);
    expect(logo.svg.includes("<script"), name).toBe(false);
    if (logo.color) expect(/fill="(#|url|gold)/.test(logo.svg), name).toBe(true);
  }
  expect(agentLogoArt("claude").color).toBe(true);
  expect(agentLogoArt("cursor").color).toBe(false);
});
