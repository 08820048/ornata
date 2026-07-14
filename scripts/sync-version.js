#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const requestedVersion = process.argv[2];

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function updateJsonVersion(path, version) {
  const value = readJson(path);
  value.version = version;
  writeJson(path, value);
  console.log(`Updated ${path} to ${version}`);
}

const tauriPath = join(projectRoot, "src-tauri", "tauri.conf.json");
const tauriConfig = readJson(tauriPath);

if (requestedVersion) {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(requestedVersion)) {
    console.error(`Invalid semantic version: ${requestedVersion}`);
    process.exit(1);
  }
  tauriConfig.version = requestedVersion;
  writeJson(tauriPath, tauriConfig);
}

const version = tauriConfig.version;
if (!version) {
  console.error("No version found in src-tauri/tauri.conf.json");
  process.exit(1);
}

updateJsonVersion(join(projectRoot, "package.json"), version);
updateJsonVersion(join(projectRoot, "site", "package.json"), version);

const cargoPath = join(projectRoot, "src-tauri", "Cargo.toml");
const cargo = readFileSync(cargoPath, "utf8");
const cargoVersionPattern = /^(\s*version\s*=\s*")[^"]+(".*)$/m;
if (!cargoVersionPattern.test(cargo)) {
  console.error("Could not update package version in src-tauri/Cargo.toml");
  process.exit(1);
}
const nextCargo = cargo.replace(cargoVersionPattern, `$1${version}$2`);
writeFileSync(cargoPath, nextCargo, "utf8");
console.log(`Updated ${cargoPath} to ${version}`);

const siteConfigPath = join(projectRoot, "site", "lib", "config.ts");
const siteConfig = readFileSync(siteConfigPath, "utf8");
const nextSiteConfig = siteConfig.replace(
  /export const VERSION = "[^"]+";/,
  `export const VERSION = "${version}";`,
);
if (siteConfig === nextSiteConfig && !siteConfig.includes(`VERSION = "${version}"`)) {
  console.error("Could not update VERSION in site/lib/config.ts");
  process.exit(1);
}
writeFileSync(siteConfigPath, nextSiteConfig, "utf8");
console.log(`Updated ${siteConfigPath} to ${version}`);

console.log(`Version synchronization complete: ${version}`);
