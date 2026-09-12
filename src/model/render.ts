import type { Block, BodyLayout, Deck, RenderedSlide } from "./types";
import { layoutFromAttrs } from "../layouts/geometry";
import { capacityLines, estimateLines, lineHeightPt, paragraphGapPt, splitByFit } from "./fit";
import type { BodyBox } from "./boxes";

export interface RenderOptions {
  /** Body text box (pt) for a layout; comes from the master geometry. Without it, a 13.33in default is used. */
  bodyBox?: (layout: BodyLayout, imageAspect?: number) => BodyBox;
  /** Body font size from the master's bodyStyle. */
  masterFontPt?: number;
  autofit?: boolean;
  /** Aspect ratios of known images, for image-slide boxes. */
  imageAspect?: (src: string) => number | undefined;
}

export const DEFAULT_FONT_PT = 18;
const DEFAULT_BOX: BodyBox = { widthPt: 864, heightPt: 372 }; // 13.33in slide, 5% margins, title block


function resolveLayout(block: Block, fallback: BodyLayout): BodyLayout {
  return layoutFromAttrs(block.attrs, block.images.length > 0, fallback);
}


/** Lines that are rendered as text (images are placed separately). */
function textLines(lines: string[]): string[] {
  const kept = lines.filter((l) => !/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(l));
  let s = 0, e = kept.length;
  while (s < e && !kept[s].trim()) s++;
  while (e > s && !kept[e - 1].trim()) e--;
  return kept.slice(s, e);
}

export function renderDeck(deck: Deck, opts: RenderOptions = {}): RenderedSlide[] {
  const meta = deck.meta;
  const numbering = meta.numbering ?? "chapter";
  const agendaMode = meta.agenda ?? "once";
  const defaultLayout: BodyLayout = meta.layout === "2col" ? { kind: "2col" } : { kind: "text" };
  const deckFontPt = meta.fontSize && meta.fontSize > 0 ? meta.fontSize : undefined;
  const slides: RenderedSlide[] = [];

  // Pass 1: assign numbers.
  const sections = deck.blocks.filter((b) => b.kind === "section");
  const numberOf = new Map<string, string>();
  let sectionNo = 0, bodyNo = 0, flatNo = 0;
  for (const b of deck.blocks) {
    if (b.kind === "section") {
      sectionNo++; bodyNo = 0;
      numberOf.set(b.id, numbering === "none" ? "" : String(sectionNo));
    } else {
      if (numbering === "none") numberOf.set(b.id, "");
      else if (numbering === "flat") numberOf.set(b.id, String(++flatNo));
      else numberOf.set(b.id, sectionNo === 0 ? String(++bodyNo) : `${sectionNo}.${++bodyNo}`);
    }
  }
  const agendaItems = sections.map((s) => ({ number: numberOf.get(s.id) ?? "", title: s.title }));
  const prefix = (n: string, t: string) => (n ? `${n}. ${t}` : t);

  // Cover
  slides.push({
    id: "cover", kind: "cover", number: "", title: meta.title, displayTitle: meta.title,
    layout: { kind: "text" }, body: [meta.subtitle, meta.author, meta.date].filter((x): x is string => !!x), images: [], notes: [], sourceLine: 0,
  });

  const pushAgenda = (current?: string) => {
    if (!agendaItems.length) return;
    slides.push({
      id: current ? `agenda:${current}` : "agenda", kind: "agenda", number: "", title: "Agenda", displayTitle: "Agenda",
      layout: { kind: "text" }, body: [], images: [], notes: [], agenda: { items: agendaItems, current },
    });
  };
  if (agendaMode !== "none") pushAgenda();

  // Pass 2: emit slides.
  for (const b of deck.blocks) {
    const number = numberOf.get(b.id) ?? "";
    if (b.kind === "section") {
      if (agendaMode === "per-section" && slides.some((s) => s.kind === "section")) pushAgenda(number);
      slides.push({
        id: b.id, kind: "section", number, title: b.title, displayTitle: prefix(number, b.title),
        layout: { kind: "text" }, body: textLines(b.parts.flat()), images: b.images, notes: b.notes, blockId: b.id, sourceLine: b.range[0],
      });
      continue;
    }
    const layout = resolveLayout(b, defaultLayout);
    const attrPt = Number(b.attrs.size);
    const fontPt = attrPt > 0 ? attrPt : deckFontPt ?? opts.masterFontPt ?? DEFAULT_FONT_PT;
    const box = opts.bodyBox?.(layout, b.images[0]?.src ? opts.imageAspect?.(b.images[0].src) : undefined) ?? DEFAULT_BOX;
    const widthEm = Math.max(4, box.widthPt / fontPt);
    // One display line is the master's line height; every paragraph also gets the master's paragraph spacing (ADR-0018).
    const lineH = lineHeightPt(fontPt, box.text);
    const gap = paragraphGapPt(fontPt, box.text) / lineH;
    const capacity = meta.maxLines ?? capacityLines(box.heightPt, fontPt, lineH / fontPt);
    // Explicit "---" parts first, then auto-split each part that still overflows the box.
    const chunks = b.parts.flatMap((p) => splitByFit(textLines(p), widthEm, capacity, gap));
    const total = chunks.length;
    chunks.forEach((body, i) => {
      const continuation = total > 1 ? { index: i + 1, total } : undefined;
      const suffix = continuation ? ` (${continuation.index}/${continuation.total})` : "";
      slides.push({
        id: total > 1 ? `${b.id}#${i + 1}` : b.id, kind: "body", number, title: b.title,
        displayTitle: prefix(number, b.title) + suffix, layout, body,
        images: i === 0 ? b.images : [], notes: i === 0 ? b.notes : [], blockId: b.id, continuation, sourceLine: b.range[0],
        fontPt, fit: { used: estimateLines(body, widthEm, gap), capacity, widthEm, autofit: opts.autofit },
      });
    });
  }
  return slides;
}
