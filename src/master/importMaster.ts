import JSZip from "jszip";
import type { SlideKind } from "../model/types";

/** Body layouts that must exist in the master. Image slides use Body-Text plus a free picture shape. */
export type MasterBodyKind = "text" | "2col";

/** EMU rectangle as stored in OOXML. */
export interface Rect { x: number; y: number; w: number; h: number }

export interface Placeholder {
  /** OOXML ph type: title, body, pic, ctrTitle, subTitle, dt, ftr, sldNum, or "" (body by default). */
  type: string;
  idx: number;
  rect: Rect | null;
}

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
}

export interface Theme {
  name: string;
  colors: Record<string, string>;                       // dk1, lt1, dk2, lt2, accent1..6 as #RRGGBB
  fonts: { major: string; minor: string; majorJa?: string; minorJa?: string };
}

export function parseTheme(xml: string): Theme {
  const name = xml.match(/<a:clrScheme\b[^>]*\bname="([^"]*)"/)?.[1] ?? "";
  const colors: Record<string, string> = {};
  for (const key of ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6"]) {
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

function parsePlaceholders(xml: string): Placeholder[] {
  const out: Placeholder[] = [];
  for (const sp of xml.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
    const ph = sp[0].match(/<p:ph\b([^>]*)\/?>/);
    if (!ph) continue;
    const type = ph[1].match(/type="([^"]*)"/)?.[1] ?? "body";
    const idx = Number(ph[1].match(/idx="(\d+)"/)?.[1] ?? 0);
    out.push({ type, idx, rect: parseRect(sp[0]) });
  }
  return out;
}

/** Fill in geometry for layout placeholders that inherit from the slide master. */
function inherit(layout: Placeholder[], master: Placeholder[]): Placeholder[] {
  return layout.map((p) => {
    if (p.rect) return p;
    const byIdx = master.find((m) => m.idx === p.idx && p.idx !== 0);
    const byType = master.find((m) => m.type === p.type);
    return { ...p, rect: (byIdx ?? byType)?.rect ?? null };
  });
}

export async function importMaster(file: File | Blob, name: string): Promise<MasterProfile> {
  const zip = await JSZip.loadAsync(file);
  const pres = await zip.file("ppt/presentation.xml")?.async("string");
  if (!pres) throw new Error("ppt/presentation.xml が見つかりません。pptx/potx ファイルを指定してください。");
  const slideSize = { w: Number(attr(pres, "p:sldSz", "cx") ?? 12192000), h: Number(attr(pres, "p:sldSz", "cy") ?? 6858000) };

  const masterXml = (await zip.file("ppt/slideMasters/slideMaster1.xml")?.async("string")) ?? "";
  const masterPh = parsePlaceholders(masterXml);
  const themeXml = await zip.file("ppt/theme/theme1.xml")?.async("string");
  const theme = themeXml ? parseTheme(themeXml) : undefined;
  const masterBodyPt = parseLvl1FontPt(masterXml.match(/<p:bodyStyle>[\s\S]*?<\/p:bodyStyle>/)?.[0] ?? "");

  const layoutFiles = Object.keys(zip.files).filter((f) => /^ppt\/slideLayouts\/slideLayout\d+\.xml$/.test(f))
    .sort((a, b) => Number(a.match(/(\d+)/)?.[1]) - Number(b.match(/(\d+)/)?.[1]));
  const layouts: MasterLayout[] = [];
  for (const f of layoutFiles) {
    const xml = await zip.file(f)!.async("string");
    const lname = attr(xml, "p:cSld", "name") ?? f;
    const body = bodyPlaceholderXml(xml);
    const layoutPt = body ? parseLvl1FontPt(body.match(/<a:lstStyle>[\s\S]*?<\/a:lstStyle>/)?.[0] ?? "") : undefined;
    layouts.push({
      name: lname, file: f, role: roleFromLayoutName(lname), placeholders: inherit(parsePlaceholders(xml), masterPh),
      bodyFontPt: layoutPt ?? masterBodyPt, autofit: body ? /<a:normAutofit/.test(body) : undefined,
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
