import type { MetadataRoute } from "next";

const allowAll = { allow: "/" } as const;

// `*` already allows these crawlers. Naming them keeps answer engines
// allowed even if the wildcard rule is tightened later.
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "ClaudeBot",
  "anthropic-ai",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", ...allowAll },
      ...AI_CRAWLERS.map((userAgent) => ({ userAgent, ...allowAll })),
    ],
    sitemap: "https://ornata.app/sitemap.xml",
    host: "https://ornata.app",
  };
}
