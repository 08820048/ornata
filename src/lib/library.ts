import type { TreeNode } from "@/lib/types";

/** The entries of folder `rel` ("" = top level), or null when it is gone. */
export function folderAt(tree: TreeNode[], rel: string): TreeNode[] | null {
  if (!rel) return tree;
  let layer = tree;
  let path = "";
  for (const part of rel.split("/")) {
    path = path ? `${path}/${part}` : part;
    const next = layer.find((node) => node.kind === "folder" && node.rel === path);
    if (!next) return null;
    layer = next.children ?? [];
  }
  return layer;
}

/** `rel` as the chain of folders leading to it, outermost first. */
export function crumbsOf(rel: string): { name: string; rel: string }[] {
  if (!rel) return [];
  const parts = rel.split("/");
  return parts.map((name, index) => ({ name, rel: parts.slice(0, index + 1).join("/") }));
}

/**
 * The notes a folder card shows as its sheets: its own notes, most recently
 * edited first; a folder holding only subfolders borrows from inside them.
 */
export function coverNotes(folder: TreeNode, max = 3): TreeNode[] {
  const own = (folder.children ?? []).filter((node) => node.kind === "note");
  const pool = own.length ? own : descendants(folder, max);
  return [...pool].sort((a, b) => b.modifiedMs - a.modifiedMs).slice(0, max);
}

function descendants(folder: TreeNode, max: number, out: TreeNode[] = []): TreeNode[] {
  for (const node of folder.children ?? []) {
    if (out.length >= max) break;
    if (node.kind === "note") out.push(node);
    else descendants(node, max, out);
  }
  return out;
}

export type ItemMarker = "bullet" | "number" | "todo" | "doing" | "done" | "canceled";

/** A note's opening, reduced to what a thumbnail can show. */
export type PreviewBlock =
  | { kind: "heading"; level: number; text: string }
  | { kind: "text"; text: string }
  | { kind: "item"; marker: ItemMarker; label: string; depth: number; text: string }
  | { kind: "quote"; text: string }
  | { kind: "code"; lang: string; lines: string[] }
  | { kind: "table"; rows: string[][] }
  | { kind: "image"; src: string }
  | { kind: "rule" };

type OpenBlock = Extract<PreviewBlock, { kind: "item" | "quote" }>;

const BOX: Record<string, ItemMarker> = {
  " ": "todo",
  "/": "doing",
  x: "done",
  X: "done",
  "-": "canceled",
};

/** A markdown line as the words a reader sees. */
export function plainInline(line: string): string {
  return line
    // footnote definitions and markers: the number is drawn by the editor
    .replace(/^\[\^[^\]\s]+\]:\s*/, "")
    .replace(/\[\^[^\]\s]+\]/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/\*\*|__|~~|`/g, "")
    .replace(/&(amp|lt|gt|quot|nbsp|#39);/g, (_, name: string) => ENTITIES[name])
    .trim();
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  nbsp: " ",
  "#39": "'",
};

/**
 * Parse the head of a note into thumbnail blocks. A leading `# Title` that
 * only repeats the note's title is dropped — the card already shows it.
 */
