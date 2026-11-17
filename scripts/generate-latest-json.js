#!/usr/bin/env node

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  liveChannelManifest,
  normalizeArch,
  platformKey,
  releasePlatform,
  releaseUrl,
} from "./release-config.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const [version, ...noteParts] = process.argv.slice(2);
const notes = noteParts.join(" ").trim();

if (!version || !notes) {
  console.error("Usage: bun scripts/generate-latest-json.js <version> <release-notes>");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid semantic version: ${version}`);
  process.exit(1);
}

const arch = normalizeArch(process.env.RELEASE_ARCH);
const platform = releasePlatform();
// Updater signatures land next to the bundles: macos/*.app.tar.gz.sig,
// windows nsis/*.exe.sig, windows msi not used for updates.
const bundleSubdir = platform === "windows" ? "nsis" : "macos";
const sigSuffix = platform === "windows" ? ".exe.sig" : ".app.tar.gz.sig";
const bundleDir = join(projectRoot, "src-tauri", "target", "release", "bundle", bundleSubdir);
const signatureFiles = readdirSync(bundleDir)
  .filter((name) => name.endsWith(sigSuffix))
  .map((name) => join(bundleDir, name))
  .filter((path) => statSync(path).size > 0);

if (signatureFiles.length !== 1) {
  console.error(
    `Expected exactly one ${platform} updater signature in ${bundleDir}, found ${signatureFiles.length}.`,
  );
  console.error("Remove stale release artifacts and rebuild before generating the manifest.");
  process.exit(1);
}

const signaturePath = signatureFiles[0];
const bundlePath = signaturePath.slice(0, -4);
try {
  if (statSync(bundlePath).size === 0) throw new Error("empty bundle");
} catch {
  console.error(`Updater bundle is missing or empty: ${bundlePath}`);
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms: {
    [platformKey(arch, platform)]: {
      signature: readFileSync(signaturePath, "utf8").trim(),
      url: releaseUrl(version, arch, bundlePath),
    },
  },
};

const outputDir = join(projectRoot, "release", version);
const outputPath = join(outputDir, "latest.json");

// Merge into an existing manifest so each platform adds its entry without
// dropping entries built on other machines. Each platform is built on its own
// machine (Windows on a cloud PC), where no local manifest exists, so the one
// the channel serves now is the other source: without it the Windows publish
// replaced the macOS entry and Mac users stopped getting updates.
// Windows must see the live manifest (it is the only place the macOS entry
// is); a Mac release, which normally moves to a new version, only warns, so a
// network hiccup doesn't throw away a notarized build. publish-r2 checks again.
const live = await liveChannelManifest().catch((error) => {
  if (platform === "windows") throw error;
  console.warn(`(could not read the live manifest: ${error.message})`);
  return null;
});
const local = existsSync(outputPath) ? JSON.parse(readFileSync(outputPath, "utf8")) : null;
if (live && live.version !== version && platform === "windows") {
  console.error(
    `The stable channel serves ${live.version}, not ${version}. A channel holds one version, so ` +
      "publishing this would take updates away from macOS. Build the version the Mac release published.",
  );
  process.exit(1);
}
for (const existing of [live, local]) {
  if (existing?.version !== version || !existing.platforms) continue;
  manifest.platforms = { ...existing.platforms, ...manifest.platforms };
  manifest.notes = existing.notes || manifest.notes;
}
const others = Object.keys(manifest.platforms).filter((key) => key !== platformKey(arch, platform));
if (others.length) console.log(`Kept from the existing manifest: ${others.join(", ")}`);
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Generated ${outputPath}`);
console.log(`Platform: ${platformKey(arch)}`);
console.log(`Bundle: ${manifest.platforms[platformKey(arch)].url}`);
