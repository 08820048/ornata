import { basename } from "node:path";
import { fileURLToPath } from "node:url";

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

/** Read an object straight from the R2 bucket through wrangler (needs a
 *  Cloudflare login or CLOUDFLARE_API_TOKEN). Null if the key doesn't exist.
 *  Used when the public URL refuses us: Cloudflare's bot protection answers
 *  403 to scripts on data-centre addresses, GitHub's runners included. */
export async function r2Get(key, { binary = false } = {}) {
  const child = Bun.spawn(
    [process.execPath, "x", "wrangler", "r2", "object", "get", `${R2_BUCKET}/${key}`, "--remote", "--pipe"],
    { cwd: fileURLToPath(new URL("../site/", import.meta.url)), stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code === 0) return binary ? new Uint8Array(out) : new TextDecoder().decode(out);
  if (/key does not exist|NoSuchKey|not found/i.test(err)) return null;
  throw new Error(`wrangler r2 object get ${key} failed:\n${err.trim()}`);
}

const canUseR2 = () => Boolean(process.env.CLOUDFLARE_API_TOKEN);

/** The manifest the stable channel serves right now, or null if there is none
 *  yet. Throws on any other failure: callers use it to avoid dropping other
 *  platforms, so "couldn't tell" must not pass for "nothing there". */
export async function liveChannelManifest() {
  const response = await fetch(`${channelManifestUrl()}?t=${Date.now()}`, {
    cache: "no-store",
    headers: { "user-agent": "ornata-release-script" },
  });
  if (response.status === 404) return null;
  if (response.ok) return response.json();
  if (canUseR2()) {
    const text = await r2Get(channelManifestKey());
    return text === null ? null : JSON.parse(text);
  }
  throw new Error(
    `Could not read the live manifest (${channelManifestUrl()}): HTTP ${response.status}. ` +
      "Set CLOUDFLARE_API_TOKEN to read it from R2 instead.",
  );
}

/** Whether a published file can be fetched: over its public URL, or straight
 *  from R2 when the public URL refuses scripts from this network. */
export async function publishedObjectExists(key) {
  const response = await fetch(`${RELEASE_ORIGIN}/${key}`, {
    method: "HEAD",
    cache: "no-store",
    headers: { "user-agent": "ornata-release-script" },
  });
  if (response.ok) return true;
  if ((response.status === 403 || response.status === 429) && canUseR2()) {
    return (await r2Get(key, { binary: true })) !== null;
  }
  return false;
}
