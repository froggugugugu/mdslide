import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { bodyPlaceholders, findLayout, importMaster, type MasterProfile } from "../../src/master/importMaster";
import { bodyBoxFor, bodyOverlaps, contentBand, SAFE_GAP } from "../../src/model/boxes";
import { lineHeightPt } from "../../src/model/fit";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";
import { buildExport } from "../../src/export/exportJson";
import type { BodyLayout } from "../../src/model/types";
import { decoratedMaster } from "../helpers/decoratedMaster";

// Widths come from each master (the sample is 12191695 EMU wide, not exactly 12192000).
const sample = () => importMaster(new Blob([readFileSync("examples/sample-master.pptx")]), "sample");
const deco = async () => importMaster(await decoratedMaster(), "deco");
const bodyRect = (m: MasterProfile, kind: "text" | "2col" = "text") =>
  findLayout(m, "body", kind)!.placeholders.find((p) => (p.type === "body" || p.type === "obj") && p.rect)!.rect!;

describe("contentBand: where body content may go", () => {
  it("stops below a header band and above the highest shape of the footer, keeping a small gap", async () => {
    const m = await deco();
    const W = m.slideSize.w;
    const band = contentBand(m)!;
    expect(band.headerBottom).toBeCloseTo(228600 / W, 6);         // the accent bar across the top
    expect(band.top).toBeCloseTo(228600 / W + SAFE_GAP, 6);
    expect(band.footerTop).toBeCloseTo(6096000 / W, 6);           // the logo; the grouped dot in the middle is ignored
    expect(band.bottom).toBeCloseTo(6096000 / W - SAFE_GAP, 6);
  });
  it("falls back to the footer placeholders, and leaves out the master's shapes when the layout hides them", async () => {
    const s = await sample();
    const plain = contentBand(s)!;
    expect(plain.headerBottom).toBeUndefined();
    expect(plain.top).toBe(0);
    expect(plain.footerTop).toBeCloseTo(6356350 / s.slideSize.w, 6); // date / footer / slide number
    const m = await deco();
    const hidden = { ...m, layouts: m.layouts.map((l) => (l.name === "Body-Text" ? { ...l, showMasterShapes: false } : l)) };
    expect(contentBand(hidden)!.headerBottom).toBeUndefined();   // the bar was the master's
    expect(contentBand(hidden)!.footerTop).toBeCloseTo(6356350 / m.slideSize.w, 6);
    expect(contentBand(undefined)).toBeUndefined();
  });
});

describe("bodyBoxFor: the box the fit estimate uses", () => {
  it("text slides: the placeholder cut off above the footer, minus its insets, with the master's paragraph spacing", async () => {
    const m = await deco();
    const r = bodyRect(m);
    const bottom = Math.min(r.y + r.h, contentBand(m)!.bottom * m.slideSize.w);
    expect(bottom).toBeLessThan(r.y + r.h);                                // this placeholder runs under the logo
    const box = bodyBoxFor(m, { kind: "text" });
    expect(box.heightPt).toBeCloseTo((bottom - r.y) / 12700 - 7.2, 3);    // top + bottom insets: 0.1in = 7.2pt
    expect(box.widthPt).toBeCloseTo(r.w / 12700 - 14.4, 3);
    expect(box.text).toEqual({ spaceBefore: { pct: 0.2 } });
  });
  it("without a master nothing changes: no insets, no spacing", () => {
    expect(bodyBoxFor(undefined, { kind: "text" }).text).toBeUndefined();
  });
  it("image slides keep their content inside the band, in the app and in deck.json", async () => {
    const m = await deco();
    const limit = Math.round(contentBand(m)!.bottom * m.slideSize.w);
    const deck = parseMarkdown("## I {img=1/2 side=right}\n\n- a\n\n![x](images/x.png)\n");
    const slides = renderDeck(deck, { bodyBox: (l: BodyLayout, a?: number) => bodyBoxFor(m, l, a) });
    const g = buildExport(deck, slides, m, {}).slides.find((s) => s.geometry)!.geometry!;
    expect(g.contentBottom).toBeLessThanOrEqual(limit + 1);
    expect(g.imageBox.y + g.imageBox.h).toBeLessThanOrEqual(limit + 1);
  });
});

describe("the fit estimate splits where PowerPoint runs out of room", () => {
  it("counts the master's paragraph spacing, so fewer bullets fit than at a plain 1.2 line height", async () => {
    const m = await sample();
    const box = bodyBoxFor(m, { kind: "text" });
    const capacity = Math.floor(box.heightPt / lineHeightPt(18, box.text));
    const fits = Math.floor(capacity / 1.2 + 1e-9);                       // each bullet: one line plus 20% of a line before it
    const deck = (n: number) => parseMarkdown(`## L\n\n${Array.from({ length: n }, (_, i) => `- line ${i}`).join("\n")}\n`);
    const opts = { bodyBox: (l: BodyLayout, a?: number) => bodyBoxFor(m, l, a), masterFontPt: 18 };
    expect(renderDeck(deck(fits), opts).filter((s) => s.title === "L")).toHaveLength(1);
    expect(renderDeck(deck(fits + 1), opts).filter((s) => s.title === "L")).toHaveLength(2);
    expect(fits).toBeLessThan(Math.floor(bodyRect(m).h / 12700 / 21.6)); // the old estimate let more lines in
  });
});

describe("bodyOverlaps: a warning for masters whose body box runs into the header or footer", () => {
  it("flags only the masters that really overlap, and names the layouts", async () => {
    const d = bodyOverlaps(await deco());
    expect(d.header).toEqual([]);
    expect(d.footer).toContain("Body-Text");
    expect(bodyOverlaps(await sample())).toEqual({ header: [], footer: [] });
    expect(bodyOverlaps(await importMaster(new Blob([readFileSync("examples/decorated-master.pptx")]), "d"))).toEqual({ header: [], footer: [] });
  });

  it("checks the agenda and section boxes against their own layout's header and footer", async () => {
    const m = await sample();
    const W = m.slideSize.w;
    const band = { kind: "shape", rect: { x: 0, y: 0, w: W, h: 502920 } } as unknown as MasterProfile["master"]["decor"][number];
    const moved = (role: string, rect: { x: number; y: number; w: number; h: number }, extra: Partial<MasterProfile["layouts"][number]> = {}) =>
      m.layouts.map((l) => (l.role?.kind === role
        ? { ...l, ...extra, placeholders: l.placeholders.map((p) => (bodyPlaceholders(l.placeholders)[0] === p ? { ...p, rect } : p)) }
        : l));
    // an agenda whose content box starts at the top, under a header band on the slide master (the decorated sample before ADR-0023)
    const agendaUnderBand: MasterProfile = { ...m, master: { ...m.master, decor: [band] }, layouts: moved("agenda", { x: 3575050, y: 273050, w: 5111750, h: 5853113 }) };
    expect(bodyOverlaps(agendaUnderBand)).toEqual({ header: ["Agenda"], footer: [] });
    // a section body that runs past its own slide-number footer
    expect(bodyOverlaps({ ...m, layouts: moved("section", { x: 838200, y: 5900000, w: 10515600, h: 800000 }) })).toEqual({ header: [], footer: ["Section"] });
    // a section that hides the master's shapes is not measured against the master's header band
    const hidden: MasterProfile = { ...m, master: { ...m.master, decor: [band] }, layouts: moved("section", { x: 838200, y: 100000, w: 10515600, h: 1000000 }, { showMasterShapes: false }) };
    expect(bodyOverlaps(hidden).header).not.toContain("Section");
  });
});
