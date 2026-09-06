import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { guides, setGuides, splitLines } from "../../src/components/editorGuides";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";

const many = Array.from({ length: 40 }, (_, i) => `- 項目${i}`);
const MD = `---\ntitle: T\n---\n\n# 章\n\n## 短い {size=24}\n\n- a\n\n![x](images/x.png)\n\n> note: n\n\n## 長い\n\n${many.join("\n")}\n`;

function mk(doc: string) {
  const parent = document.createElement("div"); document.body.appendChild(parent);
  return new EditorView({ state: EditorState.create({ doc, extensions: [guides] }), parent });
}

describe("editor guides", () => {
  it("draws separators, gauges and split markers from the rendered deck", () => {
    const slides = renderDeck(parseMarkdown(MD));
    const v = mk(MD);
    expect(v.dom.querySelectorAll(".cm-gauge")).toHaveLength(0);
    v.dispatch({ effects: setGuides.of({ slides, selectedId: slides.find((s) => s.title === "短い")!.id }) });
    const seps = v.dom.querySelectorAll(".cm-slide-sep");
    expect(seps.length).toBe(3);                                  // 章, 短い, 長い
    expect(v.dom.querySelectorAll(".cm-slide-sep-section")).toHaveLength(1);
    expect(v.dom.querySelectorAll(".cm-slide-sep-selected")).toHaveLength(1);
    const gauges = [...v.dom.querySelectorAll(".cm-gauge")];
    expect(gauges).toHaveLength(2);                               // body slides only
    expect(gauges[0].textContent).toMatch(/本文 1 \/ \d+ 行 · 24pt · 画像 1 · ノート/);
    expect(gauges[1].textContent).toMatch(/18pt（既定） · → \d+ 枚に分割/);
    expect(gauges[1].className).toContain("over");
    // jsdom has no layout, so CodeMirror only materialises part of the document; read the decorations instead
    const splits: string[] = [];
    for (const src of v.state.facet(EditorView.decorations)) {
      const set = typeof src === "function" ? src(v) : src;
      const it = set.iter();
      while (it.value) { const w = (it.value.spec as { widget?: { toDOM(): HTMLElement } }).widget; if (w) { const el = w.toDOM(); if (el.className === "cm-split") splits.push(el.textContent!); } it.next(); }
    }
    const total = slides.filter((s) => s.title === "長い").length;
    expect(splits).toEqual(Array.from({ length: total - 1 }, (_, i) => `自動分割 ${i + 2}/${total}`));
    // the marker sits on the first line of the second chunk
    const second = slides.filter((s) => s.title === "長い")[1].body[0];
    const line = MD.split("\n").indexOf(second) + 1;
    expect(splitLines(v.state.doc, slides.find((s) => s.title === "長い")!.sourceLine!, slides.filter((s) => s.title === "長い").map((s) => s.body))[0]).toBe(line);
  });
  it("survives edits that move headings and ignores stale positions", () => {
    const slides = renderDeck(parseMarkdown(MD));
    const v = mk(MD);
    v.dispatch({ effects: setGuides.of({ slides, selectedId: null }) });
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "## x\n" } }); // shorter doc, stale lines
    expect(v.dom.querySelectorAll(".cm-gauge").length).toBeLessThanOrEqual(1);
    const fresh = renderDeck(parseMarkdown("## x\n"));
    v.dispatch({ effects: setGuides.of({ slides: fresh, selectedId: null }) });
    expect(v.dom.querySelectorAll(".cm-slide-sep")).toHaveLength(1);
  });
});

describe("guides under edits", () => {
  it("never throws when the deck data lags behind the document (positions collide)", () => {
    const slides = renderDeck(parseMarkdown(MD));
    const v = mk(MD);
    v.dispatch({ effects: setGuides.of({ slides, selectedId: null }) });
    // delete most of the document so several stale source lines map onto the same remaining lines
    expect(() => v.dispatch({ changes: { from: 5, to: v.state.doc.length - 3, insert: "" } })).not.toThrow();
    expect(() => v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: "## a\n## b\n" } })).not.toThrow();
  });
});
