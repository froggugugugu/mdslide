import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findLayout, importMaster, lineCapacity, roleFromLayoutName } from "../../src/master/importMaster";

const sample = () => new Blob([readFileSync("examples/sample-master.pptx")]);

describe("roleFromLayoutName", () => {
  it("maps names case-insensitively and with Japanese aliases", () => {
    expect(roleFromLayoutName("Cover")).toEqual({ kind: "cover" });
    expect(roleFromLayoutName("表紙")).toEqual({ kind: "cover" });
    expect(roleFromLayoutName("AGENDA")).toEqual({ kind: "agenda" });
    expect(roleFromLayoutName("目次")).toEqual({ kind: "agenda" });
    expect(roleFromLayoutName("Section Header")).toEqual({ kind: "section" });
    expect(roleFromLayoutName("中表紙")).toEqual({ kind: "section" });
    expect(roleFromLayoutName("Body-Text")).toEqual({ kind: "body", layout: "text" });
    expect(roleFromLayoutName("body text")).toEqual({ kind: "body", layout: "text" });
    expect(roleFromLayoutName("Body-2col")).toEqual({ kind: "body", layout: "2col" });
    expect(roleFromLayoutName("Body-TwoCol")).toEqual({ kind: "body", layout: "2col" });
    expect(roleFromLayoutName("Body-Weird")).toBeNull();
    expect(roleFromLayoutName("Title Only")).toBeNull();
    expect(roleFromLayoutName("Title and Vertical Text")).toBeNull();
    expect(roleFromLayoutName("Title Slide")).toEqual({ kind: "cover" });
    expect(roleFromLayoutName("Comparison")).toBeNull();
  });
});

describe("importMaster", () => {
  it("reads slide size, layouts, roles and placeholder geometry", async () => {
    const m = await importMaster(sample(), "sample");
    expect(m.slideSize.w).toBeGreaterThan(m.slideSize.h);
    expect(m.layouts.length).toBeGreaterThan(5);
    const names = m.layouts.filter((l) => l.role).map((l) => l.name).sort();
    expect(names).toEqual(["Agenda", "Body-2col", "Body-Text", "Cover", "Section"]);
    expect(m.missing).toEqual([]);
    expect(m.unmapped).toContain("Comparison");
    const body = findLayout(m, "body", "text")!;
    const title = body.placeholders.find((p) => p.type === "title")!;
    expect(title.rect).not.toBeNull();       // inherited from the slide master
    expect(title.rect!.w).toBeGreaterThan(0);
    expect(body.placeholders.some((p) => p.type === "body" || p.type === "obj")).toBe(true);
    expect(m.name).toBe("sample");
    expect(m.id.startsWith("sample-")).toBe(true);
  });
  it("falls back from 2col to text and reports missing roles", async () => {
    const m = await importMaster(sample(), "s");
    expect(findLayout(m, "body", "2col")!.name).toBe("Body-2col");
    m.layouts = m.layouts.filter((l) => l.name !== "Body-2col");
    expect(findLayout(m, "body", "2col")!.name).toBe("Body-Text");
    expect(findLayout(m, "agenda")!.name).toBe("Agenda");
    m.layouts = m.layouts.filter((l) => l.name !== "Agenda");
    expect(findLayout(m, "agenda")).toBeUndefined();
  });
  it("rejects files that are not presentations", async () => {
    const JSZip = (await import("jszip")).default;
    const z = new JSZip(); z.file("hello.txt", "x");
    const blob = await z.generateAsync({ type: "blob" });
    await expect(importMaster(blob, "bad")).rejects.toThrow(/presentation\.xml/);
  });
});

import { decoratedMaster } from "../helpers/decoratedMaster";
import { parseColor } from "../../src/master/importMaster";

