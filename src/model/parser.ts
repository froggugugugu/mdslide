import type { Block, Deck, DeckMeta, ImageRef } from "./types";

const HEADING = /^(#{1,2})\s+(.*?)\s*(\{([^}]*)\})?\s*$/;
const IMAGE = /!\[([^\]]*)\]\(([^)]*)\)/g;
export const NOTE = /^>\s*(?:note|ノート)\s*:\s*(.*)$/i;

export function parseAttrs(text: string | undefined): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!text) return attrs;
  for (const m of text.matchAll(/([\w-]+)=("[^"]*"|\S+)/g)) {
    attrs[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return attrs;
}

function parseFrontmatter(lines: string[]): { meta: DeckMeta; raw: string[]; consumed: number } {
  const meta: DeckMeta = { title: "" };
  if (lines[0]?.trim() !== "---") return { meta, raw: [], consumed: 0 };
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") { end = i; break; }
  }
  if (end < 0) return { meta, raw: [], consumed: 0 };
  for (const line of lines.slice(1, end)) {
    const m = line.match(/^([\w-]+)\s*:\s*(.*)$/);
    if (!m) continue;
    const key = m[1] as keyof DeckMeta;
    const value = m[2].trim().replace(/^["']|["']$/g, "");
    if (key === "maxLines" || key === "fontSize") { const n = Number(value); if (n > 0) meta[key] = n; }
    else if (key === "imageMaxPx") { const n = Number(value); if (n >= 0) meta.imageMaxPx = n; }
    else (meta as unknown as Record<string, unknown>)[key] = value;
  }
  return { meta, raw: lines.slice(0, end + 1), consumed: end + 1 };
}

function extractImages(lines: string[]): ImageRef[] {
  const images: ImageRef[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(IMAGE)) images.push({ alt: m[1], src: m[2] });
  }
  return images;
}

function splitParts(lines: string[]): string[][] {
  const parts: string[][] = [[]];
  for (const line of lines) {
    if (line.trim() === "---") parts.push([]);
    else if (!NOTE.test(line)) parts[parts.length - 1].push(line);
  }
  return parts.map(trimBlankEdges);
}

function trimBlankEdges(lines: string[]): string[] {
  let s = 0, e = lines.length;
  while (s < e && lines[s].trim() === "") s++;
  while (e > s && lines[e - 1].trim() === "") e--;
  return lines.slice(s, e);
}

/**
 * Block ids are "kind:ordinal:title". The ordinal is per-kind, so moving a block
 * changes its id only when the relative order among same-kind blocks changes.
 */
export function parseMarkdown(source: string): Deck {
  const lines = source.split(/\r?\n/);
  const fm = parseFrontmatter(lines);
  const blocks: Block[] = [];
  const counters = { section: 0, body: 0 };
  let current: { kind: "section" | "body"; title: string; attrs: Record<string, string>; start: number } | null = null;
  let inFence = false;

  const flush = (end: number) => {
    if (!current) return;
    const raw = lines.slice(current.start, end);
    const bodyLines = raw.slice(1);
    const ordinal = counters[current.kind]++;
    blocks.push({
      id: `${current.kind}:${ordinal}:${current.title.slice(0, 32)}`,
      kind: current.kind,
      title: current.title,
      attrs: current.attrs,
      raw,
      range: [current.start, end],
      parts: splitParts(bodyLines),
      images: extractImages(bodyLines),
      notes: bodyLines.map((l) => l.match(NOTE)?.[1]).filter((n): n is string => n !== undefined),
    });
  };

  for (let i = fm.consumed; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("```")) inFence = !inFence;
    if (inFence) continue;
    const m = line.match(HEADING);
    if (!m) continue;
    flush(i);
    current = {
      kind: m[1].length === 1 ? "section" : "body",
      title: m[2],
      attrs: parseAttrs(m[4]),
      start: i,
    };
  }
  flush(lines.length);

  // Lines between frontmatter and the first heading are ignored (free notes).
  return { meta: fm.meta, frontmatterRaw: fm.raw, blocks };
}

/** Rebuild markdown from blocks. Reordering blocks then serializing is how the left pane edits the source. */
export function serializeDeck(deck: Deck): string {
  const out: string[] = [];
  if (deck.frontmatterRaw.length) out.push(...deck.frontmatterRaw, "");
  for (const b of deck.blocks) {
    out.push(...trimTrailingBlank(b.raw), "");
  }
  return out.join("\n").replace(/\n+$/, "\n");
}

function trimTrailingBlank(lines: string[]): string[] {
  let e = lines.length;
  while (e > 0 && lines[e - 1].trim() === "") e--;
  return lines.slice(0, e);
}

/**
 * Return a copy of the deck whose frontmatter has `key` set to `value` (a string) or removed (null).
 * Other frontmatter lines are kept verbatim; the frontmatter is created or dropped as needed.
 */
export function withMeta(deck: Deck, key: string, value: string | null): Deck {
  const inner = deck.frontmatterRaw.length ? deck.frontmatterRaw.slice(1, -1) : [];
  const isKey = (l: string) => new RegExp(`^${key}\\s*:`).test(l);
  const at = inner.findIndex(isKey);
  const lines = inner.filter((l) => !isKey(l));
  if (value !== null) lines.splice(at >= 0 ? at : lines.length, 0, `${key}: ${value}`);
  const meta = { ...deck.meta } as unknown as Record<string, unknown>;
  if (value === null) delete meta[key]; else meta[key] = value;
  return { ...deck, meta: meta as unknown as DeckMeta, frontmatterRaw: lines.length ? ["---", ...lines, "---"] : [] };
}

/** Return a copy of the block whose heading line carries the given attribute (set or removed). */
export function withAttr(block: Block, key: string, value: string | null): Block {
  const attrs = { ...block.attrs };
  if (value === null) delete attrs[key]; else attrs[key] = value;
  const hashes = block.kind === "section" ? "#" : "##";
  const attrText = Object.entries(attrs).map(([k, v]) => `${k}=${v}`).join(" ");
  const heading = attrText ? `${hashes} ${block.title} {${attrText}}` : `${hashes} ${block.title}`;
  return { ...block, attrs, raw: [heading, ...block.raw.slice(1)] };
}

/**
 * Move a block. Moving a section moves its body slides with it.
 * Moving a body across a section boundary re-parents it (numbering follows automatically).
 */
export function moveBlock(deck: Deck, fromId: string, toId: string, place: "before" | "after"): Deck {
  const blocks = deck.blocks;
  const from = blocks.findIndex((b) => b.id === fromId);
  const to = blocks.findIndex((b) => b.id === toId);
  if (from < 0 || to < 0 || from === to) return deck;

  const unit = blocks[from].kind === "section" ? sectionSpan(blocks, from) : 1;
  const moving = blocks.slice(from, from + unit);
  if (to > from && to < from + unit) return deck; // dropping a section onto its own child

  const rest = [...blocks.slice(0, from), ...blocks.slice(from + unit)];
  let insertAt = rest.findIndex((b) => b.id === toId);
  if (place === "after") {
    // Dropping after a section means after its whole span.
    insertAt += rest[insertAt].kind === "section" && moving[0].kind === "section" ? sectionSpan(rest, insertAt) : 1;
  }
  rest.splice(insertAt, 0, ...moving);
  return { ...deck, blocks: rest };
}

/** Number of consecutive blocks starting at index i that belong to the section at i (itself included). */
export function sectionSpan(blocks: Block[], i: number): number {
  let n = 1;
  while (i + n < blocks.length && blocks[i + n].kind !== "section") n++;
  return n;
}
