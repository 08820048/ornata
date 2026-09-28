import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createReadToolDefinition } from "@earendil-works/pi-coding-agent";
import { VaultGuard } from "../agent-sidecar/vaultGuard";

function fixture() {
  const base = mkdtempSync(path.join(tmpdir(), "ornata-guard-"));
  const vault = path.join(base, "vault");
  mkdirSync(path.join(vault, "notes"), { recursive: true });
  writeFileSync(path.join(vault, "notes", "a.md"), "# inside");
  writeFileSync(path.join(base, "secret.txt"), "TOP SECRET");
  symlinkSync(path.join(base, "secret.txt"), path.join(vault, "notes", "link.md"));
  symlinkSync(base, path.join(vault, "escape-dir"));
  return { base, vault };
}

test("guard allows the vault and refuses everything that leaves it", () => {
  const { base, vault } = fixture();
  const guard = new VaultGuard(vault);
  expect(guard.resolve("notes/a.md")).toBe(path.join(vault, "notes/a.md"));
  expect(guard.resolve(undefined)).toBe(vault);
  expect(guard.resolve("notes/new-file.md")).toBe(path.join(vault, "notes/new-file.md"));
  for (const bad of ["../secret.txt", path.join(base, "secret.txt"), "/etc/passwd", "~/.ssh/id_rsa", "~", "notes/link.md", "escape-dir/secret.txt", "escape-dir"]) {
    expect(() => guard.resolve(bad), bad).toThrow(/outside the vault/);
  }
  for (const bad of ["../**", "/etc/*", "~/.ssh/*", "notes/../../**"]) {
    expect(() => guard.checkPattern(bad), bad).toThrow(/outside the vault/);
  }
  expect(() => guard.checkPattern("**/*.md")).not.toThrow();
});

test("wrapped Pi read tool reads the vault but not a secret next to it", async () => {
  const { base, vault } = fixture();
  const guard = new VaultGuard(vault);
  const read = createReadToolDefinition(vault);
  const confined = (params: { path: string }) => {
    guard.resolve(params.path);
    return read.execute("t1", params as never, undefined, undefined as never, undefined as never);
  };
  const ok = await confined({ path: "notes/a.md" });
  expect(JSON.stringify(ok.content)).toContain("# inside");
  // Sanity: the unwrapped tool really would have leaked it.
  const leaked = await read.execute("t2", { path: path.join(base, "secret.txt") } as never, undefined, undefined as never, undefined as never);
  expect(JSON.stringify(leaked.content)).toContain("TOP SECRET");
  expect(() => confined({ path: path.join(base, "secret.txt") })).toThrow(/outside the vault/);
  expect(() => confined({ path: "notes/link.md" })).toThrow(/outside the vault/);
});
