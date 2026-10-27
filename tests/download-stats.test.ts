import { expect, test } from "bun:test";
import { classify, clientClass, clientInfo, dayKey, deviceId, startsAtBeginning } from "../workers/download-stats/src/classify";

const P = "/products/ornata-markd";

test("the updater's check, installers and update bundles are told apart", () => {
  expect(classify(`${P}/channels/stable/latest.json`)).toEqual({ kind: "update_check", version: "", platform: "", file: "stable" });
  expect(classify(`${P}/releases/0.12.1/darwin-aarch64/Ornata_0.12.1_aarch64.dmg`)).toEqual({
    kind: "download", version: "0.12.1", platform: "darwin-aarch64", file: "Ornata_0.12.1_aarch64.dmg",
  });
  expect(classify(`${P}/releases/0.12.1/windows-x86_64/Ornata_0.12.1_x64-setup.exe`).kind).toBe("download");
  expect(classify(`${P}/releases/0.12.1/darwin-aarch64/Ornata.app.tar.gz`).kind).toBe("update_download");
  expect(classify(`${P}/releases/0.12.1/darwin-aarch64/Ornata.app.tar.gz.sig`).kind).toBe("other");
});

test("paths that are not releases, or are made up, are not counted and cannot add new labels", () => {
  expect(classify("/robots.txt").kind).toBe("other");
  expect(classify(`${P}/releases/latest/darwin-aarch64/x.dmg`)).toEqual({ kind: "other", version: "", platform: "", file: "" });
  expect(classify(`${P}/releases/0.12.1/plan9-mips/x.dmg`).kind).toBe("other");
  expect(classify(`${P}/channels/${"a".repeat(50)}/latest.json`).file).toBe("?");
  expect(classify(`${P}/releases/0.12.1/darwin-aarch64/${"x".repeat(200)}.dmg`).file.length).toBe(80);
});

test("only the start of a download counts, so resuming does not add a download", () => {
  expect(startsAtBeginning(null)).toBe(true);
  expect(startsAtBeginning("bytes=0-")).toBe(true);
  expect(startsAtBeginning("bytes=0-1023")).toBe(true);
  expect(startsAtBeginning("bytes=5000-")).toBe(false);
  expect(startsAtBeginning("bytes=-500")).toBe(false);
});

test("clients are only sorted into bot, browser or app", () => {
  expect(clientClass("Mozilla/5.0 (Macintosh) AppleWebKit Safari")).toBe("browser");
  expect(clientClass("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe("bot");
  expect(clientClass("curl/8.4.0")).toBe("bot");
  expect(clientClass(null)).toBe("app");
  expect(clientClass("tauri-plugin-updater/2")).toBe("app");
});

test("a device is the same within a day, differs across days and secrets, and is empty without either input", async () => {
  const a = await deviceId("1.2.3.4", "2026-10-27", "s");
  expect(a).toMatch(/^[0-9a-f]{16}$/);
  expect(await deviceId("1.2.3.4", "2026-10-27", "s")).toBe(a);
  expect(await deviceId("1.2.3.4", "2026-10-28", "s")).not.toBe(a);
  expect(await deviceId("1.2.3.4", "2026-10-27", "other")).not.toBe(a);
  expect(await deviceId("1.2.3.5", "2026-10-27", "s")).not.toBe(a);
  expect(await deviceId("1.2.3.4", "2026-10-27", undefined)).toBe("");
  expect(await deviceId(null, "2026-10-27", "s")).toBe("");
  expect(dayKey(new Date("2026-10-27T23:59:59Z"))).toBe("2026-10-27");
});

test("an update check reports the app's version and system, and nothing else is accepted", () => {
  expect(clientInfo(new URLSearchParams("v=0.12.2&t=darwin-aarch64"))).toEqual({ version: "0.12.2", target: "darwin-aarch64" });
  expect(clientInfo(new URLSearchParams(""))).toEqual({ version: "", target: "" });
  expect(clientInfo(new URLSearchParams("v=<script>&t=plan9"))).toEqual({ version: "", target: "" });
  expect(clientInfo(new URLSearchParams("v=1.0.0-beta.1&t=windows-x86_64"))).toEqual({ version: "1.0.0-beta.1", target: "windows-x86_64" });
});