export function previewBlocks(markdown: string, title: string, max = 26): PreviewBlock[] {
  const blocks: PreviewBlock[] = [];
  const lines = markdown.split(/\r?\n/);
  let paragraph: string[] = [];
  // The previous line belonged to a list item or quote, which a plain line continues.
  let open: OpenBlock | null = null;
  const flush = () => {
    const text = plainInline(paragraph.join(" "));
    if (text) blocks.push({ kind: "text", text });
    paragraph = [];
  };

  for (let index = 0; index < lines.length && blocks.length < max; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    const continued: OpenBlock | null = open;
    open = null;

    const fence = /^(```|~~~)\s*([\w+#-]*)/.exec(trimmed);
    if (fence) {
      flush();
      const code: string[] = [];
      for (index += 1; index < lines.length && !lines[index].trim().startsWith(fence[1]); index += 1) {
        if (code.length < 24) code.push(lines[index]);
      }
      blocks.push({ kind: "code", lang: fence[2], lines: code });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      flush();
      const text = plainInline(heading[2]);
      const repeatsTitle = blocks.length === 0 && heading[1].length === 1 && text === title.trim();
      if (text && !repeatsTitle) blocks.push({ kind: "heading", level: heading[1].length, text });
      continue;
    }
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ kind: "rule" });
      continue;
    }
    if (trimmed.startsWith("|")) {
      flush();
      const rows: string[][] = [];
      for (; index < lines.length && lines[index].trim().startsWith("|"); index += 1) {
        const cells = lines[index].trim().replace(/^\||\|$/g, "").split("|").map(plainInline);
        if (!cells.every((cell) => /^:?-*:?$/.test(cell)) && rows.length < 7) rows.push(cells);
      }
      index -= 1;
      if (rows.length) blocks.push({ kind: "table", rows });
      continue;
    }
    const item = /^(\s*)(?:([-*+])|(\d+)[.)])\s+(?:\[([ xX/-])\]\s+)?(.*)$/.exec(line);
    if (item) {
      flush();
      const marker: ItemMarker = item[4] !== undefined ? BOX[item[4]] : item[3] ? "number" : "bullet";
      open = {
        kind: "item",
        marker,
        label: item[3] ?? "",
        depth: Math.min(3, Math.floor(item[1].replace(/\t/g, "  ").length / 2)),
        text: plainInline(item[5]),
      };
      blocks.push(open);
      continue;
    }
    if (trimmed.startsWith(">")) {
      flush();
      const text = plainInline(trimmed.replace(/^>+\s?/, "").replace(/^\[![a-zA-Z]+\]\s*/, ""));
      if (continued?.kind === "quote") {
        continued.text = `${continued.text} ${text}`.trim();
        open = continued;
      } else if (text) {
        open = { kind: "quote", text };
        blocks.push(open);
      }
      continue;
    }
    const image =
      /^!\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)$/.exec(trimmed) ??
      /^<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(trimmed);
    if (image) {
      flush();
      blocks.push({ kind: "image", src: image[1] });
      continue;
    }
    if (continued) {
      // A hard-wrapped item or quote: the line carries on the block above.
      continued.text = `${continued.text} ${plainInline(trimmed)}`.trim();
      open = continued;
      continue;
    }
    paragraph.push(trimmed);
  }
  if (blocks.length < max) flush();
  return blocks;
}

/** Every folder of the vault, depth-first, for the "Move to" list. */
export function allFolders(tree: TreeNode[], out: TreeNode[] = []): TreeNode[] {
  for (const node of tree) {
    if (node.kind !== "folder") continue;
    out.push(node);
    allFolders(node.children ?? [], out);
  }
  return out;
}

/** The folder holding `rel` ("" at the top level). */
export function parentOf(rel: string): string {
  const cut = rel.lastIndexOf("/");
  return cut === -1 ? "" : rel.slice(0, cut);
}

/* ---- Card geometry -------------------------------------------------------
   The numbers below follow quiet.md's home grid (MIT): a note card is 5:6 at
   its column's width, a folder stands taller by its tab, papers are 80% × 64%
   of the folder, and the frosted front steps down from a raised left part. */

/** The tab's share of a folder card's height. */
export const FOLDER_TAB = 0.06;

export interface GridLayout {
  cols: number;
  gap: number;
  colWidth: number;
  /** A note card's height. */
  noteHeight: number;
  /** A row's height: a folder's, when the level holds folders. */
  rowHeight: number;
}

/**
 * Columns for `avail` px of width. Wide panes get at least four columns of
 * 240px or more; narrow ones up to three of 160px or more. A level holding
 * folders gets more air, since folders spill past their cell on hover.
 */
export function gridLayout(avail: number, mixed: boolean): GridLayout {
  const gap = mixed ? 24 : 16;
  const fit = (min: number) => Math.floor((avail + gap) / (min + gap));
  const cols = fit(200) >= 4 ? Math.max(4, fit(240)) : Math.min(3, Math.max(1, fit(160)));
  const colWidth = Math.max(1, (avail - gap * (cols - 1)) / cols);
  const noteHeight = colWidth * (6 / 5);
  return {
    cols,
    gap,
    colWidth,
    noteHeight,
    rowHeight: mixed ? noteHeight / (1 - FOLDER_TAB) : noteHeight,
  };
}

const R = 18;
const n = (value: number) => Math.round(value * 100) / 100;

/** The folder's back: a plate with a tab on its top-left. */
export function backPlatePath(w: number, h: number): string {
  const top = FOLDER_TAB * h;
  const tab = 0.4 * w;
  return [
    `M0 ${n(h - R)}`,
    `L0 ${R}`,
    `Q0 0 ${R} 0`,
    `L${n(tab - 22)} 0`,
    `C${n(tab - 6)} 0 ${n(tab - 2)} ${n(top)} ${n(tab + 14)} ${n(top)}`,
    `L${n(w - R)} ${n(top)}`,
    `Q${n(w)} ${n(top)} ${n(w)} ${n(top + R)}`,
    `L${n(w)} ${n(h - R)}`,
    `Q${n(w)} ${n(h)} ${n(w - R)} ${n(h)}`,
    `L${R} ${n(h)}`,
    `Q0 ${n(h)} 0 ${n(h - R)}`,
    "Z",
  ].join("");
}

/**
 * The frosted front at hover progress `open` (0–1, may overshoot): its top
 * edge alone (`edge`, for the lit rim) and the closed sheet (`sheet`). Opening
 * leans it back — the top drops and its corners reach outward.
 */
export function glassPath(w: number, h: number, open: number): { edge: string; sheet: string } {
  const lean = 0.03 * h * open;
  const yl = 0.49 * h + lean;
  const yr = 0.54 * h + lean;
  const i = -3 * open;
  const step = 0.44 * w;
  const edge = [
    `M${n(i)} ${n(yl + R)}`,
    `Q${n(i)} ${n(yl)} ${n(i + R)} ${n(yl)}`,
    `L${n(step - 16)} ${n(yl)}`,
    `C${n(step + 6)} ${n(yl)} ${n(step + 6)} ${n(yr)} ${n(step + 26)} ${n(yr)}`,
    `L${n(w - i - R)} ${n(yr)}`,
    `Q${n(w - i)} ${n(yr)} ${n(w - i)} ${n(yr + R)}`,
  ].join("");
  const rest = [
    `L${n(w)} ${n(h - R)}`,
    `Q${n(w)} ${n(h)} ${n(w - R)} ${n(h)}`,
    `L${R} ${n(h)}`,
    `Q0 ${n(h)} 0 ${n(h - R)}`,
    "Z",
  ].join("");
  return { edge, sheet: edge + rest };
}

/** [dx, top, tilt°] of each paper at rest, and how far hover moves it. */
const PAPERS: { rest: [number, number, number]; rise: [number, number, number] }[] = [
  { rest: [0, 0.16, 0], rise: [0, -0.07, 0] },
  { rest: [0.03, 0.135, 2.5], rise: [0.03, -0.055, 2] },
  { rest: [-0.035, 0.115, -3], rise: [-0.03, -0.05, -2.5] },
];

/** Springs of the three papers: the back ones are softer, so they follow the front. */
export const PAPER_SPRINGS = [
  { stiffness: 320, damping: 21 },
  { stiffness: 230, damping: 18 },
  { stiffness: 170, damping: 15.5 },
] as const;

export const PAPER_SIZE = { w: 0.8, h: 0.64 } as const;

/** Paper `index` (0 = front) at rise `r`: offset from its resting box, and tilt. */
export function paperPose(index: number, r: number, w: number, h: number) {
  const { rest, rise } = PAPERS[index];
  return {
    x: (rest[0] + rise[0] * r) * w,
    y: (rest[1] + rise[1] * r) * h,
    rotate: rest[2] + rise[2] * r,
  };
}

/**
 * Lines of "text" for a paper behind the front one: a heading bar, then rows
 * of varying length, the same for a given note every time.
 */
export function sketchLines(key: string, w: number, h: number) {
  let seed = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    seed = Math.imul(seed ^ key.charCodeAt(index), 16777619);
  }
  let state = seed >>> 0 || 1;
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1000) / 1000;
  };
  const pad = 12;
  const full = w - 2 * pad;
  const heading = full * (0.42 + 0.3 * next());
  const rows: { y: number; width: number }[] = [];
  for (let y = 30; y < h - 14; y += 8.5) {
    rows.push({ y, width: next() < 0.2 ? full * (0.3 + 0.3 * next()) : full * (0.72 + 0.28 * next()) });
  }
  return { pad, heading, rows };
}
