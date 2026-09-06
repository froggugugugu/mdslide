import { Decoration, EditorView, WidgetType, type DecorationSet } from "@codemirror/view";
import { RangeSetBuilder, StateEffect, StateField } from "@codemirror/state";
import type { RenderedSlide } from "../model/types";

/**
 * Visual guides derived from the rendered deck:
 *  - a separator line above every slide heading (accent for the selected slide)
 *  - a gauge line under every body heading: estimated lines used / capacity, font size, split count
 *  - a marker line where auto-split cuts a body
 * The data comes from the store; the editor only draws.
 */
export interface GuideData {
  slides: RenderedSlide[];
  selectedId: string | null;
  /** Source line -> markdown line index of the first line of each continuation chunk (from render). */
}

export const setGuides = StateEffect.define<GuideData>();

class GaugeWidget extends WidgetType {
  constructor(readonly used: number, readonly capacity: number, readonly fontPt: number, readonly parts: number, readonly images: number, readonly notes: number, readonly explicitSize: boolean) { super(); }
  eq(o: GaugeWidget) { return o.used === this.used && o.capacity === this.capacity && o.fontPt === this.fontPt && o.parts === this.parts && o.images === this.images && o.notes === this.notes && o.explicitSize === this.explicitSize; }
  toDOM() {
    const el = document.createElement("div");
    const ratio = this.capacity ? this.used / this.capacity : 0;
    const state = ratio > 1 ? "over" : ratio > 0.9 ? "near" : "";
    el.className = `cm-gauge ${state}`;
    const text = document.createElement("span"); text.className = "cm-gauge-text";
    const bits = [`本文 ${Math.ceil(this.used)} / ${this.capacity} 行`, `${this.fontPt}pt${this.explicitSize ? "" : "（既定）"}`];
    if (this.parts > 1) bits.push(`→ ${this.parts} 枚に分割`);
    if (this.images) bits.push(`画像 ${this.images}`);
    if (this.notes) bits.push("ノート");
    text.textContent = bits.join(" · ");
    el.append(text);
    // The meter appears only when the slide is nearly full or over: a grey bar under every heading reads as one more separator.
    if (state) {
      const bar = document.createElement("span"); bar.className = "cm-gauge-bar";
      const fill = document.createElement("span"); fill.className = "cm-gauge-fill"; fill.style.width = `${Math.min(100, ratio * 100)}%`;
      bar.appendChild(fill);
      el.append(bar);
    }
    return el;
  }
  ignoreEvent() { return true; }
}

class SplitWidget extends WidgetType {
  constructor(readonly index: number, readonly total: number) { super(); }
  eq(o: SplitWidget) { return o.index === this.index && o.total === this.total; }
  toDOM() {
    const el = document.createElement("div");
    el.className = "cm-split";
    el.textContent = `自動分割 ${this.index}/${this.total}`;
    return el;
  }
  ignoreEvent() { return true; }
}

// One kind of separator above every slide heading (chapters and bodies alike); the selected slide's is accent-colored.
const sep = Decoration.line({ class: "cm-slide-sep" });
const selectedSep = Decoration.line({ class: "cm-slide-sep cm-slide-sep-selected" });

/** Find where each continuation chunk starts in the document: the first line of chunk i after the heading. */
export function splitLines(doc: { lines: number; line(n: number): { text: string } }, headingLine0: number, chunks: string[][]): number[] {
  const out: number[] = [];
  let cursor = headingLine0 + 2; // 1-based line after the heading
  for (let c = 1; c < chunks.length; c++) {
    const first = chunks[c][0];
    for (let n = Math.max(cursor, headingLine0 + 2); n <= doc.lines; n++) {
      if (doc.line(n).text === first) { out.push(n); cursor = n + 1; break; }
    }
  }
  return out;
}

export function buildGuides(view: EditorView, data: GuideData): DecorationSet {
  const doc = view.state.doc;
  const builder = new RangeSetBuilder<Decoration>();
  // group rendered slides by block
  const byBlock = new Map<string, RenderedSlide[]>();
  for (const s of data.slides) if (s.blockId) { const a = byBlock.get(s.blockId) ?? []; a.push(s); byBlock.set(s.blockId, a); }
  const items: { line: number; deco: Decoration; kind: number }[] = [];
  for (const [, parts] of byBlock) {
    const first = parts[0];
    const line0 = first.sourceLine ?? 0;
    if (line0 + 1 > doc.lines) continue;
    const selected = parts.some((p) => p.id === data.selectedId);
    items.push({ line: line0 + 1, deco: selected ? selectedSep : sep, kind: 0 });
    if (first.kind === "body" && first.fit) {
      const used = parts.reduce((n, p) => n + (p.fit?.used ?? 0), 0);
      const explicit = /\{[^}]*\bsize=/.test(doc.line(line0 + 1).text);
      const w = new GaugeWidget(used, first.fit.capacity, first.fontPt ?? 18, parts.length, first.images.length, first.notes.length, explicit);
      items.push({ line: line0 + 1, deco: Decoration.widget({ widget: w, block: true, side: 1 }), kind: 1 });
      if (parts.length > 1) {
        const starts = splitLines(doc, line0, parts.map((p) => p.body));
        starts.forEach((n, i) => items.push({ line: n, deco: Decoration.widget({ widget: new SplitWidget(i + 2, parts.length), block: true, side: -1 }), kind: 2 }));
      }
    }
  }
  // RangeSetBuilder needs (from, startSide) order; positions can collide when the deck data is a keystroke behind the doc.
  const ranges = items
    .filter((it) => it.line >= 1 && it.line <= doc.lines)
    .map((it) => { const l = doc.line(it.line); const pos = it.kind === 1 ? l.to : l.from; return { pos, deco: it.deco }; })
    .sort((a, b) => a.pos - b.pos || a.deco.startSide - b.deco.startSide);
  for (const r of ranges) builder.add(r.pos, r.pos, r.deco);
  return builder.finish();
}

export const guidesField = StateField.define<{ data: GuideData | null; decos: DecorationSet }>({
  create: () => ({ data: null, decos: Decoration.none }),
  update(value, tr) {
    let data = value.data;
    for (const e of tr.effects) if (e.is(setGuides)) data = e.value;
    if (data === value.data && !tr.docChanged) return value;
    return { data, decos: value.decos }; // decorations are rebuilt by the view plugin below
  },
});

/** Rebuild decorations from the field's data on every relevant update. Kept separate so the doc position mapping is exact. */
export const guidesView = EditorView.decorations.compute([guidesField, "doc"], (state) => {
  const f = state.field(guidesField);
  if (!f.data) return Decoration.none;
  return buildGuides({ state } as EditorView, f.data);
});

export const guides = [guidesField, guidesView];
