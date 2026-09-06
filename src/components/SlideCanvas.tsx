import { useEffect, useRef, useState, type ReactNode } from "react";
import type { RenderedSlide } from "../model/types";
import { BODY_PRESETS, KIND_PRESETS, type PresetLayout, type Region } from "../layouts/presets";
import { findLayout, type MasterProfile } from "../master/importMaster";
import { useDeckStore } from "../store/deckStore";
import { contentArea, placeImage, toCss, type Frame } from "../layouts/geometry";

/** Resolve a markdown image path to something an <img> can show. */
function useImageSrc(src: string): string | null {
  const resolved = useDeckStore((s) => s.imageUrls[src]);
  const resolve = useDeckStore((s) => s.resolveImage);
  useEffect(() => { if (src) resolve(src); }, [src, resolve]);
  if (!src) return null;
  if (/^(https?:|data:|blob:)/.test(src)) return src;
  return resolved ?? null;
}

function SlideImage({ alt, src, captionSize }: { alt: string; src: string; captionSize: number }) {
  const url = useImageSrc(src);
  const setImageDims = useDeckStore((s) => s.setImageDims);
  const missing = !src;
  const [failed, setFailed] = useState(false);
  return (
    <>
      {url && !failed ? <img src={url} alt={alt} onError={() => setFailed(true)}
        onLoad={(e) => { const im = e.currentTarget; if (im.naturalWidth) setImageDims(src, im.naturalWidth, im.naturalHeight); }} /> : null}
      <span style={{ position: "absolute", bottom: "0.4em", fontSize: captionSize, color: missing || failed ? "var(--warn)" : "inherit" }}>
        {missing ? `未挿入: ${alt.replace(/^TODO\s*/i, "") || "画像"}` : failed || (url === null && src) ? `見つかりません: ${src}` : alt || src}
      </span>
    </>
  );
}

interface Props {
  slide: RenderedSlide;
  master?: MasterProfile;
  /** Extra class for the outer box (size is controlled by the parent). */
  className?: string;
}

function regionsFor(slide: RenderedSlide, master?: MasterProfile): PresetLayout {
  const preset = slide.kind === "body" ? BODY_PRESETS[slide.layout.kind === "2col" ? "2col" : "text"] : KIND_PRESETS[slide.kind];
  if (!master) return preset;
  const layout = findLayout(master, slide.kind, slide.layout.kind === "2col" ? "2col" : "text");
  if (!layout) return preset;
  const { w, h } = master.slideSize;
  const toRegion = (type: string[], nth = 0): Region | undefined => {
    const ph = layout.placeholders.filter((p) => type.includes(p.type) && p.rect)[nth];
    return ph?.rect ? { x: ph.rect.x / w, y: ph.rect.y / h, w: ph.rect.w / w, h: ph.rect.h / h } : undefined;
  };
  return {
    title: toRegion(["title", "ctrTitle"]) ?? preset.title,
    body: toRegion(["body", "subTitle", "obj"]) ?? preset.body,
    body2: toRegion(["body", "obj"], 1) ?? preset.body2,
    image: toRegion(["pic"]) ?? preset.image,
  };
}

function inline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**")) return <strong key={i}>{p.slice(2, -2)}</strong>;
    if (p.startsWith("`")) return <code key={i}>{p.slice(1, -1)}</code>;
    return p;
  });
}

/** Minimal markdown: bullets with indentation, paragraphs, bold, code. Enough for report decks. */
export function BodyText({ lines }: { lines: string[] }) {
  const out: ReactNode[] = [];
  let list: { level: number; text: string }[] = [];
  const flushList = () => {
    if (!list.length) return;
    out.push(<ul key={out.length}>{list.map((it, i) => <li key={i} style={{ marginLeft: `${it.level * 1.2}em` }}>{inline(it.text)}</li>)}</ul>);
    list = [];
  };
  let table: string[][] = [];
  const flushTable = () => {
    if (!table.length) return;
    const [head, ...rows] = table;
    out.push(
      <table key={out.length} style={{ borderCollapse: "collapse", width: "100%", marginBottom: "0.4em" }}>
        <thead><tr>{head.map((c, i) => <th key={i} style={{ textAlign: "left", borderBottom: "0.08em solid var(--ink)", padding: "0.1em 0.3em" }}>{inline(c)}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ borderBottom: "0.04em solid var(--line)", padding: "0.1em 0.3em" }}>{inline(c)}</td>)}</tr>)}</tbody>
      </table>,
    );
    table = [];
  };
  for (const line of lines) {
    const row = parseTableRow(line);
    if (row) { flushList(); if (!/^\s*\|?\s*:?-+/.test(line)) table.push(row); continue; }
    flushTable();
    const m = line.match(/^(\s*)[-*+]\s+(.*)$/);
    if (m) { list.push({ level: Math.floor(m[1].length / 2), text: m[2] }); continue; }
    flushList();
    if (line.trim()) out.push(<p key={out.length}>{inline(line)}</p>);
  }
  flushList();
  flushTable();
  return <>{out}</>;
}

