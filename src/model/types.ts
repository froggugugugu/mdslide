import type { BodyLayout } from "../layouts/geometry";
export type { BodyLayout };

export type SlideKind = "cover" | "agenda" | "section" | "body";

export interface DeckMeta {
  title: string;
  subtitle?: string;
  author?: string;
  date?: string;
  /** Master profile id to use for preview/export. */
  master?: string;
  /** once: agenda after cover. per-section: also before each section header. none. */
  agenda?: "once" | "per-section" | "none";
  /** chapter: 1, 1.1, 1.2 / flat: 1, 2, 3 / none */
  numbering?: "chapter" | "flat" | "none";
  /** Default layout for body slides that do not specify one: "text" | "2col". */
  layout?: string;
  /** Deck-wide body font size in points. Overrides the master's; a slide's {size=N} overrides both. */
  fontSize?: number;
  /** Long edge limit (px) for pasted images; 0 keeps the original size. Default 2000. */
  imageMaxPx?: number;
  /** Legacy: a fixed number of body lines per slide. When set, it replaces the capacity estimated from the body box (render.ts). */
  maxLines?: number;
}

/** A block is one authored unit in the markdown: a section (#) or a body slide (##). */
export interface Block {
  id: string;
  kind: "section" | "body";
  title: string;
  attrs: Record<string, string>;
  /** Raw markdown lines of this block, including the heading line. Round-trips verbatim. */
  raw: string[];
  /** 0-based line range in the source document [start, endExclusive). */
  range: [number, number];
  /** Body content split by explicit "---" separators. Each part is a list of lines. */
  parts: string[][];
  images: ImageRef[];
  /** Speaker notes: lines written as "> note: ...". */
  notes: string[];
}

export interface ImageRef {
  alt: string;
  /** Empty string means a placeholder ("![TODO 構成図]()") that still needs an image. */
  src: string;
}

export interface Deck {
  meta: DeckMeta;
  /** Raw frontmatter lines (including delimiters) for verbatim round-trip. */
  frontmatterRaw: string[];
  blocks: Block[];
}

/** A slide as it will be rendered / exported. Derived; never edited directly. */
export interface RenderedSlide {
  id: string;
  kind: SlideKind;
  /** "1", "1.2", "" */
  number: string;
  title: string;
  /** Title with number prefix and continuation suffix applied. */
  displayTitle: string;
  layout: BodyLayout;
  /** Markdown lines of the body for this slide. */
  body: string[];
  images: ImageRef[];
  notes: string[];
  /** Source block id, if derived from a block. */
  blockId?: string;
  /** For auto-split slides: index and total. */
  continuation?: { index: number; total: number };
  /** For agenda slides: section titles with numbers, and which is current. */
  agenda?: { items: { number: string; title: string }[]; current?: string };
  /** Source line to jump to in the editor. */
  sourceLine?: number;
  /** Body font size in points used for fit and export (body slides). */
  fontPt?: number;
  /** Fit estimate for body slides: display lines used vs available, and the box width in em. */
  fit?: { used: number; capacity: number; widthEm: number; autofit?: boolean };
}
