// What a request to the download host is, from its path alone. Pure so it can be tested.
// Layout (scripts/release-config.js):
//   products/ornata-markd/channels/<channel>/latest.json            the updater's check
//   products/ornata-markd/releases/<version>/<platform>/<file>      installers and update bundles

export type Kind = "update_check" | "download" | "update_download" | "other";

export interface Hit {
  kind: Kind;
  /** Release version, "" when the path has none. */
  version: string;
  /** e.g. darwin-aarch64, "" when the path has none. */
  platform: string;
  /** The file name, or the channel for an update check. */
  file: string;
}

const PREFIX = "products/ornata-markd/";
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?$/;
const PLATFORM = /^(?:darwin|windows|linux)-(?:aarch64|x86_64)$/;
const INSTALLER = /\.(?:dmg|exe|msi|appimage|deb|rpm)$/i;
const UPDATE_BUNDLE = /\.(?:tar\.gz|nsis\.zip|zip)$/i;

const OTHER: Hit = { kind: "other", version: "", platform: "", file: "" };

export function classify(pathname: string): Hit {
  const key = pathname.replace(/^\/+/, "");
  if (!key.startsWith(PREFIX)) return OTHER;
  const parts = key.slice(PREFIX.length).split("/");

  if (parts.length === 3 && parts[0] === "channels" && parts[2] === "latest.json") {
    return { kind: "update_check", version: "", platform: "", file: /^[a-z0-9-]{1,20}$/.test(parts[1]) ? parts[1] : "?" };
  }
  if (parts.length === 4 && parts[0] === "releases") {
    const [, version, platform, file] = parts;
    const known = VERSION.test(version) && PLATFORM.test(platform);
    const kind: Kind = !known
      ? "other"
      : INSTALLER.test(file)
        ? "download"
        : UPDATE_BUNDLE.test(file)
          ? "update_download"
          : "other";
    return { kind, version: known ? version : "", platform: known ? platform : "", file: known ? file.slice(0, 80) : "" };
  }
  return OTHER;
}

/** A resumed or chunked download is one download: only the part that starts at the beginning counts. */
export function startsAtBeginning(range: string | null): boolean {
  return range === null || /^bytes=0-/.test(range);
}

/** Coarse client class; the raw user agent is never stored. */
export function clientClass(userAgent: string | null): "bot" | "browser" | "app" {
  const ua = userAgent ?? "";
  if (/bot|spider|crawl|preview|curl|wget|python|go-http|java\/|headless|monitor/i.test(ua)) return "bot";
  return /^Mozilla\//.test(ua) ? "browser" : "app";
}

/** UTC day, `2026-10-27`: the unit a device is counted once in. */
export const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Who, for one day only: a salted hash of the address and the day, so the same
 * device counts once a day and cannot be followed from one day to the next
 * (or recovered from the hash without the secret).
 */
export async function deviceId(ip: string | null, day: string, secret: string | undefined): Promise<string> {
  if (!ip || !secret) return "";
  const data = new TextEncoder().encode(`${secret}|${day}|${ip}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What the app says about itself on an update check: its version and system
 * (`?v=0.12.2&t=darwin-aarch64`, from the updater's endpoint template). Older
 * versions send nothing; anything that does not look like a version or a
 * system is dropped, so the labels cannot be made up.
 */
export function clientInfo(params: URLSearchParams): { version: string; target: string } {
  const v = params.get("v") ?? "";
  const t = params.get("t") ?? "";
  return { version: VERSION.test(v) ? v : "", target: PLATFORM.test(t) ? t : "" };
}