/** "| a | b |" -> ["a","b"]; null if not a table row. Separator rows return their cells too (caller drops them). */
export function parseTableRow(line: string): string[] | null {
  const t = line.trim();
  if (!t.startsWith("|") || !t.endsWith("|") || t.length < 2) return null;
  return t.slice(1, -1).split("|").map((c) => c.trim());
}

const pct = (r: Region) => ({ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });

export function SlideCanvas({ slide, master, className = "" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const aspect = master ? master.slideSize.w / master.slideSize.h : 16 / 9;
  const regions = regionsFor(slide, master);
  const unit = width / 100; // 1 unit = 1% of slide width
  const slideWidthPt = (master?.slideSize.w ?? 12192000) / 12700;
  const bodyPx = slide.fontPt ? (slide.fontPt / slideWidthPt) * width : unit * 1.6;
  const isSplitBody = slide.kind === "body" && slide.layout.kind === "2col";
  const [col1, col2] = isSplitBody ? splitColumns(slide.body) : [slide.body, []];
  const imageLayout = slide.kind === "body" && slide.layout.kind === "image" ? slide.layout : null;
  const imageSrc = slide.images[0]?.src ?? "";
  const dims = useDeckStore((s) => s.imageDims[imageSrc]);
  // Image slides: geometry is computed, not taken from the master. Only the title block comes from the master.
  const titleFrame: Frame = { x: regions.title.x, y: regions.title.y / aspect, w: regions.title.w, h: regions.title.h / aspect };
  const content = contentArea(titleFrame.y + titleFrame.h, aspect);
  const placement = imageLayout ? placeImage(imageLayout, content, dims ? dims.w / dims.h : undefined) : null;
  const bodyStyle = placement ? (placement.body ? toCss(placement.body, aspect) : null) : regions.body ? pct(regions.body) : null;

  return (
    <div ref={ref} className={`slide-canvas ${className}`} style={{ aspectRatio: `${aspect}`, fontSize: unit * 1.6 }}>
      <div className="region" style={{ ...pct(regions.title), fontSize: unit * (slide.kind === "cover" ? 4.2 : slide.kind === "section" ? 3.6 : 2.6), fontWeight: 600, lineHeight: 1.2, letterSpacing: "-0.01em" }}>
        {slide.displayTitle}
      </div>
      {slide.kind === "agenda" && slide.agenda && regions.body && (
        <div className="region" style={{ ...pct(regions.body), fontSize: unit * 2.2, lineHeight: 1.9 }}>
          {slide.agenda.items.map((it) => (
            <div key={it.number + it.title} style={{ color: slide.agenda?.current && slide.agenda.current !== it.number ? "var(--muted)" : "inherit", fontWeight: slide.agenda?.current === it.number ? 600 : 400 }}>
              {it.number ? `${it.number}. ` : ""}{it.title}
            </div>
          ))}
        </div>
      )}
      {slide.kind !== "agenda" && bodyStyle && col1.length > 0 && (
        <div className="region" style={{ ...bodyStyle, lineHeight: 1.2, fontSize: bodyPx }}><BodyText lines={col1} /></div>
      )}
      {placement && !placement.body && col1.length > 0 && (
        <div className="region" style={{ left: "5%", bottom: "2%", width: "90%", color: "var(--warn)", fontSize: unit * 1.3 }}>本文の置き場がありません。画像幅を 3/4 か 1/2 にしてください</div>
      )}
      {regions.body2 && col2.length > 0 && (
        <div className="region" style={{ ...pct(regions.body2), lineHeight: 1.2, fontSize: bodyPx }}><BodyText lines={col2} /></div>
      )}
      {placement && (
        <div className="region image" style={toCss(placement.image, aspect)}>
          {slide.images[0] ? <SlideImage alt={slide.images[0].alt} src={slide.images[0].src} captionSize={unit * 1.3} /> : <span>画像を挿入</span>}
        </div>
      )}
    </div>
  );
}

/** For 2col: split at the first blank line; otherwise halve the list. */
function splitColumns(lines: string[]): [string[], string[]] {
  const gap = lines.findIndex((l) => l.trim() === "");
  if (gap > 0) return [lines.slice(0, gap), lines.slice(gap + 1)];
  const mid = Math.ceil(lines.length / 2);
  return [lines.slice(0, mid), lines.slice(mid)];
}
