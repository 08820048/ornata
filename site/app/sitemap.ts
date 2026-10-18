import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  // Pin lastmod to real release dates — a rolling build timestamp makes
  // every crawl see "changed" and erodes trust in the field.
  return [
    {
      url: "https://ornata.app",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://ornata.app/docs",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      url: "https://ornata.app/updates",
      lastModified: new Date("2026-10-18"),
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
