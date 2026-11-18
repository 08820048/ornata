/**
 * "What's new": after an update, the main window shows the release notes of
 * every version since the one this machine last saw. The notes are the site's
 * (`site/lib/releases.ts`, English + Chinese), bundled into the app, so they
 * read the same offline as on ornata.app/updates; nothing is written into the
 * user's vault.
 */
import { RELEASES, type Release } from "../../site/lib/releases";
import type { Language } from "@/lib/types";

export type { Release };

const SEEN_KEY = "ornata:lastSeenVersion";

/** Compare `x.y.z` versions: negative if `a` is older than `b`. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff) return diff;
  }
  return 0;
}

/** Releases newer than `since` up to and including `current`, newest first. */
export function releasesBetween(
  since: string,
  current: string,
  releases: Release[] = RELEASES,
): Release[] {
  return releases
    .filter((r) => compareVersions(r.version, since) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** The notes for `version` alone (the palette's "What's new"), or for the
 *  newest release before it when it has none (a development build). */
export function releaseNotes(version: string, releases: Release[] = RELEASES): Release[] {
  const newest = releases
    .filter((r) => compareVersions(r.version, version) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version))[0];
  return newest ? [newest] : [];
}

/**
 * What to show at launch, recording `current` as seen. Nothing on a fresh
 * install (`firstLaunch`) or when the version hasn't changed. A machine that
 * ran Ornata before this existed has no record yet: it gets the current
 * version's notes only.
 */
export function takeWhatsNew(
  current: string,
  firstLaunch: boolean,
  storage: Pick<Storage, "getItem" | "setItem"> = localStorage,
  releases: Release[] = RELEASES,
): Release[] {
  const seen = storage.getItem(SEEN_KEY);
  storage.setItem(SEEN_KEY, current);
  if (firstLaunch && seen === null) return [];
  if (seen === null) return releaseNotes(current, releases);
  if (compareVersions(seen, current) >= 0) return [];
  return releasesBetween(seen, current, releases);
}

/** A release's text in the app's language (English when it has no Chinese). */
export function localized(release: Release, language: Language) {
  if (language === "zh-CN" && release.zh) return release.zh;
  return { summary: release.summary, changes: release.changes };
}

/** The release date in the app's language, e.g. "2026年11月17日". */
export function releaseDate(release: Release, language: Language): string {
  const [y, m, d] = release.dateTime.split("-").map(Number);
  return new Intl.DateTimeFormat(language, { dateStyle: "long" }).format(new Date(y, m - 1, d));
}

export const UPDATES_URL = {
  en: "https://ornata.app/updates",
  "zh-CN": "https://ornata.app/zh/updates",
} satisfies Record<Language, string>;
