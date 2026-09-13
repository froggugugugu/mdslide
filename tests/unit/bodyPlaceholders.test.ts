import { describe, expect, it } from "vitest";
import { bodyPlaceholders, type Placeholder } from "../../src/master/importMaster";

const ph = (type: string, idx: number, x: number, y: number, w: number, h: number): Placeholder =>
  ({ type, idx, rect: { x, y, w, h }, style: {} }) as Placeholder;
const idx = (phs: Placeholder[]) => phs.map((p) => p.idx);

describe("bodyPlaceholders: the body boxes the preview, the fit estimate and the exporter all use", () => {
  it("takes the largest body-like placeholder, so a caption box does not win over the content box", () => {
    // Office's "Content with Caption": the content (obj) and a narrower caption (body) beside the title
    const phs = [ph("title", 0, 457200, 273050, 3008313, 1162050), ph("obj", 1, 3575050, 273050, 5111750, 5853113), ph("body", 2, 457200, 1435100, 3008313, 4691063)];
    expect(idx(bodyPlaceholders(phs))).toEqual([1]);
  });

  it("gives the two largest for two columns, the left column first", () => {
    // Office's "Comparison": small headings (body) above the two content boxes (obj)
    const phs = [ph("title", 0, 0, 0, 100, 10), ph("body", 1, 0, 20, 50, 5), ph("obj", 4, 60, 30, 50, 60), ph("body", 3, 60, 20, 50, 5), ph("obj", 2, 0, 30, 50, 60)];
    expect(idx(bodyPlaceholders(phs, { count: 2 }))).toEqual([2, 4]);
  });

  it("keeps the XML order between boxes of the same size", () => {
    expect(idx(bodyPlaceholders([ph("obj", 3, 0, 0, 10, 10), ph("body", 1, 20, 0, 10, 10)]))).toEqual([3]);
  });

  it("uses the subtitle on a cover first; elsewhere a subtitle is only the last resort", () => {
    const phs = [ph("ctrTitle", 0, 0, 0, 100, 30), ph("body", 5, 0, 60, 100, 40), ph("subTitle", 1, 10, 40, 80, 15)];
    expect(idx(bodyPlaceholders(phs, { cover: true }))).toEqual([1]);
    expect(idx(bodyPlaceholders(phs))).toEqual([5]);
    expect(idx(bodyPlaceholders([ph("title", 0, 0, 0, 100, 30), ph("subTitle", 1, 10, 40, 80, 15)]))).toEqual([1]);
  });

  it("ignores titles, date / footer / slide number, pictures and placeholders without geometry", () => {
    const phs = [ph("title", 0, 0, 0, 999, 999), ph("dt", 10, 0, 0, 999, 999), ph("sldNum", 12, 0, 0, 999, 999), ph("pic", 7, 0, 0, 999, 999),
      { type: "obj", idx: 9, rect: null, style: {} } as unknown as Placeholder, ph("obj", 1, 0, 0, 10, 10)];
    expect(idx(bodyPlaceholders(phs))).toEqual([1]);
  });
});
