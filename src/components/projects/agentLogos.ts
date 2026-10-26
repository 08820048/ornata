import { AGENT_LOGO_PATHS } from "./agentLogoData";

export type AgentLogo = keyof typeof AGENT_LOGO_PATHS;

/** First match wins; patterns see the lower-cased name an agent reports for itself. */
const MATCHERS: Array<[RegExp, AgentLogo]> = [
  [/claude/, "claude"],
  [/codex/, "codex"],
  [/openai|chatgpt|gpt/, "openai"],
  [/gemini/, "gemini"],
  [/cursor/, "cursor"],
  [/copilot/, "githubcopilot"],
  [/windsurf|codeium/, "windsurf"],
  [/cline/, "cline"],
  [/qwen/, "qwen"],
  [/deepseek/, "deepseek"],
  [/kimi|moonshot/, "kimi"],
  [/grok/, "grok"],
  [/devin/, "devin"],
  [/opencode/, "opencode"],
  [/(^|[^a-z])amp([^a-z]|$)/, "amp"],
  [/mistral|vibe/, "mistral"],
  [/glm|zhipu|z\.?ai/, "zhipu"],
  [/kiro/, "kiro"],
  [/trae/, "trae"],
];

/** The logo for the agent that calls itself `name` (e.g. `claude-code`), or null when it is not one we know. */
export function agentLogo(name: string): AgentLogo | null {
  const lower = name.toLowerCase();
  return MATCHERS.find(([pattern]) => pattern.test(lower))?.[1] ?? null;
}

export const agentLogoPaths = (logo: AgentLogo): readonly string[] => AGENT_LOGO_PATHS[logo];
