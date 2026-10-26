import { expect, test } from "bun:test";
import { agentLogo, agentLogoPaths } from "../src/components/projects/agentLogos";
import { AGENT_LOGO_PATHS } from "../src/components/projects/agentLogoData";

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
    ["rmcp", null],
    ["example", null],
    ["", null],
  ];
  for (const [name, logo] of cases) expect(agentLogo(name)).toBe(logo as never);
});

test("every logo has outlines and every matcher points at a real one", () => {
  for (const [name, paths] of Object.entries(AGENT_LOGO_PATHS)) {
    expect(paths.length, name).toBeGreaterThan(0);
    expect(paths.every((d) => d.startsWith("M")), name).toBe(true);
  }
  expect(agentLogoPaths("claude").length).toBeGreaterThan(0);
});
