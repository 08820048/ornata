import { describe, expect, test } from "bun:test";
import { vaultNote } from "../src/lib/noteRef";
import { tabsForBulkClose } from "../src/stores/tabs";

const tabs = ["a.md", "b.md", "c.md", "d.md"].map(vaultNote);

describe("tabsForBulkClose", () => {
  test("returns tabs on either side of the context tab", () => {
    expect(tabsForBulkClose(tabs, tabs[2], "left")).toEqual(tabs.slice(0, 2));
    expect(tabsForBulkClose(tabs, tabs[1], "right")).toEqual(tabs.slice(2));
  });

  test("returns every other tab without closing the context tab", () => {
    expect(tabsForBulkClose(tabs, tabs[1], "others")).toEqual([
      tabs[0],
      tabs[2],
      tabs[3],
    ]);
  });

  test("ignores a tab that is no longer open", () => {
    expect(tabsForBulkClose(tabs, vaultNote("missing.md"), "right")).toEqual(
      [],
    );
  });
});
