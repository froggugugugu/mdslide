import { describe, expect, it } from "vitest";
import { moveBlock, parseMarkdown, serializeDeck, withAttr } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";

const SRC = `---
title: 四半期報告
subtitle: 開発本部
---

# 背景

## 現状の課題 {layout=img-right}

- 課題A
- 課題B

![図](fig1.png)

# 施策

## 施策の概要

本文
---
分割後の本文

## 効果
`;

describe("parse / serialize", () => {
  it("round-trips the source", () => {
    const deck = parseMarkdown(SRC);
    expect(serializeDeck(deck)).toBe(SRC.replace(/\n+$/, "\n"));
  });
  it("extracts meta, blocks, attrs, images", () => {
    const deck = parseMarkdown(SRC);
    expect(deck.meta.title).toBe("四半期報告");
    expect(deck.blocks.map((b) => b.kind)).toEqual(["section", "body", "section", "body", "body"]);
    expect(deck.blocks[1].attrs.layout).toBe("img-right");
    expect(deck.blocks[1].images[0].src).toBe("fig1.png");
    expect(deck.blocks[3].parts.length).toBe(2);
  });
});

describe("numbering", () => {
  it("numbers chapters and body slides, generates agenda, splits on ---", () => {
    const slides = renderDeck(parseMarkdown(SRC));
    expect(slides.map((s) => s.displayTitle)).toEqual([
      "四半期報告", "Agenda", "1. 背景", "1.1. 現状の課題", "2. 施策",
      "2.1. 施策の概要 (1/2)", "2.1. 施策の概要 (2/2)", "2.2. 効果",
    ]);
    expect(slides[1].agenda?.items.map((i) => i.title)).toEqual(["背景", "施策"]);
    expect(slides[3].layout).toEqual({ kind: "image", width: 0.5, side: "right" });
  });
  it("renumbers after reorder", () => {
    const deck = parseMarkdown(SRC);
    const moved = moveBlock(deck, deck.blocks[2].id, deck.blocks[0].id, "before"); // 施策 section before 背景
    const titles = renderDeck(moved).map((s) => s.displayTitle);
    expect(titles.slice(2)).toEqual([
      "1. 施策", "1.1. 施策の概要 (1/2)", "1.1. 施策の概要 (2/2)", "1.2. 効果", "2. 背景", "2.1. 現状の課題",
    ]);
    // Re-parse from serialized text gives the same result: markdown is the source of truth.
    expect(renderDeck(parseMarkdown(serializeDeck(moved))).map((s) => s.displayTitle)).toEqual(titles);
  });
  it("re-parents a body slide when moved across sections", () => {
    const deck = parseMarkdown(SRC);
    const moved = moveBlock(deck, deck.blocks[4].id, deck.blocks[1].id, "after"); // 効果 -> under 背景
    expect(renderDeck(moved).map((s) => s.displayTitle)).toContain("1.2. 効果");
  });
});

describe("attrs and split", () => {
  it("sets and removes layout attribute on the heading line", () => {
    const deck = parseMarkdown(SRC);
    expect(withAttr(deck.blocks[4], "layout", "2col").raw[0]).toBe("## 効果 {layout=2col}");
    expect(withAttr(withAttr(deck.blocks[4], "img", "3/4"), "side", "left").raw[0]).toBe("## 効果 {img=3/4 side=left}");
    expect(withAttr(deck.blocks[1], "layout", null).raw[0]).toBe("## 現状の課題");
  });
  it("auto-splits by the fit model and reports usage, honouring {size=} and fontSize", () => {
    const many = Array.from({ length: 40 }, (_, i) => `- 項目${i}`);
    const md = `## A\n\n${many.join("\n")}\n\n## B {size=12}\n\n${many.join("\n")}\n`;
    const slides = renderDeck(parseMarkdown(md));
    const a = slides.filter((s) => s.title === "A"), b = slides.filter((s) => s.title === "B");
    expect(a.length).toBeGreaterThan(1);
    expect(b.length).toBeLessThan(a.length);      // smaller font fits more per slide (40 lines: 18pt -> 3 slides, 12pt -> 2)
    expect(a[0].fontPt).toBe(18); expect(b[0].fontPt).toBe(12);
    expect(a[0].fit!.used).toBeLessThanOrEqual(a[0].fit!.capacity);
    const deckPt = renderDeck(parseMarkdown(`---\nfontSize: 24\n---\n\n## C\n\n- x\n`));
    expect(deckPt[1].fontPt).toBe(24);
    expect(deckPt[1].fit!.capacity).toBeLessThan(a[0].fit!.capacity);
    const wide = renderDeck(parseMarkdown(`## D\n\n- ${"あ".repeat(80)}\n`))[1];
    expect(wide.fit!.used).toBeGreaterThan(1);    // wrapped line counts as more than one
  });
});

describe("notes, placeholders, tables", () => {
  const md = `## A {layout=img-right}\n\n- x\n\n![TODO 図]()\n\n> note: 補足\n\n| k | v |\n|---|---|\n| a | b |\n`;
  it("separates notes from body, keeps placeholder images", () => {
    const deck = parseMarkdown(md);
    expect(deck.blocks[0].notes).toEqual(["補足"]);
    expect(deck.blocks[0].images).toEqual([{ alt: "TODO 図", src: "" }]);
    const slide = renderDeck(deck)[1]; // cover, then A (no sections: no agenda)
    expect(slide.notes).toEqual(["補足"]);
    expect(slide.body.some((l) => l.startsWith(">"))).toBe(false);
    expect(slide.body).toContain("| a | b |");
    expect(serializeDeck(deck)).toBe(md);
  });
});

