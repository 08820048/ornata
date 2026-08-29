import { expect, test } from "bun:test";
import {
  getSyntaxHighlighter,
  highlightCode,
  normalizeSyntaxLanguage,
  SUPPORTED_LANGUAGES,
} from "../src/lib/syntaxHighlighter";

test("normalizes the supported language families and aliases", () => {
  expect(SUPPORTED_LANGUAGES).toHaveLength(20);
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
});
