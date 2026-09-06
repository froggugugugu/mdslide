import { describe, expect, it } from "vitest";
import { copyText, slideRef, slideRefs } from "../../src/model/refs";
import { parseMarkdown } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";

const md = `---\ntitle: T\n---\n\n# 章\n\n## 図 {img=1/2}\n\n- a\n\n![構成図](images/arch.png)\n\n## 長い\n\n- x\n---\n- y\n`;

describe("slide references for Claude Code", () => {
  const slides = renderDeck(parseMarkdown(md));
  it("uses file:line for body and section slides (1-based line of the heading)", () => {
    expect(slideRef(slides.find((s) => s.title === "章")!)).toBe("deck.md:5");
    expect(slideRef(slides.find((s) => s.title === "図")!)).toBe("deck.md:7");
    // continuation slides point at the same heading
    const parts = slides.filter((s) => s.title === "長い");
    expect(parts).toHaveLength(2);
    expect(slideRef(parts[1])).toBe("deck.md:13");
  });
  it("cover and agenda point at the file", () => {
    expect(slideRef(slides[0])).toBe("deck.md:1");
    expect(slideRef(slides[1])).toBe("deck.md");
  });
  it("lists everything worth pasting for a slide: ref with title, and image paths", () => {
    const refs = slideRefs(slides.find((s) => s.title === "図")!);
    expect(refs).toEqual([
      { label: "スライド", text: "deck.md:7", detail: "## 1.1. 図" },
      { label: "画像", text: "images/arch.png", detail: "構成図" },
    ]);
    expect(slideRefs(slides.find((s) => s.title === "章")!)).toEqual([{ label: "スライド", text: "deck.md:5", detail: "# 1. 章" }]);
  });
  it("copies through the clipboard API and falls back to execCommand", async () => {
    const written: string[] = [];
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { written.push(t); } }, configurable: true });
    expect(await copyText("deck.md:7")).toBe(true);
    expect(written).toEqual(["deck.md:7"]);
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = () => true;
    expect(await copyText("x")).toBe(true);
    document.execCommand = () => false;
    expect(await copyText("x")).toBe(false);
  });
});
