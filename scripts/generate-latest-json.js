#!/usr/bin/env node

import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeArch,
  platformKey,
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
const macosDir = join(projectRoot, "src-tauri", "target", "release", "bundle", "macos");
const signatureFiles = readdirSync(macosDir)
  .filter((name) => name.endsWith(".app.tar.gz.sig"))
  .map((name) => join(macosDir, name))
  .filter((path) => statSync(path).size > 0);

if (signatureFiles.length !== 1) {
  console.error(
    `Expected exactly one macOS updater signature in ${macosDir}, found ${signatureFiles.length}.`,
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
    [platformKey(arch)]: {
      signature: readFileSync(signaturePath, "utf8").trim(),
      url: releaseUrl(version, arch, bundlePath),
    },
  },
};

const outputDir = join(projectRoot, "release", version);
const outputPath = join(outputDir, "latest.json");
mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Generated ${outputPath}`);
console.log(`Platform: ${platformKey(arch)}`);
console.log(`Bundle: ${manifest.platforms[platformKey(arch)].url}`);
