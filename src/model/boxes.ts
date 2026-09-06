import { contentArea, DEFAULT_TITLE, placeImage, type Frame } from "../layouts/geometry";
import { findLayout, type MasterProfile } from "../master/importMaster";
import type { BodyLayout } from "./types";

export const PT_PER_EMU = 1 / 12700;
export const DEFAULT_SLIDE = { w: 12192000, h: 6858000 };

export interface BodyBox { widthPt: number; heightPt: number }

/**
 * Where the body text goes, in points, for a given layout. Text slides use the master's body placeholder;
 * image and 2col slides use the computed geometry (the same one the preview and exporter use).
 */
export function bodyBoxFor(master: MasterProfile | undefined, layout: BodyLayout, imageAspect?: number): BodyBox {
  const size = master?.slideSize ?? DEFAULT_SLIDE;
  const W = size.w * PT_PER_EMU;
  const aspect = size.w / size.h;
  const text = master ? findLayout(master, "body", "text") : undefined;
  const titleRect = text?.placeholders.find((p) => (p.type === "title" || p.type === "ctrTitle") && p.rect)?.rect;
  const title: Frame = titleRect ? { x: titleRect.x / size.w, y: titleRect.y / size.w, w: titleRect.w / size.w, h: titleRect.h / size.w } : DEFAULT_TITLE;
  const content = contentArea(title.y + title.h, aspect);
  if (layout.kind === "image") {
    const p = placeImage(layout, content, imageAspect);
    const b = p.body ?? { w: content.w, h: 0.001 };
    return { widthPt: b.w * W, heightPt: b.h * W };
  }
  if (layout.kind === "2col") {
    const l2 = master ? findLayout(master, "body", "2col") : undefined;
    const b = l2?.placeholders.find((p) => (p.type === "body" || p.type === "obj") && p.rect)?.rect;
    if (b) return { widthPt: b.w * PT_PER_EMU, heightPt: b.h * PT_PER_EMU };
    return { widthPt: ((content.w - 0.03) / 2) * W, heightPt: content.h * W };
  }
  const b = text?.placeholders.find((p) => (p.type === "body" || p.type === "obj") && p.rect)?.rect;
  if (b) return { widthPt: b.w * PT_PER_EMU, heightPt: b.h * PT_PER_EMU };
  return { widthPt: content.w * W, heightPt: content.h * W };
}

export function masterBodyFontPt(master: MasterProfile | undefined): number | undefined {
  return master ? findLayout(master, "body", "text")?.bodyFontPt : undefined;
}
export function masterAutofit(master: MasterProfile | undefined): boolean | undefined {
  return master ? findLayout(master, "body", "text")?.autofit : undefined;
}
