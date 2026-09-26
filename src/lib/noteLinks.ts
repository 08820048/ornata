/**
 * Internal page links are stored as ordinary markdown links whose href is a
 * vault-relative note path, e.g. `[Roadmap](projects/roadmap.md)`. That keeps
 * the files plain-markdown and portable while letting the app resolve clicks
 * to open the target note.
 */

/** True if `href` points outside the vault (has a scheme) or is an anchor. */
function isExternal(href: string) {
  return /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("#");
}

/**
 * Resolve a link href to a vault note rel, or null if it isn't an internal
 * note link. Accepts `projects/app.md`, `./app.md`, `/app.md`, `app` (no ext).
 */
export function hrefToRel(href: string | null | undefined): string | null {
  if (!href) return null;
  const trimmed = href.trim();
  if (!trimmed || isExternal(trimmed)) return null;
  let rel = decodeURI(trimmed).split(/[?#]/)[0].replace(/^\.?\//, "");
  if (!rel) return null;
  if (!/\.md$/i.test(rel)) rel += ".md";
  return rel;
}

/** Vault rel → link href (path segments percent-encoded so spaces stay valid). */
export function relToHref(rel: string): string {
  return rel.split("/").map(encodeURIComponent).join("/");
}

/**
 * Resolve a `[[wiki]]` target to a note. Matches by full rel first, then by
 * bare filename anywhere in the vault (wiki-style); falls back to a
 * root-level path if nothing matches, so the link still points somewhere sane.
 */
export function resolveWiki(
  target: string,
  notes: { rel: string }[],
): { rel: string; title: string } {
  const clean = target.trim().replace(/\.md$/i, "");
  const lower = clean.toLowerCase();
  const byRel = notes.find(
    (n) => n.rel.replace(/\.md$/i, "").toLowerCase() === lower,
  );
  const byName = byRel
    ? undefined
    : notes.find(
        (n) =>
          (n.rel.split("/").pop() ?? "").replace(/\.md$/i, "").toLowerCase() ===
          lower,
      );
  const rel = (byRel ?? byName)?.rel ?? `${clean}.md`;
  const title = (rel.split("/").pop() ?? rel).replace(/\.md$/i, "");
  return { rel, title };
}

/**
 * Rewrite `[[target]]` / `[[target|alias]]` wiki links in a markdown string
 * into standard markdown links, resolving targets against `notes`. Keeps files
 * plain-markdown while letting wiki-style syntax render as page links.
 */
export function wikiToMarkdown(
  markdown: string,
  notes: { rel: string }[],
): string {
  return markdown.replace(
    /\[\[([^[\]|]+)(?:\|([^[\]]+))?\]\]/g,
    (_, target: string, alias?: string) => {
      const { rel, title } = resolveWiki(target, notes);
      const text = (alias ?? title).trim();
      return `[${text}](${relToHref(rel)})`;
    },
  );
}

/** One moved entry: `from`/`to` are vault rels (notes end in .md, folders don't). */
export interface LinkRewrite {
  from: string;
  to: string;
}

interface HrefSpan {
  start: number;
  end: number;
  href: string;
}

/** Ranges of inline markdown link hrefs (`](href)`), tolerating nested parens. */
function scanMarkdownHrefs(md: string): HrefSpan[] {
  const spans: HrefSpan[] = [];
  let start = -1;
  let depth = 0;
  for (let i = 0; i < md.length; i += 1) {
    if (md[i] === "]" && md[i + 1] === "(") {
      start = i + 2;
      depth = 1;
      i += 1;
      continue;
    }
    if (start !== -1) {
      if (md[i] === "(") depth += 1;
      else if (md[i] === ")" && (depth -= 1) === 0) {
        spans.push({ start, end: i, href: md.slice(start, i) });
        start = -1;
      }
    }
  }
  return spans;
}

interface WikiSpan {
  start: number;
  end: number;
  /** Target portion (before any `|alias`). */
  target: string;
  targetStart: number;
  targetEnd: number;
}

function scanWikiTargets(md: string): WikiSpan[] {
  const spans: WikiSpan[] = [];
  let open = -1;
  for (let i = 0; i < md.length; i += 1) {
    if (md[i] === "[" && md[i + 1] === "[") {
      open = i;
      i += 1;
      continue;
    }
    if (open !== -1 && md[i] === "]" && md[i + 1] === "]") {
      const inner = md.slice(open + 2, i);
      const bar = inner.indexOf("|");
      const target = bar === -1 ? inner : inner.slice(0, bar);
      spans.push({
        start: open,
        end: i + 2,
        target,
        targetStart: open + 2,
        targetEnd: open + 2 + target.length,
      });
      open = -1;
      i += 1;
    }
  }
  return spans;
}

const stripMd = (rel: string) => rel.replace(/\.md$/i, "");
const basename = (rel: string) => stripMd(rel).split("/").pop() ?? stripMd(rel);

/**
 * Repoint links after a rename/move. `rewrites` come from the backend after it
 * moved the file(s); `notes` is the current tree (used to decide whether a
 * bare `[[name]]` shorthand stays unambiguous). Only the body is touched —
 * frontmatter is preserved verbatim.
 */
export function rewriteLinksInMarkdown(
  markdown: string,
  rewrites: LinkRewrite[],
  notes?: { rel: string }[],
): string {
  if (!rewrites.length) return markdown;
  const { frontmatter, body } = splitNote(markdown);

  const exact = new Map<string, string>();
  const prefixes: [string, string][] = [];
  for (const { from, to } of rewrites) {
    if (/\.md$/i.test(from)) exact.set(from.toLowerCase(), to);
    else prefixes.push([from.replace(/\/+$/, "").toLowerCase(), to]);
  }
  if (!exact.size && !prefixes.length) return markdown;

  const edits: { start: number; end: number; text: string }[] = [];

  for (const { start, end, href } of scanMarkdownHrefs(body)) {
    const trimmed = href.trim();
    if (!trimmed || isExternal(trimmed)) continue;
    // Split the href into `prefix + path + suffix` so only the path moves.
    const prefixMatch = /^\.?\//.exec(trimmed);
    const prefix = prefixMatch?.[0] ?? "";
    const core = trimmed.slice(prefix.length);
    const splitAt = core.search(/[?#]/);
    const rawPath = splitAt === -1 ? core : core.slice(0, splitAt);
    const suffix = splitAt === -1 ? "" : core.slice(splitAt);
    if (!rawPath) continue;
    let path: string;
    try {
      path = decodeURI(rawPath);
    } catch {
      continue;
    }
    const stripped = path.replace(/^\.?\//, "");
    const lowered = stripped.toLowerCase();
    // `exact` keys carry the .md extension (they come from note rels); hrefs
    // may omit it, so normalize before looking up.
    let newRel: string | null = exact.get(`${stripMd(stripped).toLowerCase()}.md`) ?? null;
    if (newRel === null) {
      for (const [dirKey, to] of prefixes) {
        if (lowered.startsWith(`${dirKey}/`)) {
          newRel = to + stripped.slice(dirKey.length);
          break;
        }
      }
    }
    if (newRel === null || newRel === stripped) continue;
    edits.push({
      start,
      end,
      text: prefix + relToHref(newRel) + suffix,
    });
  }

  const oldBasenames = new Set(
    rewrites
      .filter(({ from }) => /\.md$/i.test(from))
      .map(({ from }) => basename(from).toLowerCase()),
  );
  const takenBasenames = new Set(
    (notes ?? []).map(({ rel }) => basename(rel).toLowerCase()),
  );

  for (const span of scanWikiTargets(body)) {
    const clean = stripMd(span.target.trim());
    if (!clean) continue;
    const lowered = clean.toLowerCase();
    let newTarget: string | null = null;
    for (const { from, to } of rewrites) {
      if (/\.md$/i.test(from)) {
        if (lowered === stripMd(from).toLowerCase()) {
          newTarget = stripMd(to);
          break;
        }
      } else {
        const dirKey = from.replace(/\/+$/, "").toLowerCase();
        if (lowered.startsWith(`${dirKey}/`)) {
          newTarget = to + span.target.slice(dirKey.length);
          break;
        }
      }
    }
    // A bare `[[name]]` shorthand keeps working through the rename only when
    // no surviving note still claims the old basename.
    if (
      newTarget === null &&
      notes &&
      oldBasenames.has(lowered) &&
      !takenBasenames.has(lowered)
    ) {
      const owner = rewrites.find(
        ({ from }) => basename(from).toLowerCase() === lowered,
      );
      if (owner) newTarget = basename(owner.to);
    }
    if (newTarget === null || newTarget === span.target) continue;
    edits.push({
      start: span.targetStart,
      end: span.targetEnd,
      text: newTarget,
    });
  }

  if (!edits.length) return markdown;
  edits.sort((a, b) => b.start - a.start);
  let out = body;
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end);
  }
  return frontmatter + out;
}

/** Local copy of the frontmatter split so this module stays dependency-free. */
function splitNote(markdown: string): { frontmatter: string; body: string } {
  const match = /^---[ \t]*\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(markdown);
  if (!match) return { frontmatter: "", body: markdown };
  return { frontmatter: match[0], body: markdown.slice(match[0].length) };
}
