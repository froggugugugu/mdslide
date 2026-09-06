import { describe, expect, it, vi } from "vitest";
import { buildExport, download } from "../../src/export/exportJson";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";
import type { MasterProfile } from "../../src/master/importMaster";

const md = `---\ntitle: T\n---\n\n# S\n\n## A {img=1/2 side=left}\n\n- x\n\n![f](images/f.png)\n\n## B {img=1/1}\n\n![g](images/g.png)\n\n## C {layout=2col}\n\n- l\n\n- r\n`;

const master: MasterProfile = {
  id: "m", name: "m", importedAt: "", slideSize: { w: 12192000, h: 6858000 }, unmapped: [], missing: [],
  layouts: [
    { name: "Cover", file: "", role: { kind: "cover" }, placeholders: [] },
    { name: "Agenda", file: "", role: { kind: "agenda" }, placeholders: [] },
    { name: "Section", file: "", role: { kind: "section" }, placeholders: [] },
    { name: "Body-Text", file: "", role: { kind: "body", layout: "text" }, placeholders: [{ type: "title", idx: 0, rect: { x: 609600, y: 365125, w: 10972800, h: 1325563 } }] },
  ],
};

describe("buildExport", () => {
  it("emits v2 with resolved master layouts and geometry", () => {
    const deck = parseMarkdown(md);
    const slides = renderDeck(deck);
    const out = buildExport(deck, slides, master, { "images/f.png": { w: 100, h: 200 } });
    expect(out.version).toBe(2);
    expect(out.slideSize).toEqual(master.slideSize);
    expect(out.slides.map((s) => s.masterLayout)).toEqual(["Cover", "Agenda", "Section", "Body-Text", "Body-Text", "Body-Text"]);
    const a = out.slides[3];
    expect(a.layout).toBe("image");
    expect(a.geometry!.side).toBe("left");
    // image box on the left, body to its right with a gap, both below the master title
    const titleBottom = 365125 + 1325563;
    expect(a.geometry!.imageBox.y).toBeGreaterThan(titleBottom);
    expect(a.geometry!.body!.x).toBeGreaterThan(a.geometry!.imageBox.x + a.geometry!.imageBox.w);
    expect(a.geometry!.gap).toBe(Math.round(0.03 * 12192000));
    const b = out.slides[4];
    expect(b.geometry!.body).toBeNull();
    expect(b.geometry!.imageBox.w).toBe(Math.round(0.9 * 12192000));
    expect(out.slides[5].layout).toBe("2col");
    expect(out.slides[5].geometry).toBeUndefined();
    expect(out.master!.layouts.map((l) => l.name)).toContain("Body-Text");
  });
  it("works without a master using default size and title", () => {
    const deck = parseMarkdown(md);
    const out = buildExport(deck, renderDeck(deck), undefined, {});
    expect(out.slideSize).toEqual({ w: 12192000, h: 6858000 });
    expect(out.master).toBeNull();
    expect(out.slides.every((s) => s.masterLayout === null)).toBe(true);
    expect(out.slides[3].geometry!.imageBox.y).toBeGreaterThan(0);
  });
});

describe("download", () => {
  it("creates and clicks an anchor", () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    download("a.json", "{}");
    download("b.bin", new Blob([new Uint8Array([1])]));
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });
});
