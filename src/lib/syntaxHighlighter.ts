import { createHighlighterCore, type LanguageInput } from "shiki/core";
import { createJavaScriptRegexEngine } from "shiki/engine/javascript";

export const SHIKI_THEMES = {
  light: "github-light",
  dark: "github-dark",
} as const;

export const SUPPORTED_LANGUAGES = [
  "bash",
  "c",
  "cpp",
  "csharp",
  "css",
  "diff",
  "go",
  "java",
  "javascript",
  "json",
  "kotlin",
  "markdown",
  "plaintext",
  "python",
  "rust",
  "sql",
  "swift",
  "typescript",
  "xml",
  "yaml",
] as const;

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: "shellscript",
  sh: "shellscript",
  shell: "shellscript",
  zsh: "shellscript",
  c: "c",
  h: "c",
  cpp: "cpp",
  cc: "cpp",
  "c++": "cpp",
  "h++": "cpp",
  hh: "cpp",
  hpp: "cpp",
  hxx: "cpp",
  cxx: "cpp",
  csharp: "csharp",
  cs: "csharp",
  "c#": "csharp",
  css: "css",
  diff: "diff",
  patch: "diff",
  go: "go",
  golang: "go",
  java: "java",
  jsp: "java",
  javascript: "javascript",
  js: "javascript",
  jsx: "jsx",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsonc: "jsonc",
  kotlin: "kotlin",
  kt: "kotlin",
  kts: "kotlin",
  markdown: "markdown",
  md: "markdown",
  mkdown: "markdown",
  mkd: "markdown",
  plaintext: "plaintext",
  text: "plaintext",
  txt: "plaintext",
  python: "python",
  py: "python",
  gyp: "python",
  ipython: "python",
  rust: "rust",
  rs: "rust",
  sql: "sql",
  swift: "swift",
  typescript: "typescript",
  ts: "typescript",
  tsx: "tsx",
  mts: "typescript",
  cts: "typescript",
  xml: "xml",
  html: "html",
  xhtml: "html",
  svg: "html",
  rss: "xml",
  atom: "xml",
  xjb: "xml",
  xsd: "xml",
  xsl: "xml",
  plist: "xml",
  wsf: "xml",
  yaml: "yaml",
  yml: "yaml",
};

const LANGUAGE_LOADERS = {
  shellscript: () => import("@shikijs/langs/shellscript"),
  c: () => import("@shikijs/langs/c"),
  cpp: () => import("@shikijs/langs/cpp"),
  csharp: () => import("@shikijs/langs/csharp"),
  css: () => import("@shikijs/langs/css"),
  diff: () => import("@shikijs/langs/diff"),
  go: () => import("@shikijs/langs/go"),
  java: () => import("@shikijs/langs/java"),
  javascript: () => import("@shikijs/langs/javascript"),
  jsx: () => import("@shikijs/langs/jsx"),
  json: () => import("@shikijs/langs/json"),
  jsonc: () => import("@shikijs/langs/jsonc"),
  kotlin: () => import("@shikijs/langs/kotlin"),
  markdown: () => import("@shikijs/langs/markdown"),
  python: () => import("@shikijs/langs/python"),
  rust: () => import("@shikijs/langs/rust"),
  sql: () => import("@shikijs/langs/sql"),
  swift: () => import("@shikijs/langs/swift"),
  typescript: () => import("@shikijs/langs/typescript"),
  tsx: () => import("@shikijs/langs/tsx"),
  xml: () => import("@shikijs/langs/xml"),
  html: () => import("@shikijs/langs/html"),
  yaml: () => import("@shikijs/langs/yaml"),
} satisfies Record<string, LanguageInput>;

let highlighterPromise: ReturnType<typeof createHighlighterCore> | undefined;
const languagePromises = new Map<string, Promise<void>>();
const loadedLanguages = new Set<string>();

export function normalizeSyntaxLanguage(language?: string | null) {
  return LANGUAGE_ALIASES[language?.trim().toLowerCase() ?? ""];
}

export function getSyntaxHighlighter() {
  return (highlighterPromise ??= createHighlighterCore({
    engine: createJavaScriptRegexEngine(),
    themes: [
      import("@shikijs/themes/github-light"),
      import("@shikijs/themes/github-dark"),
    ],
    langs: [],
  }));
}

export function isSyntaxLanguageLoaded(language: string) {
  return loadedLanguages.has(language);
}

export async function loadSyntaxLanguage(language: string) {
  const highlighter = await getSyntaxHighlighter();
  if (highlighter.getLoadedLanguages().includes(language)) {
    loadedLanguages.add(language);
    return highlighter;
  }

  const loader = LANGUAGE_LOADERS[language as keyof typeof LANGUAGE_LOADERS];
  if (!loader) return highlighter;

  let promise = languagePromises.get(language);
  if (!promise) {
    promise = highlighter.loadLanguage(loader);
    languagePromises.set(language, promise);
  }
  await promise;
  loadedLanguages.add(language);
  return highlighter;
}

export async function highlightCode(code: string, language?: string | null) {
  const lang = normalizeSyntaxLanguage(language);
  if (!lang || lang === "plaintext") return null;

  const highlighter = await loadSyntaxLanguage(lang);
  return highlighter.codeToTokens(code, {
    lang,
    themes: SHIKI_THEMES,
    defaultColor: false,
  });
}
