/** One foldable line of a code block: the line whose deeper-indented lines
 *  below it can be hidden. Offsets are into the block's text. */
export interface CodeFold {
  /** Start of the header line (where the gutter arrow sits). */
  lineStart: number;
  /** End of the header line; also what identifies the fold. */
  from: number;
  /** End of the last deeper line; `from..to` is what folding hides. */
  to: number;
  /** How many lines it hides. */
  lines: number;
}

const indentOf = (line: string) => {
  let width = 0;
  for (const ch of line) {
    if (ch === " ") width += 1;
    else if (ch === "\t") width += 4;
    else break;
  }
  return width;
};

/**
 * Indentation-based folds, as most editors do for code in any language: a
 * non-blank line is foldable when the lines after it are indented further.
 * The closing line (`}` at the header's indent) stays visible, and trailing
 * blank lines are left out of the hidden range.
 */
export function foldRanges(text: string): CodeFold[] {
  const lines = text.split("\n");
  const starts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    starts.push(offset);
    offset += line.length + 1;
  }
  const blank = lines.map((line) => line.trim() === "");
  const indent = lines.map(indentOf);

  const folds: CodeFold[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (blank[i]) continue;
    let last = -1;
    for (let j = i + 1; j < lines.length; j += 1) {
      if (blank[j]) continue;
      if (indent[j] <= indent[i]) break;
      last = j;
    }
    if (last > i) {
      folds.push({
        lineStart: starts[i],
        from: starts[i] + lines[i].length,
        to: starts[last] + lines[last].length,
        lines: last - i,
      });
    }
  }
  return folds;
}

/** Collapsing a whole block hides everything after its first line. */
export function collapseRange(text: string): { from: number; to: number; lines: number } | null {
  const newline = text.indexOf("\n");
  if (newline === -1) return null;
  const lines = text.split("\n").length - 1;
  return { from: newline, to: text.length, lines };
}
