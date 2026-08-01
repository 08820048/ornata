import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const binaries = join(root, "src-tauri", "binaries");
const host = process.env.ORNATA_SIDECAR_TARGET ?? Bun.spawnSync(["rustc", "-vV"])
  .stdout.toString()
  .split("\n")
  .find((line) => line.startsWith("host: "))
  ?.slice(6)
  .trim();

if (!host) throw new Error("Could not determine Rust host target");

await mkdir(binaries, { recursive: true });
const output = join(binaries, `ornata-agent-${host}`);
await rm(output, { force: true });

const result = await Bun.build({
  entrypoints: [join(root, "agent-sidecar", "index.ts")],
  compile: { outfile: output },
  target: "bun",
  minify: true,
  sourcemap: "none",
});

if (!result.success) {
  for (const log of result.logs) console.error(log);
  throw new Error("Failed to build Ornata agent sidecar");
}

console.log(`Built ${output}`);
