#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  R2_BUCKET,
  RELEASE_CHANNEL,
  RELEASE_ORIGIN,
  RELEASE_PREFIX,
  channelManifestKey,
  channelManifestUrl,
  normalizeArch,
  platformKey,
  releaseObjectKey,
} from "./release-config.js";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const version = args.find((arg) => !arg.startsWith("--"));
const confirmed = args.includes("--confirm");

if (!version) {
  console.error("Usage: bun scripts/publish-r2.js <version> [--confirm]");
  process.exit(1);
}

const arch = normalizeArch(process.env.RELEASE_ARCH);
const releaseDir = join(projectRoot, "release", version);
const platformDir = join(releaseDir, platformKey(arch));
const manifestPath = join(releaseDir, "latest.json");

if (!existsSync(manifestPath) || !existsSync(platformDir)) {
  console.error(`Release staging directory is incomplete: ${releaseDir}`);
  console.error(`Run: bun run release -- ${version} \"Release notes\"`);
  process.exit(1);
}

const stagedFiles = readdirSync(platformDir)
  .map((name) => join(platformDir, name))
  .filter((path) => statSync(path).isFile());
const requiredSuffixes = [".app.tar.gz", ".app.tar.gz.sig", ".dmg"];
for (const suffix of requiredSuffixes) {
  if (!stagedFiles.some((path) => path.endsWith(suffix))) {
    console.error(`Missing staged ${suffix} artifact in ${platformDir}`);
    process.exit(1);
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
if (manifest.version !== version || !manifest.platforms?.[platformKey(arch)]) {
  console.error("Staged latest.json does not match the requested version and platform.");
  process.exit(1);
}

const contentType = (path) => {
  if (path.endsWith(".json")) return "application/json; charset=utf-8";
  if (path.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (path.endsWith(".tar.gz")) return "application/gzip";
  return "application/octet-stream";
};

const wrangler = async (command, maxAttempts = 4) => {
  console.log(`wrangler ${command.join(" ")}`);
  if (!confirmed) return;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const child = Bun.spawn(["bunx", "wrangler", ...command], {
      cwd: join(projectRoot, "site"),
      stdout: "inherit",
      stderr: "inherit",
    });
    const code = await child.exited;
    if (code === 0) return;
    if (attempt === maxAttempts) {
      throw new Error(`wrangler failed after ${maxAttempts} attempts`);
    }
    const delayMs = attempt * 2_000;
    console.warn(`wrangler failed (attempt ${attempt}/${maxAttempts}); retrying in ${delayMs / 1_000}s...`);
    await Bun.sleep(delayMs);
  }
};

console.log(`Bucket: ${R2_BUCKET}`);
console.log(`Prefix: ${RELEASE_PREFIX}`);
console.log(`Channel: ${RELEASE_CHANNEL}`);
console.log(`Origin: ${RELEASE_ORIGIN}`);
console.log(confirmed ? "Publishing release..." : "Dry run only; pass --confirm to upload.");

if (confirmed) await wrangler(["whoami"]);

for (const path of stagedFiles) {
  await wrangler([
    "r2",
    "object",
    "put",
    `${R2_BUCKET}/${releaseObjectKey(version, arch, path)}`,
    "--file",
    path,
    "--content-type",
    contentType(path),
    "--cache-control",
    "public, max-age=31536000, immutable",
    "--remote",
  ]);
}

const versionedManifestKey = `${RELEASE_PREFIX}/releases/${version}/latest.json`;
await wrangler([
  "r2",
  "object",
  "put",
  `${R2_BUCKET}/${versionedManifestKey}`,
  "--file",
  manifestPath,
  "--content-type",
  contentType(manifestPath),
  "--cache-control",
  "public, max-age=31536000, immutable",
  "--remote",
]);

// Publish the mutable channel pointer last so clients never see a partial release.
await wrangler([
  "r2",
  "object",
  "put",
  `${R2_BUCKET}/${channelManifestKey()}`,
  "--file",
  manifestPath,
  "--content-type",
  contentType(manifestPath),
  "--cache-control",
  "no-store",
  "--remote",
]);

if (confirmed) {
  const manifestResponse = await fetch(`${channelManifestUrl()}?published=${Date.now()}`, {
    cache: "no-store",
  });
  if (!manifestResponse.ok) {
    throw new Error(`Published manifest returned HTTP ${manifestResponse.status}`);
  }
  const published = await manifestResponse.json();
  if (published.version !== version) {
    throw new Error(`Published manifest reports ${published.version}, expected ${version}`);
  }
  const bundleResponse = await fetch(manifest.platforms[platformKey(arch)].url, {
    method: "HEAD",
    cache: "no-store",
  });
  if (!bundleResponse.ok) {
    throw new Error(`Published updater bundle returned HTTP ${bundleResponse.status}`);
  }
  console.log(`Published and verified: ${channelManifestUrl()}`);
}
