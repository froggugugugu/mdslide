import JSZip from "jszip";
import type { SlideKind } from "../model/types";
import type { Spacing, TextSpacing } from "../model/fit";

/** Body layouts that must exist in the master. Image slides use Body-Text plus a free picture shape. */
export type MasterBodyKind = "text" | "2col";

/** EMU rectangle as stored in OOXML. */
export interface Rect { x: number; y: number; w: number; h: number }

/** How a placeholder's box and first-level text look on the master / layout: only what the preview draws. */
export interface PlaceholderStyle {
  /** Box fill (a title bar on the layout, say). */
  fill?: string;
  /** First-level text colour. */
  color?: string;
  fontPt?: number;
  align?: "l" | "ctr" | "r";
  anchor?: "t" | "ctr" | "b";
}

export interface Placeholder {
  /** OOXML ph type: title, body, pic, ctrTitle, subTitle, dt, ftr, sldNum, or "" (body by default). */
  type: string;
  idx: number;
  rect: Rect | null;
  style?: PlaceholderStyle;
  /** dt / ftr / sldNum placeholders: fixed text on the layout, and the field they carry (the preview fills it in). */
  text?: string;
  field?: "slidenum" | "datetime";
}

/** A decoration drawn on the master or a layout: a picture, a filled shape, or a fixed text box. EMU coordinates. */
export interface Decor {
  kind: "image" | "shape" | "text";
  rect: Rect;
  /** Degrees, clockwise. */
  rotation?: number;
  /** image: a data URL of the media. */
  src?: string;
  /** CSS colour; absent = no fill. */
  fill?: string;
  line?: { color: string; width: number };
  /** prstGeom name (rect, roundRect, ellipse, line, ...). */
  geometry?: string;
  text?: string;
  fontPt?: number;
  color?: string;
  bold?: boolean;
  align?: "l" | "ctr" | "r";
  anchor?: "t" | "ctr" | "b";
}

export interface Background { color?: string; image?: string }

export interface MasterLayout {
  /** Layout name as shown in PowerPoint ("Body-Text"). */
  name: string;
  /** First-level body font size in points (layout override, else master bodyStyle). */
  bodyFontPt?: number;
  /** PowerPoint shrinks text on overflow for this layout's body placeholder. Informational: mdslide splits instead. */
  autofit?: boolean;
  file: string; // ppt/slideLayouts/slideLayoutN.xml
  role: { kind: SlideKind; layout?: MasterBodyKind } | null;
  placeholders: Placeholder[];
  /** The layout's own decorations, drawn over the master's. */
  decor: Decor[];
  /** The layout's own background; absent = the master's. */
  background?: Background;
  /** false when the layout hides the master's shapes (showMasterSp="0"). */
  showMasterShapes: boolean;
  /** Line / paragraph spacing and text insets of the body placeholder, for the fit estimate (absent without one). */
  bodyText?: BodyTextMetrics;
}

/** How PowerPoint lays out text in a body placeholder: spacing plus the text insets (EMU). */
export interface BodyTextMetrics extends TextSpacing {
  insets: { l: number; t: number; r: number; b: number };
}

export interface Theme {
  name: string;
  colors: Record<string, string>;                       // dk1, lt1, dk2, lt2, accent1..6 as #RRGGBB
  fonts: { major: string; minor: string; majorJa?: string; minorJa?: string };
}

