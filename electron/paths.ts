import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * What the renderer may reach through the file IPC (ADR-0026): the folders the person opened (dialogs, the command
 * line, and the recent decks and masters folder in settings.json at launch) and single files such as settings.json.
 * Paths are compared after resolving symbolic links, so a link inside a deck folder cannot lead elsewhere.
 */
export class AllowedPaths {
  private readonly entries = new Set<string>();

  /** Absolute paths only; anything else is ignored. */
  allow(p: unknown): void {
    if (typeof p === "string" && path.isAbsolute(p)) this.entries.add(path.resolve(p));
  }

  async allows(p: unknown): Promise<boolean> {
    if (typeof p !== "string" || !path.isAbsolute(p)) return false;
    const target = await realpathLoose(p);
    if (!target) return false;
    for (const entry of this.entries) {
      const root = await realpathLoose(entry);
      if (root && isInside(target, root)) return true;
    }
    return false;
  }
}

/** `child` is `parent` or below it (both absolute). */
export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel));
}

/**
 * The real path of `p`: symbolic links resolved on the part that exists, the part not created yet appended as is.
 * null for a link that points nowhere, since writing through it would create a file wherever it points.
 */
export async function realpathLoose(p: string): Promise<string | null> {
  const missing: string[] = [];
  let cur = path.resolve(p);
  for (;;) {
    try {
      return path.join(await fs.realpath(cur), ...missing);
    } catch {
      if (await fs.lstat(cur).then(() => true, () => false)) return null;
      const parent = path.dirname(cur);
      if (parent === cur) return path.resolve(p);
      missing.unshift(path.basename(cur));
      cur = parent;
    }
  }
}
