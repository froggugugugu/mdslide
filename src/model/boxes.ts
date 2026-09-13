import { contentArea, DEFAULT_TITLE, GAP, MARGIN, placeImage, type Frame } from "../layouts/geometry";
import { bodyPlaceholders, findLayout, type MasterLayout, type MasterProfile, type Rect } from "../master/importMaster";
import type { TextSpacing } from "./fit";
import type { BodyLayout } from "./types";

export const PT_PER_EMU = 1 / 12700;
export const DEFAULT_SLIDE = { w: 12192000, h: 6858000 };
/** Clearance kept between body content and the master's header or footer, as a fraction of the slide width. */
export const SAFE_GAP = 0.01;
/** A shape belongs to the header when it lies entirely in the top third, to the footer when it starts in the bottom third. */
const EDGE_ZONE = 1 / 3;

/** A body text box in points, already net of the placeholder's insets, with the spacing PowerPoint will use in it. */
export interface BodyBox { widthPt: number; heightPt: number; text?: TextSpacing }

/**
 * Where body content may go vertically, in fractions of the slide width (like geometry Frames). The header and footer
 * are the Body-Text layout's (or the given layout's) shapes, pictures and date / footer / slide-number placeholders (plus the master's shapes,
 * unless the layout hides them) that reach into the content columns and sit in the top / bottom third of the slide.
 * `headerBottom` / `footerTop` are their own edges; `top` / `bottom` keep SAFE_GAP clear of them. The person never
 * writes margins: they follow from the master (ADR-0018).
 */
export interface ContentBand { top: number; bottom: number; headerBottom?: number; footerTop?: number }

export function contentBand(master: MasterProfile | undefined, of?: MasterLayout): ContentBand | undefined {
  if (!master) return undefined;
  const { w, h } = master.slideSize;
  const layout = of ?? findLayout(master, "body", "text");
  const obstacles: Rect[] = [
    ...(layout?.showMasterShapes === false ? [] : master.master.decor.map((d) => d.rect)),
    ...(layout?.decor ?? []).map((d) => d.rect),
    ...(layout?.placeholders ?? []).filter((p) => (p.type === "dt" || p.type === "ftr" || p.type === "sldNum") && p.rect).map((p) => p.rect!),
  ];
  const left = MARGIN * w, right = (1 - MARGIN) * w;
  let headerBottom: number | undefined, footerTop: number | undefined;
  for (const r of obstacles) {
    if (r.w <= 0 || r.h <= 0 || r.x + r.w <= left || r.x >= right) continue; // outside the content columns (a side stripe)
    if (r.y + r.h <= h * EDGE_ZONE) headerBottom = Math.max(headerBottom ?? 0, r.y + r.h);
    else if (r.y >= h * (1 - EDGE_ZONE)) footerTop = Math.min(footerTop ?? h, r.y);
  }
  return {
    top: headerBottom === undefined ? 0 : headerBottom / w + SAFE_GAP,
    bottom: footerTop === undefined ? h / w : footerTop / w - SAFE_GAP,
    headerBottom: headerBottom === undefined ? undefined : headerBottom / w,
    footerTop: footerTop === undefined ? undefined : footerTop / w,
  };
}

/** The body box of a layout (for two columns, the left one): the placeholder the preview and the exporter fill. */
const bodyRectOf = (l: MasterLayout | undefined, columns = 1): Rect | undefined =>
  (l ? bodyPlaceholders(l.placeholders, { count: columns })[0]?.rect : undefined) ?? undefined;

/**
 * Where the body text goes, in points, for a given layout. Text and 2col slides use the master's body placeholder,
 * stopped above the footer (text flows from the top, so only the bottom is cut); image slides use the computed geometry
 * inside the content band. Boxes are net of the placeholder's text insets and carry its line and paragraph spacing, so
 * the fit estimate counts what PowerPoint will actually lay out.
 */
