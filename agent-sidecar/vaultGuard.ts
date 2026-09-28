import { realpathSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

/**
 * Keeps the sidecar's own file tools (read, grep, find, ls) inside the vault.
 * Pi resolves `~` and absolute paths, so `cwd` alone is only a default, not a
 * boundary — without this, "read-only" could read any file on the Mac and,
 * with web_fetch allowed, send it anywhere.
 */
export class VaultGuard {
  private readonly root: string;

  constructor(vaultRoot: string) {
    this.root = realpathSync(vaultRoot);
  }

  /** Resolve a tool path the way Pi does, then require it (after following
   *  symlinks) to be the vault or inside it. Returns the resolved path. */
  resolve(raw: string | undefined): string {
    const input = (raw ?? ".").trim() || ".";
    const expanded =
      input === "~" ? homedir() : input.startsWith("~/") ? path.join(homedir(), input.slice(2)) : input;
    const absolute = path.resolve(this.root, expanded);
    const real = realpathOrNearest(absolute);
    if (!this.contains(real)) {
      throw new Error(`Access denied: ${raw ?? "."} is outside the vault. Only files in the vault can be read.`);
    }
    return absolute;
  }

  /** Glob patterns are matched below the search path; reject ones that could
   *  climb out of it or name an absolute location. */
  checkPattern(pattern: string | undefined) {
    if (!pattern) return;
    const segments = pattern.split(/[\\/]/);
    if (path.isAbsolute(pattern) || pattern.startsWith("~") || segments.includes("..")) {
      throw new Error(`Access denied: the pattern ${pattern} reaches outside the vault.`);
    }
  }

  private contains(candidate: string) {
    const relative = path.relative(this.root, candidate);
    return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
  }
}

/** realpath of the path, or of its closest existing ancestor (for paths that
 *  don't exist yet), so a symlink anywhere along the way can't escape. */
function realpathOrNearest(target: string): string {
  let current = target;
  const rest: string[] = [];
  for (;;) {
    try {
      return path.join(realpathSync(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return target;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}
