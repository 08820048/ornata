import { basename } from "node:path";

export const PRODUCT_SLUG = "ornata-markd";
export const R2_BUCKET = process.env.R2_BUCKET || "ornata";
export const RELEASE_ORIGIN = (
  process.env.RELEASE_ORIGIN || "https://download.ornata.app"
).replace(/\/$/, "");
export const RELEASE_PREFIX = (
  process.env.R2_RELEASE_PREFIX || `products/${PRODUCT_SLUG}`
).replace(/^\/+|\/+$/g, "");
export const RELEASE_CHANNEL = process.env.RELEASE_CHANNEL || "stable";

export function normalizeArch(value = process.arch) {
  if (value === "arm64" || value === "aarch64") return "aarch64";
  if (value === "x64" || value === "x86_64") return "x86_64";
  throw new Error(`Unsupported release architecture: ${value}`);
}

// Defaults to the machine running the script, so a Windows release needs no
// extra variable; RELEASE_PLATFORM still overrides it.
export function releasePlatform(value = process.env.RELEASE_PLATFORM || process.platform) {
  if (value === "darwin") return "darwin";
  if (value === "windows" || value === "win32") return "windows";
  if (value === "linux") return "linux";
  throw new Error(`Unsupported release platform: ${value}`);
}

export function platformKey(arch, platform = releasePlatform()) {
  return `${platform}-${normalizeArch(arch)}`;
}

export function releaseObjectKey(version, arch, filePath) {
  return `${RELEASE_PREFIX}/releases/${version}/${platformKey(arch)}/${basename(filePath)}`;
}

export function releaseUrl(version, arch, filePath) {
  return `${RELEASE_ORIGIN}/${releaseObjectKey(version, arch, filePath)}`;
}

export function channelManifestKey() {
  return `${RELEASE_PREFIX}/channels/${RELEASE_CHANNEL}/latest.json`;
}

export function channelManifestUrl() {
  return `${RELEASE_ORIGIN}/${channelManifestKey()}`;
}

/** The manifest the stable channel serves right now, or null if there is none
 *  yet. Throws on any other failure: callers use it to avoid dropping other
 *  platforms, so "couldn't tell" must not pass for "nothing there". */
export async function liveChannelManifest() {
  const response = await fetch(`${channelManifestUrl()}?t=${Date.now()}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Could not read the live manifest (${channelManifestUrl()}): HTTP ${response.status}`);
  }
  return response.json();
}
