#!/usr/bin/env node

const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const projectRoot = path.join(__dirname, "..");
const tauriConfig = JSON.parse(
  fs.readFileSync(path.join(projectRoot, "src-tauri", "tauri.conf.json"), "utf8"),
);
const version = process.argv[2] || tauriConfig.version;
const arch = process.arch === "arm64" ? "aarch64" : "x86_64";
const port = Number(process.env.UPDATE_TEST_PORT || 3000);
const releaseDir = path.join(projectRoot, "release", version);
const platformDir = path.join(releaseDir, `darwin-${arch}`);
const manifestPath = path.join(releaseDir, "latest.json");

if (!fs.existsSync(manifestPath) || !fs.existsSync(platformDir)) {
  console.error(`Release ${version} is not staged. Run the signed release build first.`);
  process.exit(1);
}

function localManifest() {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  for (const platform of Object.values(manifest.platforms || {})) {
    const fileName = path.basename(new URL(platform.url).pathname);
    platform.url = `http://localhost:${port}/artifacts/${encodeURIComponent(fileName)}`;
  }
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://localhost:${port}`);
  response.setHeader("Access-Control-Allow-Origin", "*");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (url.pathname === "/latest.json") {
    const body = localManifest();
    response.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Length": Buffer.byteLength(body),
    });
    response.end(body);
    return;
  }

  if (url.pathname.startsWith("/artifacts/")) {
    const fileName = path.basename(decodeURIComponent(url.pathname));
    const filePath = path.join(platformDir, fileName);
    if (!fs.existsSync(filePath)) {
      response.writeHead(404).end("not found");
      return;
    }
    const stat = fs.statSync(filePath);
    response.writeHead(200, {
      "Content-Type": fileName.endsWith(".tar.gz")
        ? "application/gzip"
        : "application/octet-stream",
      "Content-Length": stat.size,
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
    return;
  }

  response.writeHead(404).end("not found");
});

server.listen(port, () => {
  console.log(`Local updater: http://localhost:${port}/latest.json`);
  console.log(`Serving staged release: ${releaseDir}`);
});
