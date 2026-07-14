import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This app lives in a subdir of the app repo; pin tracing to the site root.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;

// Enables the Cloudflare bindings + dev platform when running `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
