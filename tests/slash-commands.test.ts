import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { CODE_BLOCK_VARIANTS, SUPPORTED_LANGUAGES } from "../src/lib/syntaxHighlighter";

// The menu module reaches the locale store, which needs a DOM on import.
let blockCommands: typeof import("../src/components/editor/SlashMenu").blockCommands;
let filterSlashCommands: typeof import("../src/components/editor/SlashMenu").filterSlashCommands;
beforeAll(async () => {
  GlobalRegistrator.register();
  ({ blockCommands, filterSlashCommands } = await import("../src/components/editor/SlashMenu"));
});
afterAll(async () => {
  await GlobalRegistrator.unregister();
});

const t = (key: string) => key.replace("slash.", "");
const ids = (query: string) => filterSlashCommands(blockCommands, query, t).map((c) => c.id);

describe("slash menu", () => {
  test("the bare menu offers one code block, not twenty-eight", () => {
    const bare = ids("");
    expect(bare).toContain("code");
    expect(bare).toContain("h1");
    expect(bare.filter((id) => id.startsWith("code-"))).toEqual([]);
  });

  test("/code lists the plain block and every language, Mermaid included", () => {
    const found = ids("code");
    expect(found).toContain("code");
    expect(found).toContain("code-lua");
    expect(found).toContain("code-mermaid");
    const languages = SUPPORTED_LANGUAGES.filter((l) => l !== "plaintext");
    for (const language of languages) expect(found).toContain(`code-${language}`);
    expect(found).toHaveLength(CODE_BLOCK_VARIANTS.length);
  });

  test("a language name finds just its block", () => {
    expect(ids("lua")).toEqual(["code-lua"]);
    expect(ids("c++")).toEqual(["code-cpp"]);
    expect(ids("mermaid")).toEqual(["code-mermaid"]);
    expect(ids("zzz")).toEqual([]);
  });

  test("entries show what typing at a line's start would do", () => {
    const shortcut = (id: string) => blockCommands.find((c) => c.id === id)?.shortcut;
    expect(shortcut("h1")).toBe("#");
    expect(shortcut("h2")).toBe("##");
    expect(shortcut("bullet")).toBe("-");
    expect(shortcut("task")).toBe("*");
    expect(shortcut("quote")).toBe(">");
  });
});
