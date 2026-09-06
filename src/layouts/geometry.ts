/**
 * Geometry for body slides. All values are fractions of the slide WIDTH (x, y, w, h alike),
 * so a 16:9 slide spans x: 0..1, y: 0..0.5625. Convert with `toCss` / `toEmu`.
 *
 * Rules (see docs/markdown-spec.md, "画像レイアウト"):
 * - Image keeps its aspect ratio; it is fitted inside a box, never stretched.
 * - Box width is 1/1, 3/4 or 1/2 of the content width; placed left or right.
 * - Text takes the remaining width (side layouts) or the remaining height below the image (full width).
 * - Margins: MARGIN around the slide, GAP between image and text.
 */
export interface Frame { x: number; y: number; w: number; h: number }

export type ImageWidth = 1 | 0.75 | 0.5;
export type Side = "left" | "right";
export type BodyLayout =
  | { kind: "text" }
  | { kind: "2col" }
  | { kind: "image"; width: ImageWidth; side: Side };

export const MARGIN = 0.05;
export const GAP = 0.03;
/** Space kept between the title block and the content area. */
export const TITLE_GAP = 0.02;
/** Minimum height for text placed under a full-width image; below this the text is dropped with a warning. */
export const MIN_TEXT_HEIGHT = 0.06;

export const DEFAULT_TITLE: Frame = { x: MARGIN, y: 0.035, w: 1 - 2 * MARGIN, h: 0.07 };

/** Content area below the title. `slideAspect` = width / height. */
export function contentArea(titleBottom: number, slideAspect: number): Frame {
  const H = 1 / slideAspect;
  const y = titleBottom + TITLE_GAP;
  return { x: MARGIN, y, w: 1 - 2 * MARGIN, h: H - MARGIN - y };
}

/** Fit an image of the given aspect (w/h) inside a box, anchored to the top and to `side`. */
export function fitImage(box: Frame, imageAspect: number, side: Side): Frame {
  let w = box.w, h = w / imageAspect;
  if (h > box.h) { h = box.h; w = h * imageAspect; }
  const x = side === "left" ? box.x : box.x + box.w - w;
  return { x, y: box.y, w, h };
}

export interface ImagePlacement {
  box: Frame;
  /** Fitted image rect; uses `imageAspect` (defaults to 16:9 when unknown). */
  image: Frame;
  /** Text area, or null when nothing usable is left. */
  body: Frame | null;
}

export function placeImage(layout: Extract<BodyLayout, { kind: "image" }>, content: Frame, imageAspect = 16 / 9): ImagePlacement {
  if (layout.width === 1) {
    const box = { ...content };
    const image = fitImage(box, imageAspect, layout.side);
    const y = image.y + image.h + GAP;
    const h = content.y + content.h - y;
    return { box, image, body: h >= MIN_TEXT_HEIGHT ? { x: content.x, y, w: content.w, h } : null };
  }
  const boxW = (content.w - GAP) * layout.width;
  const textW = content.w - GAP - boxW;
  const box = { x: layout.side === "left" ? content.x : content.x + content.w - boxW, y: content.y, w: boxW, h: content.h };
  const body = { x: layout.side === "left" ? box.x + boxW + GAP : content.x, y: content.y, w: textW, h: content.h };
  return { box, image: fitImage(box, imageAspect, layout.side), body };
}

/** CSS percentages for absolute positioning inside a box with the slide's aspect ratio. */
export function toCss(f: Frame, slideAspect: number) {
  return { left: `${f.x * 100}%`, top: `${f.y * slideAspect * 100}%`, width: `${f.w * 100}%`, height: `${f.h * slideAspect * 100}%` };
}

export function toEmu(f: Frame, slideWidthEmu: number) {
  return { x: Math.round(f.x * slideWidthEmu), y: Math.round(f.y * slideWidthEmu), w: Math.round(f.w * slideWidthEmu), h: Math.round(f.h * slideWidthEmu) };
}

// ---------- attribute parsing ----------

const WIDTHS: Record<string, ImageWidth> = { "1": 1, "1/1": 1, "full": 1, "3/4": 0.75, "0.75": 0.75, "1/2": 0.5, "0.5": 0.5, "half": 0.5 };

/**
 * Resolve the body layout from heading attributes:
 *   {img=1/2 side=right}   image slide (side defaults to right)
 *   {layout=2col}          two columns
 *   legacy: layout=img-left|img-right|img-full|img-top
 * `hasImages` makes an image slide out of a plain heading that contains an image.
 */
export function layoutFromAttrs(attrs: Record<string, string>, hasImages: boolean, fallback: BodyLayout = { kind: "text" }): BodyLayout {
  const side: Side = attrs.side === "left" ? "left" : "right";
  if (attrs.img !== undefined) {
    const width = WIDTHS[attrs.img] ?? 0.5;
    return { kind: "image", width, side };
  }
  switch (attrs.layout) {
    case "2col": return { kind: "2col" };
    case "text": return { kind: "text" };
    case "img-left": return { kind: "image", width: 0.5, side: "left" };
    case "img-right": return { kind: "image", width: 0.5, side: "right" };
    case "img-full": case "img-top": return { kind: "image", width: 1, side: "right" };
  }
  if (hasImages) return { kind: "image", width: 0.5, side };
  return fallback;
}

export function layoutToAttrs(layout: BodyLayout): Record<string, string | null> {
  switch (layout.kind) {
    case "text": return { layout: null, img: null, side: null };
    case "2col": return { layout: "2col", img: null, side: null };
    case "image": return { layout: null, img: layout.width === 1 ? "1/1" : layout.width === 0.75 ? "3/4" : "1/2", side: layout.side };
  }
}

export function layoutLabel(l: BodyLayout): string {
  if (l.kind === "text") return "テキスト";
  if (l.kind === "2col") return "2カラム";
  return `画像 ${l.width === 1 ? "1/1" : l.width === 0.75 ? "3/4" : "1/2"} ${l.side === "left" ? "左" : "右"}`;
}

/** Key used for line-capacity lookup. */
export function layoutKey(l: BodyLayout): "text" | "2col" | "image" { return l.kind; }
