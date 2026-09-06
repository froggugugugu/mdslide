import type { Backend } from "./workspace";

const DIR = ".mdslide/history";
const stamp = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}-${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}${String(d.getSeconds()).padStart(2, "0")}`;

type Fs = Pick<Backend, "readText" | "writeText" | "list" | "remove">;

/** Copy deck.md into .mdslide/history/<timestamp>.md. Returns the snapshot path (null when there is no deck.md). */
export async function snapshotDeck(fs: Fs, now = new Date()): Promise<string | null> {
  const cur = await fs.readText("deck.md");
  if (!cur) return null;
  const name = `${DIR}/${stamp(now)}.md`;
  await fs.writeText(name, cur.text);
  return name;
}

/**
 * Put the newest snapshot back into deck.md. The version being replaced is snapshotted first, so this is
 * also an undo of the undo. Returns the restored snapshot path, or null when there is none.
 */
export async function restoreLatestSnapshot(fs: Fs, now = new Date()): Promise<string | null> {
  const names = (await fs.list(DIR)).filter((n) => n.endsWith(".md")).sort();
  if (!names.length) return null;
  const latest = `${DIR}/${names[names.length - 1]}`;
  const snap = await fs.readText(latest);
  if (!snap) return null;
  const cur = await fs.readText("deck.md");
  await fs.remove(latest);
  if (cur) {
    // The replaced version must sort after everything that remains, even if the clock is behind the snapshots.
    let name = stamp(now);
    const remaining = names.slice(0, -1);
    const last = remaining.length ? remaining[remaining.length - 1].replace(/\.md$/, "") : "";
    if (name <= last || name <= names[names.length - 1].replace(/\.md$/, "")) name = bump(names[names.length - 1].replace(/\.md$/, ""));
    await fs.writeText(`${DIR}/${name}.md`, cur.text);
  }
  await fs.writeText("deck.md", snap.text);
  return latest;
}

/** "2026-09-06-100500" + 1 second. */
function bump(st: string): string {
  const m = st.match(/^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})(\d{2})$/);
  if (!m) return st + "1";
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6] + 1);
  return stamp(d);
}
