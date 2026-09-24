import { hrefToRel } from "./noteLinks";

/**
 * A markdown line reduced to what a reader sees: plain text plus links shown
 * by their label (never their percent-encoded href). `self` marks links that
 * point at the note the snippet is shown under, so they can be highlighted.
 */
export type InlinePart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; self: boolean }
  | { kind: "mark"; text: string };

/** The line as plain text — what the editor shows for it. */
export function plainText(parts: InlinePart[]) {
  return parts.map((part) => part.text).join("");
}

/** Split plain-text parts so every case-insensitive `term` becomes a mark. */
export function markTerm(parts: InlinePart[], term: string): InlinePart[] {
  const needle = term.toLowerCase();
  if (!needle) return parts;
  return parts.flatMap((part) => {
    if (part.kind !== "text") return [part];
    const out: InlinePart[] = [];
    const lower = part.text.toLowerCase();
    let from = 0;
    for (let at = lower.indexOf(needle); at !== -1; at = lower.indexOf(needle, from)) {
      if (at > from) out.push({ kind: "text", text: part.text.slice(from, at) });
      out.push({ kind: "mark", text: part.text.slice(at, at + needle.length) });
      from = at + needle.length;
    }
    if (from < part.text.length) out.push({ kind: "text", text: part.text.slice(from) });
    return out;
  });
}

const LEADING_MARKERS = /^(?:[-*+]\s+|\d+[.)]\s+)?(?:\[[ xX]\]\s+)?/;
const EMPHASIS = /\*\*|__|~~|`/g;

/** Parse one markdown line for display in a backlink snippet. */
export function parseInline(line: string, selfRel: string): InlinePart[] {
  const self = normalize(selfRel);
  const selfName = self.split("/").pop() ?? self;
  const source = line.trim().replace(LEADING_MARKERS, "");
  const parts: InlinePart[] = [];
  let text = "";
  const flush = () => {
    if (text) parts.push({ kind: "text", text: clean(text) });
    text = "";
  };

  let i = 0;
  while (i < source.length) {
    if (source.startsWith("[[", i)) {
      const end = source.indexOf("]]", i + 2);
      if (end !== -1) {
        const [target, alias] = source.slice(i + 2, end).split("|", 2);
        const name = normalize(target);
        flush();
        parts.push({
          kind: "link",
          text: clean(alias ?? target.split("/").pop() ?? target).trim(),
          self: name === self || name === selfName,
        });
        i = end + 2;
        continue;
      }
    }
    const image = source.startsWith("![", i);
    if (image || source[i] === "[") {
      const link = matchLink(source, image ? i + 1 : i);
      if (link) {
        flush();
        // Images contribute their alt text only.
        if (image) text += link.label;
        else {
          const rel = safeHrefToRel(link.href);
          parts.push({
            kind: "link",
            text: clean(link.label).trim() || titleOf(rel ?? link.href),
            self: rel !== null && normalize(rel) === self,
          });
        }
        i = link.end;
        continue;
      }
    }
    text += source[i];
    i += 1;
  }
  flush();
  return parts.filter((part) => part.text.length > 0);
}

/** `[label](href)` starting at `start` (the `[`), with nested brackets/parens. */
function matchLink(source: string, start: number) {
  const labelEnd = closing(source, start, "[", "]");
  if (labelEnd === -1 || source[labelEnd + 1] !== "(") return null;
  const hrefEnd = closing(source, labelEnd + 1, "(", ")");
  if (hrefEnd === -1) return null;
  const href = source.slice(labelEnd + 2, hrefEnd).trim().split(/\s+/)[0] ?? "";
  return {
    label: source.slice(start + 1, labelEnd),
    href: href.replace(/^<|>$/g, ""),
    end: hrefEnd + 1,
  };
}

function closing(source: string, open: number, left: string, right: string) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === left) depth += 1;
    else if (source[i] === right && --depth === 0) return i;
  }
  return -1;
}

function safeHrefToRel(href: string) {
  try {
    return hrefToRel(href);
  } catch {
    // Malformed percent-escapes make decodeURI throw.
    return null;
  }
}

function normalize(rel: string) {
  return rel.trim().replace(/\.md$/i, "").toLowerCase();
}

function titleOf(rel: string) {
  return (rel.split("/").pop() ?? rel).replace(/\.md$/i, "");
}

function clean(text: string) {
  return text.replace(EMPHASIS, "").replace(/\s+/g, " ");
}