export function bodyBoxFor(master: MasterProfile | undefined, layout: BodyLayout, imageAspect?: number): BodyBox {
  const size = master?.slideSize ?? DEFAULT_SLIDE;
  const W = size.w * PT_PER_EMU;
  const aspect = size.w / size.h;
  const text = master ? findLayout(master, "body", "text") : undefined;
  const titleRect = text?.placeholders.find((p) => (p.type === "title" || p.type === "ctrTitle") && p.rect)?.rect;
  const title: Frame = titleRect ? { x: titleRect.x / size.w, y: titleRect.y / size.w, w: titleRect.w / size.w, h: titleRect.h / size.w } : DEFAULT_TITLE;
  const band = contentBand(master);
  const content = contentArea(title.y + title.h, aspect, band);
  const clipped = (r: Rect) => {
    const bottom = band ? Math.min(r.y + r.h, band.bottom * size.w) : r.y + r.h;
    return { widthPt: r.w * PT_PER_EMU, heightPt: Math.max(0, bottom - r.y) * PT_PER_EMU };
  };
  const inset = (box: { widthPt: number; heightPt: number }, l: MasterLayout | undefined): BodyBox => {
    const m = l?.bodyText;
    if (!m) return box;
    return {
      widthPt: Math.max(1, box.widthPt - (m.insets.l + m.insets.r) * PT_PER_EMU),
      heightPt: Math.max(1, box.heightPt - (m.insets.t + m.insets.b) * PT_PER_EMU),
      text: { lineSpacing: m.lineSpacing, spaceBefore: m.spaceBefore, spaceAfter: m.spaceAfter },
    };
  };
  if (layout.kind === "image") {
    const p = placeImage(layout, content, imageAspect);
    const b = p.body ?? { w: content.w, h: 0.001 };
    return inset({ widthPt: b.w * W, heightPt: b.h * W }, text);
  }
  if (layout.kind === "2col") {
    const l2 = master ? findLayout(master, "body", "2col") : undefined;
    const b = bodyRectOf(l2, 2);
    if (b) return inset(clipped(b), l2);
    return { widthPt: ((content.w - GAP) / 2) * W, heightPt: content.h * W };
  }
  const b = bodyRectOf(text);
  if (b) return inset(clipped(b), text);
  return { widthPt: content.w * W, heightPt: content.h * W };
}

/**
 * Layouts whose body box runs into the header or the footer, by name: shown as warnings on the master (ADR-0025).
 * Body-Text and Body-2col are measured against Body-Text's header and footer, the band the fit estimate uses; Agenda
 * and Section against their own layout's. The cover is left out: full-bleed covers hide the bands on purpose.
 */
export function bodyOverlaps(master: MasterProfile): { header: string[]; footer: string[] } {
  const W = master.slideSize.w;
  const find = (pred: (r: NonNullable<MasterLayout["role"]>) => boolean) => master.layouts.find((l) => l.role && pred(l.role));
  const agenda = find((r) => r.kind === "agenda"), section = find((r) => r.kind === "section");
  const checks: [MasterLayout | undefined, number, ContentBand | undefined][] = [
    [find((r) => r.kind === "body" && r.layout === "text"), 1, contentBand(master)],
    [find((r) => r.kind === "body" && r.layout === "2col"), 2, contentBand(master)],
    [agenda, 1, contentBand(master, agenda)],
    [section, 1, contentBand(master, section)],
  ];
  const out = { header: [] as string[], footer: [] as string[] };
  for (const [layout, count, band] of checks) {
    if (!layout || !band) continue;
    const rects = bodyPlaceholders(layout.placeholders, { count }).map((p) => p.rect!);
    if (band.headerBottom !== undefined && rects.some((r) => r.y < band.headerBottom! * W - 1)) out.header.push(layout.name);
    if (band.footerTop !== undefined && rects.some((r) => r.y + r.h > band.footerTop! * W + 1)) out.footer.push(layout.name);
  }
  return out;
}

export function masterBodyFontPt(master: MasterProfile | undefined): number | undefined {
  return master ? findLayout(master, "body", "text")?.bodyFontPt : undefined;
}
export function masterAutofit(master: MasterProfile | undefined): boolean | undefined {
  return master ? findLayout(master, "body", "text")?.autofit : undefined;
}
