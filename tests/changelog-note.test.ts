import { expect, test } from "bun:test";
// @ts-expect-error plain JS script
import { parseChangelog, renderEntries, syncNote } from "../scripts/sync-changelog-note.js";

const CHANGELOG = `# Changelog

## [0.2.0] - 2026-08-28

### Added

- One.

### Fixed

- Two.

### Fixed

- Two.
- Three.

## [0.1.5] - 2026-01-01

### Added

- Old.
`;

test("parses versions, merges repeated sections and drops duplicate bullets", () => {
  const [v] = parseChangelog(CHANGELOG);
  expect(v.version).toBe("0.2.0");
  const text = renderEntries([v]);
  expect(text).toContain("### v0.2.0");
  expect(text).toContain("*2026-08-28*");
  expect(text.match(/- Two\./g)).toHaveLength(1);
  expect(text).toContain("- Three.");
});

test("keeps the hand-written block and is idempotent", () => {
  const versions = parseChangelog(CHANGELOG).slice(0, 1);
  const note = "# Log\n### v0.1.9\n- old\n\n---\n";
  const once = syncNote(note, versions);
  expect(once).toContain("### v0.1.9\n- old");
  expect(once).not.toMatch(/---\n\n---/);
  expect(syncNote(once, versions)).toBe(once);
});
