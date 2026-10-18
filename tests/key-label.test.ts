import { expect, test } from "bun:test";
import { keyLabel } from "../src/lib/utils";

test("Mac symbols stay on a Mac", () => {
  expect(keyLabel("⌘⇧F", true)).toBe("⌘⇧F");
});

test("other platforms get named modifiers", () => {
  expect(keyLabel("⌘⇧F", false)).toBe("Ctrl+Shift+F");
  expect(keyLabel("⌘,", false)).toBe("Ctrl+,");
  expect(keyLabel("⌥", false)).toBe("Alt");
  expect(keyLabel("Toggle sidebar ⌘\\", false)).toBe("Toggle sidebar Ctrl+\\");
});
