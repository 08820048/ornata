/**
 * Minimal line diff for the note-history preview. LCS over the middle after
 * trimming the common prefix/suffix, so snapshots that differ in a paragraph
 * stay cheap; oversized middles fall back to a whole-block replace.
 */

export type DiffRow = { kind: "same" | "add" | "del"; text: string };

const same = (text: string): DiffRow => ({ kind: "same", text });
const add = (text: string): DiffRow => ({ kind: "add", text });
const del = (text: string): DiffRow => ({ kind: "del", text });

export function diffLines(before: string, after: string, maxMiddle = 1200): DiffRow[] {
  // An empty string is zero lines, not one blank line.
  const a = before === "" ? [] : before.split("\n");
  const b = after === "" ? [] : after.split("\n");

  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length > maxMiddle || midB.length > maxMiddle) {
    return [
      ...a.slice(0, start).map(same),
      ...midA.map(del),
      ...midB.map(add),
      ...a.slice(endA).map(same),
    ];
  }

  const n = midA.length;
  const m = midB.length;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      dp[i * width + j] =
        midA[i] === midB[j]
          ? dp[(i + 1) * width + j + 1] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const rows: DiffRow[] = a.slice(0, start).map(same);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      rows.push(same(midA[i]));
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      rows.push(del(midA[i]));
      i += 1;
    } else {
      rows.push(add(midB[j]));
      j += 1;
    }
  }
  while (i < n) rows.push(del(midA[i++]));
  while (j < m) rows.push(add(midB[j++]));
  rows.push(...a.slice(endA).map(same));
  return rows;
}