import { contentArea, fitImage, layoutFromAttrs, placeImage } from "../../src/layouts/geometry";

describe("image geometry", () => {
  const content = contentArea(0.11, 16 / 9); // 16:9 slide, title bottom at 0.11 W
  it("keeps aspect ratio and anchors to the chosen side", () => {
    const box = { x: 0.1, y: 0.2, w: 0.4, h: 0.2 };
    const tall = fitImage(box, 1, "right"); // square image limited by height
    expect(tall.h).toBeCloseTo(0.2); expect(tall.w).toBeCloseTo(0.2); expect(tall.x).toBeCloseTo(0.3);
    const wide = fitImage(box, 4, "left"); // limited by width
    expect(wide.w).toBeCloseTo(0.4); expect(wide.h).toBeCloseTo(0.1); expect(wide.x).toBeCloseTo(0.1);
  });
  it("gives the text the remaining width with a gap", () => {
    const p = placeImage({ kind: "image", width: 0.5, side: "right" }, content);
    expect(p.body!.x).toBeCloseTo(content.x);
    expect(p.body!.x + p.body!.w + 0.03).toBeCloseTo(p.box.x);
    expect(p.box.x + p.box.w).toBeCloseTo(content.x + content.w);
    const q = placeImage({ kind: "image", width: 0.75, side: "left" }, content);
    expect(q.box.w).toBeGreaterThan(q.body!.w);
    expect(q.body!.x).toBeCloseTo(q.box.x + q.box.w + 0.03);
  });
  it("puts text under a full-width image only when room remains", () => {
    const short = placeImage({ kind: "image", width: 1, side: "right" }, content, 4); // wide banner
    expect(short.body).not.toBeNull();
    expect(short.body!.y).toBeCloseTo(short.image.y + short.image.h + 0.03);
    const tall = placeImage({ kind: "image", width: 1, side: "right" }, content, 1);
    expect(tall.body).toBeNull();
  });
  it("parses attributes and legacy layout ids", () => {
    expect(layoutFromAttrs({ img: "3/4", side: "left" }, true)).toEqual({ kind: "image", width: 0.75, side: "left" });
    expect(layoutFromAttrs({ layout: "img-left" }, true)).toEqual({ kind: "image", width: 0.5, side: "left" });
    expect(layoutFromAttrs({}, true)).toEqual({ kind: "image", width: 0.5, side: "right" });
    expect(layoutFromAttrs({}, false)).toEqual({ kind: "text" });
  });
});

import { parseMarkdown as parseForMeta, serializeDeck as serializeForMeta, withMeta } from "../../src/model/parser";

describe("withMeta: frontmatter keys as the store's way to choose a master", () => {
  it("sets, replaces and removes a key without touching the rest", () => {
    const md = "---\ntitle: T\nagenda: none\n---\n\n## A\n\n- a\n";
    let d = withMeta(parseForMeta(md), "master", "corp.pptx");
    expect(serializeForMeta(d)).toBe("---\ntitle: T\nagenda: none\nmaster: corp.pptx\n---\n\n## A\n\n- a\n");
    expect(d.meta.master).toBe("corp.pptx");
    d = withMeta(d, "master", "other.pptx");
    expect(serializeForMeta(d)).toContain("master: other.pptx\n");
    expect(serializeForMeta(d).match(/master:/g)).toHaveLength(1);
    d = withMeta(d, "master", null);
    expect(serializeForMeta(d)).toBe(md);
    expect(d.meta.master).toBeUndefined();
  });
  it("creates the frontmatter when there is none, and removing the last key drops it again", () => {
    const d = withMeta(parseForMeta("## A\n\n- a\n"), "master", "corp.pptx");
    expect(serializeForMeta(d)).toBe("---\nmaster: corp.pptx\n---\n\n## A\n\n- a\n");
    expect(parseForMeta(serializeForMeta(d)).meta.master).toBe("corp.pptx");
    expect(serializeForMeta(withMeta(d, "master", null))).toBe("## A\n\n- a\n");
  });
});

import { newDeckTemplate } from "../../src/model/template";

describe("newDeckTemplate: the scaffold for a new file is a frame, not the sample", () => {
  it("names the deck after the file, dates it today, and gives one chapter with one slide", () => {
    const md = newDeckTemplate("q3-report.md", new Date(2026, 8, 6));
    expect(md).toBe("---\ntitle: q3-report\ndate: 2026-09-06\nagenda: once\nnumbering: chapter\n---\n\n# 章タイトル\n\n## スライドタイトル\n\n- 要点\n");
    const deck = parseForMeta(md);
    expect(deck.meta).toMatchObject({ title: "q3-report", date: "2026-09-06", agenda: "once", numbering: "chapter" });
    expect(deck.blocks.map((b) => b.kind)).toEqual(["section", "body"]);
    expect(serializeForMeta(deck)).toBe(md); // round-trips
    expect(md).not.toContain("開発生産性");
  });
  it("falls back to a placeholder title for the default file name", () => {
    expect(newDeckTemplate("deck.md")).toContain("title: 資料タイトル");
  });
});
