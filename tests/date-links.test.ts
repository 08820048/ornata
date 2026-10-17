import { describe, expect, test } from "bun:test";
import { addDays, dailyRel, dateStamp, parseDailyRel } from "../src/lib/dateLinks";

describe("dateLinks", () => {
  test("formats local dates with zero padding", () => {
    expect(dateStamp(new Date(2026, 0, 5))).toBe("2026-01-05");
    expect(dailyRel(new Date(2026, 9, 18))).toBe("journal/2026-10-18.md");
  });

  test("parses daily rels and rejects other paths and impossible dates", () => {
    expect(parseDailyRel("journal/2026-10-18.md")).toEqual(new Date(2026, 9, 18));
    expect(parseDailyRel("Journal/2026-10-18.MD")).toEqual(new Date(2026, 9, 18));
    expect(parseDailyRel("journal/notes.md")).toBeNull();
    expect(parseDailyRel("other/2026-10-18.md")).toBeNull();
    expect(parseDailyRel("journal/2026-02-31.md")).toBeNull();
  });

  test("addDays crosses month and year boundaries", () => {
    expect(dateStamp(addDays(new Date(2026, 11, 31), 1))).toBe("2027-01-01");
    expect(dateStamp(addDays(new Date(2026, 2, 1), -1))).toBe("2026-02-28");
  });
});
