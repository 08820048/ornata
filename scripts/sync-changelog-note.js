#!/usr/bin/env bun
// Mirror CHANGELOG.md into the "Ornata 更新日志" note in the maintainer's Ornata vault.
//
// The note's hand-written v0.1.x entries (the pre-0.2 app) stay as they are; every version
// from 0.2.0 on is regenerated from CHANGELOG.md, oldest first, so running this after each
// release (or any CHANGELOG edit) keeps the note current. It is idempotent.
//
// Usage: bun scripts/sync-changelog-note.js [path-to-note]   (or ORNATA_CHANGELOG_NOTE)
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const notePath =
  process.argv[2] ||
  process.env.ORNATA_CHANGELOG_NOTE ||
  join(homedir(), "Documents/notes/10-项目/产品/Ornata/Ornata 更新日志.md");

/** Versions in CHANGELOG.md as { version, date, sections: [{ title, items }] }, newest first. */
export function parseChangelog(text) {
  const versions = [];
  let version = null;
  let section = null;
  for (const line of text.split("\n")) {
    const header = /^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})/.exec(line);
    if (header) {
      version = { version: header[1], date: header[2], sections: [] };
      versions.push(version);
      section = null;
    } else if (version && /^### /.test(line)) {
      section = { title: line.slice(4).trim(), items: [] };
      version.sections.push(section);
    } else if (section && /^- /.test(line)) {
      const item = line.slice(2).trim();
      if (!section.items.includes(item)) section.items.push(item);
    } else if (section && /^\s+\S/.test(line) && section.items.length) {
      section.items[section.items.length - 1] += ` ${line.trim()}`;
    }
  }
  return versions;
}

/** The note body for versions 0.2.0+, oldest first, in the note's `### vX` / `---` style. */
export function renderEntries(versions) {
  const entries = [...versions].reverse().map((v) => {
    // Sections that repeat within one version are merged.
    const merged = new Map();
    for (const s of v.sections) {
      const items = merged.get(s.title) ?? [];
      for (const item of s.items) if (!items.includes(item)) items.push(item);
      merged.set(s.title, items);
    }
    const body = [...merged.entries()]
      .filter(([, items]) => items.length)
      .map(([title, items]) => `**${title}**\n\n${items.map((i) => `- ${i}`).join("\n")}`)
      .join("\n\n");
    return `### v${v.version}\n\n*${v.date}*\n\n${body}`;
  });
  return entries.join("\n\n---\n\n");
}

/** Replace everything after the hand-written v0.1.x block with freshly rendered entries. */
export function syncNote(note, versions) {
  const marker = "### v0.2.0";
  const cut = note.indexOf(marker);
  if (cut < 0 && note.indexOf("### v0.1.9") < 0) throw new Error("note has no v0.1.9 block to continue from");
  // Keep the hand-written part, with exactly one divider before the generated entries.
  const kept = (cut >= 0 ? note.slice(0, cut) : note).trimEnd().replace(/(\s*\n---)+$/, "");
  return `${kept}\n\n---\n\n${renderEntries(versions)}\n`;
}

if (import.meta.main) {
  if (!existsSync(notePath)) {
    console.error(`Note not found: ${notePath}`);
    process.exit(1);
  }
  const versions = parseChangelog(readFileSync(join(root, "CHANGELOG.md"), "utf8")).filter(
    (v) => v.version !== "0.1.9" && v.version.split(".").slice(0, 2).join(".") !== "0.1",
  );
  const before = readFileSync(notePath, "utf8");
  const after = syncNote(before, versions);
  if (after === before) console.log("Already up to date.");
  else {
    writeFileSync(notePath, after);
    console.log(`Synced ${versions.length} versions (latest ${versions[0].version}) into ${notePath}`);
  }
}
