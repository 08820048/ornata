#!/usr/bin/env bun

// Create or update the GitHub release for a version: notes from CHANGELOG.md,
// download links for the installers that are really on the download server,
// and (with --assets) the installers staged in release/<version>/ attached
// to the release with a SHA256SUMS.txt.
//
// Usage: bun scripts/github-release.js <version> [--assets] [--not-latest]
//
// Needs the gh CLI, logged in (GH_TOKEN in CI). The tag v<version> must
// exist on the remote: the Mac release creates it (see AGENTS.md,
// "Releasing"); this script refuses to guess which commit a version was.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { RELEASE_ORIGIN, RELEASE_PREFIX, publishedObjectExists } from "./release-config.js";

const REPO = process.env.GITHUB_REPOSITORY || "08820048/ornata";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("--"));
const withAssets = args.includes("--assets");
const notLatest = args.includes("--not-latest");

const fail = (message) => {
  console.error(`Error: ${message}`);
  process.exit(1);
};
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  fail("usage: bun scripts/github-release.js <version> [--assets] [--not-latest]");
}
const tag = `v${version}`;

const gh = async (cmd, { allowFail = false } = {}) => {
  const child = Bun.spawn(["gh", ...cmd], { cwd: root, stdout: "pipe", stderr: "pipe" });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code !== 0 && !allowFail) fail(`gh ${cmd.join(" ")}\n${err.trim()}`);
  return { out, err, code };
};

/** The body of one version's section in CHANGELOG.md, without its heading. */
export function changelogSection(text, wanted) {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${wanted}]`));
  if (start === -1) return null;
  let end = lines.findIndex((line, i) => i > start && /^## \[/.test(line));
  if (end === -1) end = lines.length;
  const date = /\] - (\d{4}-\d{2}-\d{2})/.exec(lines[start])?.[1] ?? null;
  return { date, body: lines.slice(start + 1, end).join("\n").trim() };
}

// Over the public URL, or from R2 when Cloudflare refuses this network (CI).
const exists = (url) => publishedObjectExists(url.slice(RELEASE_ORIGIN.length + 1));

const base = `${RELEASE_ORIGIN}/${RELEASE_PREFIX}/releases/${version}`;
const dmg = `${base}/darwin-aarch64/Ornata_${version}_aarch64.dmg`;
const exe = `${base}/windows-x86_64/Ornata_${version}_x64-setup.exe`;

const section = changelogSection(readFileSync(join(root, "CHANGELOG.md"), "utf8"), version);
if (!section) fail(`CHANGELOG.md has no section for ${version}`);

const remoteTag = await gh(["api", `repos/${REPO}/git/ref/tags/${tag}`], { allowFail: true });
if (remoteTag.code !== 0) fail(`tag ${tag} is not on ${REPO}; push it first (git push origin ${tag})`);

const downloads = [];
if (await exists(dmg)) downloads.push(`[macOS 12+ (Apple Silicon)](${dmg})`);
if (await exists(exe)) downloads.push(`[Windows 10+ (64-bit)](${exe})`);

const notes = [
  downloads.length
    ? `**Download:** ${downloads.join(" · ")} — or from [ornata.app](https://ornata.app). Installed apps update themselves.`
    : "Installers for this version are no longer offered; get the current one from [ornata.app](https://ornata.app).",
  "",
  section.body,
  "",
  `---\nFull history: [CHANGELOG.md](https://github.com/${REPO}/blob/main/CHANGELOG.md) · 中文更新日志: [ornata.app/zh/updates](https://ornata.app/zh/updates)`,
].join("\n");
const notesFile = join(tmpdir(), `ornata-release-${version}.md`);
writeFileSync(notesFile, `${notes}\n`);

const existing = await gh(["release", "view", tag, "--repo", REPO, "--json", "tagName"], { allowFail: true });
const latestFlag = notLatest ? "--latest=false" : "--latest";
if (existing.code === 0) {
  await gh(["release", "edit", tag, "--repo", REPO, "--title", `Ornata ${version}`, "--notes-file", notesFile, latestFlag]);
  console.log(`Updated release ${tag}`);
} else {
  await gh(["release", "create", tag, "--repo", REPO, "--verify-tag", "--title", `Ornata ${version}`, "--notes-file", notesFile, latestFlag]);
  console.log(`Created release ${tag}`);
}

if (withAssets) {
  // What a person installs: the DMG and the Windows installer. The updater
  // archives and signatures stay on the download server.
  const releaseDir = join(root, "release", version);
  const files = existsSync(releaseDir)
    ? readdirSync(releaseDir, { recursive: true })
        .map(String)
        .filter((name) => name.endsWith(".dmg") || name.endsWith("-setup.exe"))
        .map((name) => join(releaseDir, name))
    : [];
  if (!files.length) fail(`no .dmg or -setup.exe under ${releaseDir}`);

  // Merge with sums already on the release, so the Mac and Windows uploads,
  // made on different machines, end up in one file.
  const sums = new Map();
  const previous = await gh(["release", "download", tag, "--repo", REPO, "--pattern", "SHA256SUMS.txt", "--output", "-"], { allowFail: true });
  for (const line of previous.code === 0 ? previous.out.split("\n") : []) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/.exec(line.trim());
    if (match) sums.set(match[2], match[1]);
  }
  for (const file of files) {
    sums.set(basename(file), createHash("sha256").update(readFileSync(file)).digest("hex"));
  }
  const sumsFile = join(tmpdir(), "SHA256SUMS.txt");
  writeFileSync(sumsFile, [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([name, hash]) => `${hash}  ${name}`).join("\n") + "\n");

  await gh(["release", "upload", tag, "--repo", REPO, "--clobber", ...files, sumsFile]);
  console.log(`Attached ${files.map((file) => basename(file)).join(", ")} and SHA256SUMS.txt`);
}
