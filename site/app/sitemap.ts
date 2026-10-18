import type { MetadataRoute } from "next";

const alt = (en: string, zh: string) => ({
  languages: { en: `https://ornata.app${en}`, "zh-CN": `https://ornata.app${zh}` },
});

export default function sitemap(): MetadataRoute.Sitemap {
  // Pin lastmod to real release dates — a rolling build timestamp makes
  // every crawl see "changed" and erodes trust in the field.
  return [
    {
      url: "https://ornata.app",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "weekly",
      priority: 1,
      alternates: alt("/", "/zh"),
    },
    {
      url: "https://ornata.app/docs",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.9,
      alternates: alt("/docs", "/zh/docs"),
    },
    {
      url: "https://ornata.app/updates",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: alt("/updates", "/zh/updates"),
    },
    {
      url: "https://ornata.app/zh",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "weekly",
      priority: 0.9,
      alternates: alt("/", "/zh"),
    },
    {
      url: "https://ornata.app/zh/docs",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.8,
      alternates: alt("/docs", "/zh/docs"),
    },
    {
      url: "https://ornata.app/zh/updates",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.7,
      alternates: alt("/updates", "/zh/updates"),
    },
  ];
}