export function parseTheme(xml: string): Theme {
  const name = xml.match(/<a:clrScheme\b[^>]*\bname="([^"]*)"/)?.[1] ?? "";
  const colors: Record<string, string> = {};
  for (const key of ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "hlink", "folHlink"]) {
    const block = xml.match(new RegExp(`<a:${key}>([\\s\\S]*?)</a:${key}>`))?.[1] ?? "";
    const v = block.match(/<a:srgbClr\b[^>]*\bval="([0-9A-Fa-f]{6})"/)?.[1] ?? block.match(/<a:sysClr\b[^>]*\blastClr="([0-9A-Fa-f]{6})"/)?.[1];
    if (v) colors[key] = `#${v.toUpperCase()}`;
  }
  const font = (scope: string) => {
    const b = xml.match(new RegExp(`<a:${scope}>([\\s\\S]*?)</a:${scope}>`))?.[1] ?? "";
    return { latin: b.match(/<a:latin\b[^>]*\btypeface="([^"]*)"/)?.[1] ?? "", ja: b.match(/<a:font\b[^>]*\bscript="Jpan"[^>]*\btypeface="([^"]*)"/)?.[1] };
  };
  const major = font("majorFont"), minor = font("minorFont");
  return { name, colors, fonts: { major: major.latin, minor: minor.latin, majorJa: major.ja, minorJa: minor.ja } };
}

export interface MasterProfile {
  id: string;
  name: string;
  importedAt: string;
  slideSize: { w: number; h: number }; // EMU
  layouts: MasterLayout[];
  /** Layout names that could not be mapped to a role. Shown to the user. */
  unmapped: string[];
  /** Roles required by the tool that the master does not provide. */
  missing: string[];
  /** Colour scheme and fonts from ppt/theme/theme1.xml, used to keep generated figures on-brand. */
  theme?: Theme;
  /** The slide master itself: decorations every layout shows (unless it hides them), background, default text colours. */
  master: { decor: Decor[]; background?: Background; titleColor?: string; bodyColor?: string };
}

export const EMU_PER_INCH = 914400;

/** Naming convention for layouts inside the master pptx. Case-insensitive. */
export function roleFromLayoutName(name: string): MasterLayout["role"] {
  const n = name.trim().toLowerCase().replace(/\s+/g, "");
  if (/^(cover|title-?slide|表紙)/.test(n)) return { kind: "cover" }; // "Title Only" / "Title and Content" are not covers
  if (/^(agenda|toc|目次)/.test(n)) return { kind: "agenda" };
  if (/^(section|chapter|中表紙|章)/.test(n)) return { kind: "section" };
  const m = n.match(/^body-?(.+)$/);
  if (m) {
    const map: Record<string, MasterBodyKind> = { text: "text", "2col": "2col", twocol: "2col" };
    const l = map[m[1]];
    return l ? { kind: "body", layout: l } : null;
  }
  return null;
}

const REQUIRED_ROLES = ["cover", "agenda", "section", "body:text"];

function attr(xml: string, tag: string, name: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}="([^"]*)"`));
  return m?.[1];
}

/** First-level default font size (pt) from a bodyStyle / lstStyle fragment, if any. */
export function parseLvl1FontPt(xml: string): number | undefined {
  const lvl = xml.match(/<a:lvl1pPr\b[^>]*>[\s\S]*?<\/a:lvl1pPr>/)?.[0];
  const sz = lvl?.match(/<a:defRPr\b[^>]*\bsz="(\d+)"/)?.[1];
  return sz ? Number(sz) / 100 : undefined;
}

function bodyPlaceholderXml(xml: string): string | undefined {
  for (const sp of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    if (/<p:ph\b(?![^>]*type="(?:title|ctrTitle|subTitle|dt|ftr|sldNum|pic)")/.test(sp[0])) return sp[0];
  }
  return undefined;
}

function parseRect(spXml: string): Rect | null {
  const off = spXml.match(/<a:off x="(-?\d+)" y="(-?\d+)"/);
  const ext = spXml.match(/<a:ext cx="(\d+)" cy="(\d+)"/);
  if (!off || !ext) return null;
  return { x: +off[1], y: +off[2], w: +ext[1], h: +ext[2] };
}

// ---- Colours -------------------------------------------------------------------------------------------------------

type RGB = [number, number, number];
const SCHEME_ALIAS: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function hexToRgb(hex: string): RGB { const n = parseInt(hex, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHsl([r, g, b]: RGB): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) / 6 : max === g ? ((b - r) / d + 2) / 6 : ((r - g) / d + 4) / 6;
  return [h, s, l];
}
function hslToRgb([h, s, l]: [number, number, number]): RGB {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t: number) => { t = (t + 1) % 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}

