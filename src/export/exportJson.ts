import type { Deck, RenderedSlide } from "../model/types";
import { findLayout, type MasterProfile } from "../master/importMaster";
import { contentArea, DEFAULT_TITLE, GAP, placeImage, toEmu, type Frame } from "../layouts/geometry";

/**
 * Export contract consumed by tools/export_pptx.py.
 * Keep this shape stable; the Python side validates it.
 */
interface EmuRect { x: number; y: number; w: number; h: number }

export interface ExportDeck {
  version: 2;
  slideSize: { w: number; h: number };
  meta: Deck["meta"];
  master: { id: string; name: string; layouts: { name: string; kind: string; layout?: string }[] } | null;
  slides: {
    kind: RenderedSlide["kind"];
    /** "text" | "2col" | "image" */
    layout: string;
    /**
     * Image slides only. All EMU. `imageBox` is the area the picture must be fitted into (aspect preserved,
     * anchored top and to `side`). `body` is the text area; for full-width images it is null and the exporter
     * places text below the fitted picture, `gap` EMU under it, if room remains.
     */
    geometry?: { side: "left" | "right"; imageBox: EmuRect; body: EmuRect | null; contentBottom: number; gap: number };
    /** Name of the slideLayout to use in the master pptx, resolved by the app. */
    masterLayout: string | null;
    title: string;
    body: string[];
    images: { alt: string; src: string }[];
    notes: string[];
    /** Body font size in points (body slides). The exporter applies it to every body run. */
    fontPt?: number;
    /** Fit estimate the app computed; the exporter re-checks and warns on overflow. */
    fit?: { used: number; capacity: number };
    agenda?: RenderedSlide["agenda"];
  }[];
}

const DEFAULT_SIZE = { w: 12192000, h: 6858000 };

function titleFrame(master: MasterProfile | undefined, size: { w: number; h: number }): Frame {
  const l = master ? findLayout(master, "body", "text") : undefined;
  const t = l?.placeholders.find((p) => (p.type === "title" || p.type === "ctrTitle") && p.rect)?.rect;
  return t ? { x: t.x / size.w, y: t.y / size.w, w: t.w / size.w, h: t.h / size.w } : DEFAULT_TITLE;
}

export function buildExport(deck: Deck, slides: RenderedSlide[], master: MasterProfile | undefined,
  imageDims: Record<string, { w: number; h: number }>): ExportDeck {
  const size = master?.slideSize ?? DEFAULT_SIZE;
  const aspect = size.w / size.h;
  const title = titleFrame(master, size);
  const content = contentArea(title.y + title.h, aspect);
  const resolve = (s: RenderedSlide) => (master ? findLayout(master, s.kind, s.layout.kind === "2col" ? "2col" : "text")?.name ?? null : null);
  const geometry = (s: RenderedSlide) => {
    if (s.kind !== "body" || s.layout.kind !== "image") return undefined;
    const d = imageDims[s.images[0]?.src ?? ""];
    const p = placeImage(s.layout, content, d ? d.w / d.h : undefined);
    return { side: s.layout.side, imageBox: toEmu(p.box, size.w), body: s.layout.width === 1 ? null : toEmu(p.body!, size.w),
      contentBottom: Math.round((content.y + content.h) * size.w), gap: Math.round(GAP * size.w) };
  };
  return {
    version: 2,
    slideSize: size,
    meta: deck.meta,
    master: master ? { id: master.id, name: master.name, layouts: master.layouts.filter((l) => l.role).map((l) => ({ name: l.name, kind: l.role!.kind, layout: l.role!.layout })) } : null,
    slides: slides.map((s) => ({ kind: s.kind, layout: s.layout.kind, geometry: geometry(s), masterLayout: resolve(s), title: s.displayTitle, body: s.body, images: s.images, notes: s.notes, fontPt: s.fontPt, fit: s.fit ? { used: s.fit.used, capacity: s.fit.capacity } : undefined, agenda: s.agenda })),
  };
}

export function download(name: string, content: Blob | string, type = "application/json") {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}
