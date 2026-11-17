import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_TYPOGRAPHY,
  normalizeTypography,
  typographyVars,
} from "../src/lib/typography";

describe("note page typography", () => {
  test("the defaults are the values the stylesheet falls back to", () => {
    const css = readFileSync("src/styles.css", "utf8");
    const vars = typographyVars(DEFAULT_TYPOGRAPHY);
    for (const [name, value] of Object.entries(vars)) {
      expect(css).toContain(`var(${name}, ${value})`);
    }
  });

  test("each preset maps to its own values", () => {
    expect(
      typographyVars({ fontSize: "larger", lineWidth: "narrow", lineHeight: "loose" }),
    ).toEqual({ "--note-size": "18px", "--note-width": "760px", "--note-leading": "2" });
  });

  test("missing or unknown choices fall back to the default", () => {
    expect(normalizeTypography(null)).toEqual(DEFAULT_TYPOGRAPHY);
    expect(normalizeTypography({ fontSize: "huge", lineWidth: "narrow" })).toEqual({
      ...DEFAULT_TYPOGRAPHY,
      lineWidth: "narrow",
    });
  });
});
