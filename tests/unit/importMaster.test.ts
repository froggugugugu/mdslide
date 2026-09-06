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

describe("lineCapacity", () => {
  it("derives line count from placeholder height", () => {
    expect(lineCapacity(null)).toBeUndefined();
    expect(lineCapacity({ x: 0, y: 0, w: 1, h: 914400 * 4 })).toBe(Math.floor((4 * 72) / (18 * 1.3)));
    expect(lineCapacity({ x: 0, y: 0, w: 1, h: 100 })).toBe(3); // never below 3
  });
});