describe("importMaster: decorations the preview draws", () => {
  it("reads master shapes, pictures (as data URLs), text boxes and groups with their transforms", async () => {
    const m = await importMaster(await decoratedMaster(), "deco");
    const kinds = m.master.decor.map((d) => d.kind);
    expect(kinds).toEqual(["shape", "image", "text", "shape"]); // bar, logo, text box, the grouped dot (flattened)
    const [bar, logo, conf, dot] = m.master.decor;
    expect(bar.rect).toEqual({ x: 0, y: 0, w: 12192000, h: 228600 });
    expect(bar.fill).toBe(m.theme!.colors.accent1);                       // schemeClr resolved through the theme
    expect(bar.line).toBeUndefined();                                     // <a:ln><a:noFill/>
    expect(logo.src).toMatch(/^data:image\/png;base64,iVBOR/);
    expect(logo.rect).toEqual({ x: 10668000, y: 6096000, w: 1219200, h: 457200 });
    expect(conf.text).toBe("CONFIDENTIAL & INTERNAL");                    // entities decoded
    expect(conf).toMatchObject({ fontPt: 9, bold: true, color: "#808080", align: "l", anchor: "ctr" });
    expect(conf.fill).toBeUndefined();                                     // <a:noFill/>
    // group: child at (500000,250000) size 500000x250000 in a 1000000x500000 child space mapped to 2000000x1000000 at (6096000,3048000)
    expect(dot.rect).toEqual({ x: 6096000 + 1000000, y: 3048000 + 500000, w: 1000000, h: 500000 });
    expect(dot.geometry).toBe("ellipse");
    expect(dot.fill).toBe("rgba(255, 0, 0, 0.5)");                        // alpha modifier
    expect(m.master.background).toEqual({ color: m.theme!.colors.lt1 });   // <p:bgRef><a:schemeClr val="bg1"/>
  });
  it("reads layout backgrounds, the hide-master-shapes flag, placeholder colours and footer fields", async () => {
    const m = await importMaster(await decoratedMaster(), "deco");
    const cover = findLayout(m, "cover")!;
    expect(cover.background).toEqual({ color: "#1D3557" });
    expect(cover.showMasterShapes).toBe(true);
    const title = cover.placeholders.find((p) => p.type === "ctrTitle")!;
    expect(title.style).toMatchObject({ color: "#FFFFFF", align: "l" });
    expect(findLayout(m, "section")!.showMasterShapes).toBe(false);
    const body = findLayout(m, "body", "text")!;
    expect(body.background).toBeUndefined();                              // inherits the master's
    expect(body.placeholders.find((p) => p.type === "sldNum")!.field).toBe("slidenum");
    expect(body.placeholders.find((p) => p.type === "dt")!.field).toBe("datetime");
    expect(m.master.titleColor).toBe(m.theme!.colors.dk1);                // titleStyle: tx1
    expect(m.master.bodyColor).toBe(m.theme!.colors.dk1);
  });
  it("the plain sample has no decorations, so nothing changes for it", async () => {
    const m = await importMaster(sample(), "s");
    expect(m.master.decor).toEqual([]);
    expect(m.layouts.every((l) => l.decor.length === 0 && l.showMasterShapes)).toBe(true);
  });
});

describe("examples/decorated-master.pptx (scripts/make_decorated_master.py)", () => {
  it("carries bands, pictures, a picture background, changed fonts and a fixed footer the preview can show", async () => {
    const m = await importMaster(new Blob([readFileSync("examples/decorated-master.pptx")]), "decorated");
    expect(m.missing).toEqual([]);
    expect(m.theme!.fonts).toMatchObject({ major: "Avenir Next", minor: "Avenir Next", majorJa: "Hiragino Sans", minorJa: "Hiragino Sans" });
    expect(m.theme!.colors.accent1).toBe("#0B3D91");
    expect(m.master.decor.map((d) => d.kind)).toEqual(["shape", "image", "image", "shape", "image"]); // header band, pattern, logo, footer band, icon
    expect(m.master.decor[0].fill).toBe("#0B3D91");
    const cover = findLayout(m, "cover")!;
    expect(cover.showMasterShapes).toBe(false);
    expect(cover.background?.image).toMatch(/^data:image\/png;base64,/);
    expect(cover.decor.filter((d) => d.kind === "image")).toHaveLength(4);                       // logo + three tiles
    expect(cover.placeholders.find((p) => p.type === "ctrTitle")!.style).toMatchObject({ color: "#FFFFFF", align: "l", anchor: "b", fontPt: 44 });
    expect(findLayout(m, "section")!.decor.map((d) => d.kind)).toEqual(["image"]);
    const body = findLayout(m, "body", "text")!;
    expect(body.placeholders.find((p) => p.type === "ftr")!.text).toBe("ACME Platform Engineering · Confidential"); // inherited from the master
    expect(body.placeholders.find((p) => p.type === "sldNum")!.field).toBe("slidenum");
  });
});

describe("parseColor", () => {
  const theme = { name: "t", colors: { dk1: "#000000", lt1: "#FFFFFF", accent1: "#0A84FF" }, fonts: { major: "A", minor: "B" } };
  it("resolves srgb, scheme aliases and modifiers", () => {
    expect(parseColor('<a:srgbClr val="ff0000"/>', theme)).toBe("#FF0000");
    expect(parseColor('<a:schemeClr val="accent1"/>', theme)).toBe("#0A84FF");
    expect(parseColor('<a:schemeClr val="bg1"/>', theme)).toBe("#FFFFFF");   // bg1 → lt1
    expect(parseColor('<a:schemeClr val="tx1"/>', theme)).toBe("#000000");   // tx1 → dk1
    expect(parseColor('<a:srgbClr val="808080"><a:alpha val="25000"/></a:srgbClr>', theme)).toBe("rgba(128, 128, 128, 0.25)");
    expect(parseColor('<a:srgbClr val="808080"><a:lumMod val="50000"/></a:srgbClr>', theme)).toBe("#404040");
    expect(parseColor('<a:srgbClr val="808080"><a:lumMod val="50000"/><a:lumOff val="50000"/></a:srgbClr>', theme)).toBe("#C0C0C0");
    expect(parseColor('<a:sysClr val="windowText" lastClr="123456"/>', theme)).toBe("#123456");
    expect(parseColor('<a:schemeClr val="accent9"/>', theme)).toBeUndefined();
    expect(parseColor("", theme)).toBeUndefined();
  });
});

describe("lineCapacity", () => {
  it("derives line count from placeholder height", () => {
    expect(lineCapacity(null)).toBeUndefined();
    expect(lineCapacity({ x: 0, y: 0, w: 1, h: 914400 * 4 })).toBe(Math.floor((4 * 72) / (18 * 1.3)));
    expect(lineCapacity({ x: 0, y: 0, w: 1, h: 100 })).toBe(3); // never below 3
  });
});
