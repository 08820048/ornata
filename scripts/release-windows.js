#!/usr/bin/env bun

// Build and stage a Windows release on a Windows machine (the cloud PC; CI has
// no minutes left for it). The counterpart of release.sh on the Mac, minus the
// version bump: Windows builds the commit the Mac release already made, so
// both platforms ship the same version from one channel manifest.
//
// Usage: bun run release:windows <version>
// Then:  bun run release:publish -- <version>            (dry run)
//        bun run release:publish -- <version> --confirm
// Steps and setup: docs/windows-release.md

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { liveChannelManifest, normalizeArch, platformKey } from "./release-config.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const version = process.argv[2];

const fail = (message) => {
  console.error(`Error: ${message}`);
  process.exit(1);
};

if (process.platform !== "win32") fail("run this on Windows; macOS releases use bun run release");
if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  fail("usage: bun run release:windows <version>");
}

const appVersion = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
if (appVersion !== version) {
  fail(`the checkout is ${appVersion}, not ${version}. git pull (or check out the release commit) first.`);
}

// Updater signing key: the same one the Mac uses (minisign, ~/.tauri on both).
const defaultKey = join(homedir(), ".tauri", "ornata-markd.key");
if (!process.env.TAURI_SIGNING_PRIVATE_KEY && existsSync(defaultKey)) {
  process.env.TAURI_SIGNING_PRIVATE_KEY = defaultKey;
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) fail(`no updater key: put it at ${defaultKey} or set TAURI_SIGNING_PRIVATE_KEY`);
if (!process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD) fail("TAURI_SIGNING_PRIVATE_KEY_PASSWORD is not set");

// A channel serves one version. Building one macOS isn't on is wasted work:
// publishing it would be refused (it would take updates away from Mac users).
const live = await liveChannelManifest();
if (live && live.version !== version) {
  fail(`the stable channel serves ${live.version}. Build that version, or wait for the Mac release of ${version}.`);
}

const run = async (cmd, env = {}) => {
  console.log(`\n> ${cmd.join(" ")}`);
  const child = Bun.spawn(cmd, { cwd: root, stdout: "inherit", stderr: "inherit", env: { ...process.env, ...env } });
  if ((await child.exited) !== 0) fail(`${cmd.join(" ")} failed`);
};

const arch = normalizeArch(process.env.RELEASE_ARCH);
const bundleDir = join(root, "src-tauri", "target", "release", "bundle");
const platformDir = join(root, "release", version, platformKey(arch, "windows"));

console.log("Removing stale release artifacts...");
rmSync(bundleDir, { recursive: true, force: true });
rmSync(platformDir, { recursive: true, force: true });

await run([process.execPath, "install", "--frozen-lockfile"]);
await run([process.execPath, "run", "tauri", "build", "--bundles", "nsis"]);

const nsisDir = join(bundleDir, "nsis");
const installers = readdirSync(nsisDir).filter((name) => name.endsWith("-setup.exe"));
if (installers.length !== 1) fail(`expected one installer in ${nsisDir}, found ${installers.length}`);
const installer = join(nsisDir, installers[0]);
if (!existsSync(`${installer}.sig`)) fail(`missing updater signature ${installer}.sig (is the key password right?)`);

mkdirSync(platformDir, { recursive: true });
copyFileSync(installer, join(platformDir, installers[0]));
copyFileSync(`${installer}.sig`, join(platformDir, `${installers[0]}.sig`));

const notes = live?.notes || `Ornata ${version}`;
await run([process.execPath, "scripts/generate-latest-json.js", version, notes], {
  RELEASE_PLATFORM: "windows",
  RELEASE_ARCH: arch,
});

console.log(`\nStaged ${platformDir}`);
console.log(`Install ${installers[0]} on this machine and try it, then:`);
console.log(`  bun run release:publish -- ${version}            (dry run)`);
console.log(`  bun run release:publish -- ${version} --confirm`);