/**
 * A DrawingML colour (`<a:srgbClr>`, `<a:schemeClr>` through the theme, `<a:sysClr>`) with its common modifiers
 * (lumMod / lumOff / tint / shade / alpha) as a CSS colour. Undefined when nothing usable is there.
 */
export function parseColor(xml: string, theme?: Theme): string | undefined {
  const m = xml.match(/<a:(srgbClr|schemeClr|sysClr|prstClr)\b([^>]*?)(\/>|>([\s\S]*?)<\/a:\1>)/);
  if (!m) return undefined;
  const attrs = m[2], mods = m[4] ?? "";
  let hex: string | undefined;
  if (m[1] === "srgbClr") hex = attrs.match(/\bval="([0-9A-Fa-f]{6})"/)?.[1];
  else if (m[1] === "sysClr") hex = attrs.match(/\blastClr="([0-9A-Fa-f]{6})"/)?.[1];
  else if (m[1] === "schemeClr") { const v = attrs.match(/\bval="([^"]*)"/)?.[1] ?? ""; hex = theme?.colors[SCHEME_ALIAS[v] ?? v]?.slice(1); }
  else { const v = attrs.match(/\bval="([^"]*)"/)?.[1]; hex = v === "white" ? "FFFFFF" : v === "black" ? "000000" : undefined; }
  if (!hex) return undefined;
  let rgb = hexToRgb(hex);
  const pct = (tag: string) => { const v = mods.match(new RegExp(`<a:${tag}\\b[^>]*\\bval="(\\d+)"`))?.[1]; return v ? Number(v) / 100000 : undefined; };
  const lumMod = pct("lumMod"), lumOff = pct("lumOff"), tint = pct("tint"), shade = pct("shade"), alpha = pct("alpha");
  if (lumMod !== undefined || lumOff !== undefined) { const [h, s, l] = rgbToHsl(rgb); rgb = hslToRgb([h, s, clamp01(l * (lumMod ?? 1) + (lumOff ?? 0))]); }
  if (tint !== undefined) rgb = rgb.map((c) => Math.round(255 - (255 - c) * tint)) as RGB;
  if (shade !== undefined) rgb = rgb.map((c) => Math.round(c * shade)) as RGB;
  if (alpha !== undefined && alpha < 1) return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  return `#${rgb.map((c) => c.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}

/** spPr without its <a:ln> part, so the shape's fill and its outline are told apart. */
const stripLine = (spPr: string) => spPr.replace(/<a:ln\b[^>]*\/>|<a:ln\b[^>]*>[\s\S]*?<\/a:ln>/g, "");

function shapeFill(spPr: string, style: string, theme?: Theme): string | undefined {
  const body = stripLine(spPr);
  if (/<a:noFill\s*\/>/.test(body)) return undefined;
  const solid = body.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
  if (solid) return parseColor(solid, theme);
  const grad = body.match(/<a:gradFill\b[\s\S]*?<a:gs\b[^>]*>([\s\S]*?)<\/a:gs>/)?.[1];
  if (grad) return parseColor(grad, theme); // gradients: the first stop, flat
  if (/<a:blipFill|<a:pattFill/.test(body)) return undefined;
  const ref = style.match(/<a:fillRef\b[^>]*\bidx="(\d+)"[^>]*>([\s\S]*?)<\/a:fillRef>/);
  return ref && Number(ref[1]) > 0 ? parseColor(ref[2], theme) : undefined;
}

function shapeLine(spPr: string, style: string, theme?: Theme): Decor["line"] {
  const ln = spPr.match(/<a:ln\b([^>]*?)(\/>|>([\s\S]*?)<\/a:ln>)/);
  const width = Number(ln?.[1].match(/\bw="(\d+)"/)?.[1] ?? 9525);
  const inner = ln?.[3] ?? "";
  if (/<a:noFill\s*\/>/.test(inner)) return undefined;
  const solid = inner.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
  if (solid) { const color = parseColor(solid, theme); return color ? { color, width } : undefined; }
  const ref = style.match(/<a:lnRef\b[^>]*\bidx="(\d+)"[^>]*>([\s\S]*?)<\/a:lnRef>/);
  if (ref && Number(ref[1]) > 0) { const color = parseColor(ref[2], theme); return color ? { color, width } : undefined; }
  return undefined;
}

// ---- Text ----------------------------------------------------------------------------------------------------------

const decodeXml = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n))).replace(/&amp;/g, "&");

interface TextInfo { text: string; field?: Placeholder["field"]; fontPt?: number; color?: string; bold?: boolean; align?: PlaceholderStyle["align"]; anchor?: PlaceholderStyle["anchor"] }

/** Paragraph text, the field it carries, and first-run / first-level formatting of a txBody. */
function parseText(txBody: string, theme?: Theme): TextInfo {
  const lines = [...txBody.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)]
    .map((p) => [...p[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((t) => decodeXml(t[1])).join(""));
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  const fieldType = txBody.match(/<a:fld\b[^>]*\btype="([^"]*)"/)?.[1];
  const field: Placeholder["field"] = fieldType === "slidenum" ? "slidenum" : fieldType?.startsWith("datetime") ? "datetime" : undefined;
  const rPr = txBody.match(/<a:rPr\b([^>]*?)(\/>|>([\s\S]*?)<\/a:rPr>)/);
  const defRPr = txBody.match(/<a:lvl1pPr\b[^>]*>[\s\S]*?<a:defRPr\b([^>]*?)(\/>|>([\s\S]*?)<\/a:defRPr>)/);
  const endRPr = txBody.match(/<a:endParaRPr\b([^>]*)/);
  const sz = (rPr?.[1] ?? "").match(/\bsz="(\d+)"/)?.[1] ?? (defRPr?.[1] ?? "").match(/\bsz="(\d+)"/)?.[1] ?? (endRPr?.[1] ?? "").match(/\bsz="(\d+)"/)?.[1];
  const boldAttr = (rPr?.[1] ?? "").match(/\bb="(\d)"/)?.[1] ?? (defRPr?.[1] ?? "").match(/\bb="(\d)"/)?.[1];
  const colorXml = (rPr?.[3] ?? "").match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1] ?? (defRPr?.[3] ?? "").match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
  const algn = txBody.match(/<a:(?:pPr|lvl1pPr)\b[^>]*\balgn="(l|ctr|r|just)"/)?.[1];
  const anchor = txBody.match(/<a:bodyPr\b[^>]*\banchor="(t|ctr|b)"/)?.[1] as PlaceholderStyle["anchor"] | undefined;
  return {
    text: lines.join("\n"), field,
    fontPt: sz ? Number(sz) / 100 : undefined,
    color: colorXml ? parseColor(colorXml, theme) : undefined,
    bold: boldAttr === undefined ? undefined : boldAttr === "1",
    align: algn === "just" ? "l" : (algn as PlaceholderStyle["align"] | undefined),
    anchor,
  };
}

// ---- Shapes on the master / layouts ---------------------------------------------------------------------------------

/** Top-level child shapes of an spTree or group body. Groups nest, so their tags are balanced by counting. */
function childElements(inner: string): { tag: string; xml: string }[] {
  const out: { tag: string; xml: string }[] = [];
  const open = /<p:(sp|pic|cxnSp|grpSp|graphicFrame)\b[^>]*?(\/?)>/g;
  let from = 0;
  for (;;) {
    open.lastIndex = from;
    const m = open.exec(inner);
    if (!m) break;
    const tag = m[1];
    if (m[2] === "/") { out.push({ tag, xml: m[0] }); from = open.lastIndex; continue; }
    const walk = new RegExp(`<p:${tag}\\b[^>]*?(/?)>|</p:${tag}>`, "g");
    walk.lastIndex = open.lastIndex;
    let depth = 1, end = -1;
    for (let t = walk.exec(inner); t; t = walk.exec(inner)) {
      if (t[0].startsWith("</")) { if (--depth === 0) { end = walk.lastIndex; break; } }
      else if (t[1] !== "/") depth++;
    }
    if (end < 0) break;
    out.push({ tag, xml: inner.slice(m.index, end) });
    from = end;
  }
  return out;
}

type Transform = (r: Rect) => Rect;
const identity: Transform = (r) => r;

/** Decorations (non-placeholder shapes) of an spTree, flattening groups. Pictures carry their rId in `src` until resolved. */
function parseDecor(spTree: string, theme: Theme | undefined, transform: Transform = identity): Decor[] {
  const out: Decor[] = [];
  for (const { tag, xml } of childElements(spTree)) {
    if (tag === "graphicFrame") continue; // tables, charts, SmartArt: not drawn
    if (tag === "grpSp") {
      const g = xml.match(/<p:grpSpPr\b[^>]*>([\s\S]*?)<\/p:grpSpPr>/);
      const inner = xml.slice(xml.indexOf("</p:grpSpPr>") + "</p:grpSpPr>".length, xml.lastIndexOf("</p:grpSp>"));
      const off = g?.[1].match(/<a:off x="(-?\d+)" y="(-?\d+)"/), ext = g?.[1].match(/<a:ext cx="(\d+)" cy="(\d+)"/);
      const chOff = g?.[1].match(/<a:chOff x="(-?\d+)" y="(-?\d+)"/), chExt = g?.[1].match(/<a:chExt cx="(\d+)" cy="(\d+)"/);
      let t = transform;
      if (off && ext && chOff && chExt) {
        const sx = Number(chExt[1]) ? Number(ext[1]) / Number(chExt[1]) : 1, sy = Number(chExt[2]) ? Number(ext[2]) / Number(chExt[2]) : 1;
        t = (r) => transform({ x: Number(off[1]) + (r.x - Number(chOff[1])) * sx, y: Number(off[2]) + (r.y - Number(chOff[2])) * sy, w: r.w * sx, h: r.h * sy });
      }
      out.push(...parseDecor(inner, theme, t));
      continue;
    }
    if (/<p:nvPr>[\s\S]*?<p:ph\b/.test(xml)) continue; // placeholders are handled separately
    const spPr = xml.match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/)?.[1] ?? "";
    const rect = parseRect(spPr);
    if (!rect) continue;
    const rot = Number(spPr.match(/<a:xfrm\b[^>]*\brot="(-?\d+)"/)?.[1] ?? 0);
    const base: Pick<Decor, "rect" | "rotation"> = { rect: transform(rect), rotation: rot ? Math.round(rot / 60000) : undefined };
    const style = xml.match(/<p:style>([\s\S]*?)<\/p:style>/)?.[1] ?? "";
    if (tag === "pic") {
      const rId = xml.match(/<a:blip\b[^>]*\br:embed="([^"]*)"/)?.[1];
      if (rId) out.push({ kind: "image", ...base, src: rId });
      continue;
    }
    const geometry = spPr.match(/<a:prstGeom\b[^>]*\bprst="([^"]*)"/)?.[1] ?? (spPr.includes("<a:custGeom") ? "custom" : "rect");
    const fill = shapeFill(spPr, style, theme);
    const line = shapeLine(spPr, style, theme);
    const txBody = xml.match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1];
    const text = txBody ? parseText(txBody, theme) : undefined;
    if (text && text.text.trim()) {
      out.push({ kind: "text", ...base, geometry, fill, line, text: text.text, fontPt: text.fontPt, color: text.color, bold: text.bold, align: text.align, anchor: text.anchor });
    } else if (fill || line) {
      out.push({ kind: "shape", ...base, geometry: tag === "cxnSp" ? "line" : geometry, fill, line });
    }
  }
  return out;
}

function parsePlaceholders(xml: string, theme?: Theme): Placeholder[] {
  const out: Placeholder[] = [];
  for (const sp of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const ph = sp[0].match(/<p:ph\b([^>]*)\/?>/);
    if (!ph) continue;
    const type = ph[1].match(/type="([^"]*)"/)?.[1] ?? "body";
    const idx = Number(ph[1].match(/idx="(\d+)"/)?.[1] ?? 0);
    const spPr = sp[0].match(/<p:spPr\b[^>]*>([\s\S]*?)<\/p:spPr>/)?.[1] ?? "";
    const txBody = sp[0].match(/<p:txBody>([\s\S]*?)<\/p:txBody>/)?.[1];
    const text = txBody ? parseText(txBody, theme) : undefined;
    const style: PlaceholderStyle = { fill: shapeFill(spPr, "", theme), color: text?.color, fontPt: text?.fontPt, align: text?.align, anchor: text?.anchor };
    const footer = type === "dt" || type === "ftr" || type === "sldNum";
    out.push({ type, idx, rect: parseRect(sp[0]), style, text: footer ? text?.text || undefined : undefined, field: footer ? text?.field : undefined });
  }
  return out;
}

/** Fill in geometry and style for layout placeholders that inherit from the slide master. */
function inherit(layout: Placeholder[], master: Placeholder[]): Placeholder[] {
  return layout.map((p) => {
    const byIdx = master.find((m) => m.idx === p.idx && p.idx !== 0);
    const byType = master.find((m) => m.type === p.type);
    const parent = byIdx ?? byType;
    const style: PlaceholderStyle = { ...parent?.style, ...Object.fromEntries(Object.entries(p.style ?? {}).filter(([, v]) => v !== undefined)) };
    return { ...p, rect: p.rect ?? parent?.rect ?? null, style, field: p.field ?? parent?.field, text: p.text ?? parent?.text };
  });
}

// ---- Package parts -------------------------------------------------------------------------------------------------

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml", bmp: "image/bmp", webp: "image/webp" };

/** rId -> zip path for a part's relationships (targets are relative to the part's folder). */
async function readRels(zip: JSZip, partPath: string): Promise<Record<string, string>> {
  const dir = partPath.split("/").slice(0, -1);
  const rels = await zip.file(`${dir.join("/")}/_rels/${partPath.split("/").pop()}.rels`)?.async("string");
  const out: Record<string, string> = {};
  if (!rels) return out;
  for (const m of rels.matchAll(/<Relationship\b[^>]*\bId="([^"]*)"[^>]*\bTarget="([^"]*)"/g)) {
    const segs = [...dir];
    for (const s of m[2].split("/")) { if (s === "..") segs.pop(); else if (s !== ".") segs.push(s); }
    out[m[1]] = segs.join("/");
  }
  return out;
}

/** The media file as a data URL the preview can show; undefined for formats browsers do not render (emf, wmf, tiff). */
async function mediaDataUrl(zip: JSZip, path: string | undefined): Promise<string | undefined> {
  if (!path) return undefined;
  const mime = MIME[path.split(".").pop()?.toLowerCase() ?? ""];
  const f = zip.file(path);
  if (!mime || !f) return undefined;
  return `data:${mime};base64,${await f.async("base64")}`;
}

async function resolveImages(zip: JSZip, decor: Decor[], rels: Record<string, string>): Promise<Decor[]> {
  const out: Decor[] = [];
  for (const d of decor) {
    if (d.kind !== "image") { out.push(d); continue; }
    const src = await mediaDataUrl(zip, rels[d.src ?? ""]);
    if (src) out.push({ ...d, src });
  }
  return out;
}

async function parseBackground(zip: JSZip, cSld: string, rels: Record<string, string>, theme?: Theme): Promise<Background | undefined> {
  const bg = cSld.match(/<p:bg>([\s\S]*?)<\/p:bg>/)?.[1];
  if (!bg) return undefined;
  const ref = bg.match(/<p:bgRef\b[^>]*>([\s\S]*?)<\/p:bgRef>/)?.[1];
  if (ref) { const color = parseColor(ref, theme); return color ? { color } : undefined; }
  const pr = bg.match(/<p:bgPr>([\s\S]*?)<\/p:bgPr>/)?.[1] ?? "";
  const solid = pr.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
  if (solid) { const color = parseColor(solid, theme); return color ? { color } : undefined; }
  const grad = pr.match(/<a:gs\b[^>]*>([\s\S]*?)<\/a:gs>/)?.[1];
  if (grad) { const color = parseColor(grad, theme); return color ? { color } : undefined; }
  const blip = pr.match(/<a:blip\b[^>]*\br:embed="([^"]*)"/)?.[1];
  if (blip) { const image = await mediaDataUrl(zip, rels[blip]); return image ? { image } : undefined; }
  return undefined;
}

// ---- Body text metrics ----------------------------------------------------------------------------------------------

const DEFAULT_INSETS = { l: 91440, t: 45720, r: 91440, b: 45720 };
const lvl1Of = (xml: string | undefined) => xml?.match(/<a:lvl1pPr\b[^>]*>[\s\S]*?<\/a:lvl1pPr>/)?.[0];
const lstStyleOf = (sp: string | undefined) => sp?.match(/<a:lstStyle>[\s\S]*?<\/a:lstStyle>/)?.[0];

function spacingIn(lvl1: string | undefined, tag: "lnSpc" | "spcBef" | "spcAft"): Spacing | undefined {
  const block = lvl1?.match(new RegExp(`<a:${tag}>([\\s\\S]*?)</a:${tag}>`))?.[1];
  if (!block) return undefined;
  const pct = block.match(/<a:spcPct\b[^>]*\bval="(\d+)"/)?.[1];
  if (pct !== undefined) return { pct: Number(pct) / 100000 };
  const pts = block.match(/<a:spcPts\b[^>]*\bval="(\d+)"/)?.[1];
  return pts !== undefined ? { pt: Number(pts) / 100 } : undefined;
}

function insetsIn(sp: string | undefined): Partial<BodyTextMetrics["insets"]> {
  const pr = sp?.match(/<a:bodyPr\b([^>]*)>/)?.[1] ?? "";
  const n = (k: string) => { const v = pr.match(new RegExp(`\\b${k}="(\\d+)"`))?.[1]; return v === undefined ? undefined : Number(v); };
  return { l: n("lIns"), t: n("tIns"), r: n("rIns"), b: n("bIns") };
}

/** Spacing inherits layout body placeholder → master body placeholder → master bodyStyle; insets fall back to the defaults. */
export function bodyTextMetrics(layoutBody: string | undefined, masterBody: string | undefined, masterBodyStyle: string): BodyTextMetrics {
  const levels = [lvl1Of(lstStyleOf(layoutBody)), lvl1Of(lstStyleOf(masterBody)), lvl1Of(masterBodyStyle)];
  const pick = (tag: "lnSpc" | "spcBef" | "spcAft") => { for (const l of levels) { const v = spacingIn(l, tag); if (v) return v; } return undefined; };
  const li = insetsIn(layoutBody), mi = insetsIn(masterBody);
  const inset = (k: "l" | "t" | "r" | "b") => li[k] ?? mi[k] ?? DEFAULT_INSETS[k];
  return { lineSpacing: pick("lnSpc"), spaceBefore: pick("spcBef"), spaceAfter: pick("spcAft"), insets: { l: inset("l"), t: inset("t"), r: inset("r"), b: inset("b") } };
}

const spTreeOf = (xml: string) => xml.match(/<p:spTree>([\s\S]*?)<\/p:spTree>/)?.[1] ?? "";
const cSldOf = (xml: string) => xml.match(/<p:cSld\b[^>]*>([\s\S]*?)<\/p:cSld>/)?.[1] ?? "";

export async function importMaster(file: File | Blob, name: string): Promise<MasterProfile> {
  const zip = await JSZip.loadAsync(file);
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  if (!pres) throw new Error("ppt/presentation.xml が見つかりません。pptx/potx ファイルを指定してください。");
  const slideSize = { w: Number(attr(pres, "p:sldSz", "cx") ?? 12192000), h: Number(attr(pres, "p:sldSz", "cy") ?? 6858000) };

  const masterPath = "ppt/slideMasters/slideMaster1.xml";
  const masterXml = (await zip.file(masterPath)?.async("string")) ?? "";
  const themeXml = await zip.file("ppt/theme/theme1.xml")?.async("string");
  const theme = themeXml ? parseTheme(themeXml) : undefined;
  const masterPh = parsePlaceholders(masterXml, theme);
  const masterBodyPt = parseLvl1FontPt(masterXml.match(/<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/)?.[0] ?? "");
  const masterBodyStyle = masterXml.match(/<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/)?.[0] ?? "";
  const masterBodySp = bodyPlaceholderXml(masterXml);
  const masterRels = await readRels(zip, masterPath);
  const styleColor = (tag: string) => {
    const lvl = masterXml.match(new RegExp(`<p:${tag}>[\\s\\S]*?<a:lvl1pPr\\b[^>]*>[\\s\\S]*?<a:defRPr\\b[^>]*>([\\s\\S]*?)</a:defRPr>`))?.[1];
    const solid = lvl?.match(/<a:solidFill>([\s\S]*?)<\/a:solidFill>/)?.[1];
    return solid ? parseColor(solid, theme) : undefined;
  };
  const master: MasterProfile["master"] = {
    decor: await resolveImages(zip, parseDecor(spTreeOf(masterXml), theme), masterRels),
    background: await parseBackground(zip, cSldOf(masterXml), masterRels, theme),
    titleColor: styleColor("titleStyle"),
    bodyColor: styleColor("bodyStyle"),
  };

  const layoutFiles = Object.keys(zip.files).filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1]) - Number(b.match(/(\d+)/)?.[1]));
  const layouts: MasterLayout[] = [];
  for (const f of layoutFiles) {
    const xml = await zip.file(f)!.async("string");
    const lname = attr(xml, "p:cSld", "name") ?? f;
    const body = bodyPlaceholderXml(xml);
    const layoutPt = body ? parseLvl1FontPt(body.match(/<a:lstStyle>[\s\S]*?<\/a:lstStyle>/)?.[0] ?? "") : undefined;
    const rels = await readRels(zip, f);
    layouts.push({
      name: lname, file: f, role: roleFromLayoutName(lname), placeholders: inherit(parsePlaceholders(xml, theme), masterPh),
      bodyFontPt: layoutPt ?? masterBodyPt, autofit: body ? /<a:normAutofit/.test(body) : undefined,
      decor: await resolveImages(zip, parseDecor(spTreeOf(xml), theme), rels),
      background: await parseBackground(zip, cSldOf(xml), rels, theme),
      showMasterShapes: !/<p:sldLayout\b[^>]*\bshowMasterSp="0"/.test(xml),
      bodyText: body ? bodyTextMetrics(body, masterBodySp, masterBodyStyle) : undefined,
    });
  }
  const provided = new Set(layouts.filter((l) => l.role).map((l) => l.role!.kind === "body" ? `body:${l.role!.layout}` : l.role!.kind));
  return {
    id: `${name}-${Date.now().toString(36)}`,
    name,
    importedAt: new Date().toISOString(),
    slideSize,
    layouts,
    unmapped: layouts.filter((l) => !l.role).map((l) => l.name),
    missing: REQUIRED_ROLES.filter((r) => !provided.has(r)),
    theme,
    master,
  };
}

/** Find the layout for a rendered slide. Body layouts fall back to body:text. */
export function findLayout(master: MasterProfile, kind: SlideKind, layout?: MasterBodyKind): MasterLayout | undefined {
  const exact = master.layouts.find((l) => l.role?.kind === kind && (kind !== "body" || l.role?.layout === layout));
  if (exact) return exact;
  if (kind === "body") return master.layouts.find((l) => l.role?.kind === "body" && l.role.layout === "text");
  return undefined;
}

/** Estimate how many body lines fit in a body placeholder at a given point size. */
export function lineCapacity(rect: Rect | null, fontPt = 18, lineSpacing = 1.3): number | undefined {
  if (!rect) return undefined;
  const heightPt = (rect.h / EMU_PER_INCH) * 72;
  return Math.max(3, Math.floor(heightPt / (fontPt * lineSpacing)));
}
