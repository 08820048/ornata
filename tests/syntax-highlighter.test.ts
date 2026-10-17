import { expect, test } from "bun:test";
import {
  getSyntaxHighlighter,
  LANGUAGE_LABELS,
  highlightCode,
  normalizeSyntaxLanguage,
  SUPPORTED_LANGUAGES,
} from "../src/lib/syntaxHighlighter";

test("normalizes the supported language families and aliases", () => {
  expect(SUPPORTED_LANGUAGES).toHaveLength(28);
  expect(normalizeSyntaxLanguage("Lua")).toBe("lua");
  expect(normalizeSyntaxLanguage("rb")).toBe("ruby");
  expect(normalizeSyntaxLanguage("docker")).toBe("dockerfile");
  expect(normalizeSyntaxLanguage("JSX")).toBe("jsx");
  expect(normalizeSyntaxLanguage("tsx")).toBe("tsx");
  expect(normalizeSyntaxLanguage("c++")).toBe("cpp");
  expect(normalizeSyntaxLanguage("html")).toBe("html");
  expect(normalizeSyntaxLanguage("zsh")).toBe("shellscript");
  expect(normalizeSyntaxLanguage("unknown")).toBeUndefined();
});

test("returns dual-theme Shiki tokens and keeps plain text unstyled", async () => {
  const highlighted = await highlightCode("const answer = 42", "js");
  const firstToken = highlighted?.tokens[0]?.[0];

  expect(firstToken?.htmlStyle).toEqual(
    expect.objectContaining({
      "--shiki-light": expect.any(String),
      "--shiki-dark": expect.any(String),
    }),
  );
  expect((await getSyntaxHighlighter()).getLoadedLanguages()).not.toContain(
    "cpp",
  );
  expect(await highlightCode("hello", "plaintext")).toBeNull();
  expect(await highlightCode("hello", "unknown")).toBeNull();
});

test("loads every advertised syntax grammar", async () => {
  for (const language of SUPPORTED_LANGUAGES) {
    const highlighted = await highlightCode("value", language);
    expect(highlighted === null).toBe(language === "plaintext");
  }
}, 30_000);

test("Lua is highlighted: keywords, strings, and comments get their own colors", async () => {
  const highlighted = await highlightCode('local s = "hi" -- greet\nfunction f() end', "lua");
  const tokens = highlighted!.tokens.flat();
  const colorOf = (text: string) => tokens.find((t) => t.content.trim() === text)?.htmlStyle?.["--shiki-light"];
  expect(colorOf("local")).toBeDefined();
  expect(colorOf("function")).toBe(colorOf("local"));
  expect(colorOf('"hi"')).toBeDefined();
  expect(colorOf('"hi"')).not.toBe(colorOf("local"));
  expect(colorOf("-- greet")).toBeDefined();
});

test("every language has a menu label", () => {
  for (const language of SUPPORTED_LANGUAGES) {
    if (language !== "plaintext") expect(LANGUAGE_LABELS[language]).toBeTruthy();
  }
});
