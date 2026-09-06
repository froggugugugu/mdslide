/**
 * Text fit model shared by the editor gauge, the auto-split in render.ts and the exporter's warnings
 * (tools/export_pptx.py mirrors it). Deliberately simple: widths in em, CJK = 1em, Latin ≈ 0.55em.
 * It is a guide, not a layout engine: PowerPoint's own wrapping may differ by about a line.
 */
export const LINE_SPACING = 1.2;
export const BULLET_INDENT_EM = 1.5;   // bullet marker + gap, per nesting level
export const EMPTY_LINE = 0.5;

const IMAGE_ONLY = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;
const TABLE_SEP = /^\s*\|?\s*:?-{2,}/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;

export function charWidthEm(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  if (ch === " " || ch === "\t") return 0.3;
  if (c < 0x2e80) return 0.55;                    // Latin, digits, punctuation
  if (c >= 0xff61 && c <= 0xff9f) return 0.55;    // half-width katakana
  return 1;                                        // CJK, full-width forms, emoji
}

export function lineWidthEm(text: string): number {
  let w = 0;
  for (const ch of text.replace(/\*\*|`/g, "")) w += charWidthEm(ch);
  return w;
}

/** Display lines one source line occupies in a box `widthEm` wide. */
export function displayLines(line: string, widthEm: number): number {
  if (IMAGE_ONLY.test(line)) return 0;
  if (line.trim() === "") return EMPTY_LINE;
  if (line.trim().startsWith("|")) return TABLE_SEP.test(line) ? 0 : 1;
  const m = line.match(BULLET);
  const indent = m ? (Math.floor(m[1].length / 2) + 1) * BULLET_INDENT_EM : 0;
  const text = m ? m[2] : line;
  const avail = Math.max(widthEm - indent, 4);
  return Math.max(1, Math.ceil(lineWidthEm(text) / avail));
}

export function estimateLines(lines: string[], widthEm: number): number {
  return lines.reduce((n, l) => n + displayLines(l, widthEm), 0);
}

/** How many display lines fit in a box `heightPt` tall at `fontPt`. */
export function capacityLines(heightPt: number, fontPt: number, lineSpacing = LINE_SPACING): number {
  return Math.max(1, Math.floor(heightPt / (fontPt * lineSpacing)));
}

/** Split lines into chunks that each fit `capacity` display lines. Prefers blank lines; keeps tables whole. */
export function splitByFit(lines: string[], widthEm: number, capacity: number): string[][] {
  if (estimateLines(lines, widthEm) <= capacity) return [lines];
  const chunks: string[][] = [];
  let cur: string[] = [], used = 0, i = 0;
  const trim = (ls: string[]) => { let s = 0, e = ls.length; while (s < e && !ls[s].trim()) s++; while (e > s && !ls[e - 1].trim()) e--; return ls.slice(s, e); };
  const push = () => { const t = trim(cur); if (t.length) chunks.push(t); cur = []; used = 0; };
  while (i < lines.length) {
    // a table is an indivisible unit
    let unit = [lines[i]];
    if (lines[i].trim().startsWith("|")) { let j = i; while (j < lines.length && lines[j].trim().startsWith("|")) j++; unit = lines.slice(i, j); }
    const cost = estimateLines(unit, widthEm);
    if (used > 0 && used + cost > capacity) {
      // back up to the last blank line inside the current chunk if it is in the latter half
      const blank = cur.lastIndexOf("");
      if (blank > cur.length / 2) { const tail = cur.slice(blank + 1); cur = cur.slice(0, blank); push(); cur = tail; used = estimateLines(tail, widthEm); }
      else push();
    }
    cur.push(...unit); used += cost; i += unit.length;
  }
  push();
  return chunks;
}
