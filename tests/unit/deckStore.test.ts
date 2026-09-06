import { beforeEach, describe, expect, it } from "vitest";
import { useDeckStore } from "../../src/store/deckStore";

// cover, agenda, Intro (before any section), # One { A, B }, # Two { C }
const MD = `---
title: Deck
agenda: once
---

## Intro

- i

# One

## A

- a

## B

- b

# Two

## C

- c
`;

const store = () => useDeckStore.getState();
const order = () => store().deck.blocks.map((b) => b.title).join(" ");
const selectTitle = (title: string) => store().select(store().slides.find((s) => s.title === title)!.id);
const selectedTitle = () => store().slides.find((s) => s.id === store().selectedId)?.title;

beforeEach(() => {
  useDeckStore.setState({ workspace: null, started: true, masters: [], masterId: null, selectedId: null });
  store().setMarkdown(MD);
});

describe("selectAdjacent (↑↓ in the navigator)", () => {
  it("selects the first slide when nothing is selected, then walks the list and stops at both ends", () => {
    store().selectAdjacent(1);
    expect(store().selectedId).toBe("cover");
    store().selectAdjacent(1);
    expect(store().selectedId).toBe(store().slides[1].id);
    store().selectAdjacent(-1);
    store().selectAdjacent(-1);
    expect(store().selectedId).toBe("cover"); // clamped at the top
    selectTitle("C");
    store().selectAdjacent(1);
    expect(selectedTitle()).toBe("C"); // clamped at the bottom
  });
  it("selecting also moves the editor to the slide's heading", () => {
    store().selectAdjacent(1); store().selectAdjacent(1); store().selectAdjacent(1);
    expect(selectedTitle()).toBe("Intro");
    expect(store().gotoLine).toBe(store().slides.find((s) => s.title === "Intro")!.sourceLine);
  });
});

describe("moveSelected (⌥↑ / ⌥↓ in the navigator)", () => {
  it("swaps a body slide with its neighbour and keeps it selected", () => {
    selectTitle("B");
    expect(store().moveSelected(-1)).toBe(true);
    expect(order()).toBe("Intro One B A Two C");
    expect(selectedTitle()).toBe("B");
    expect(store().markdown.indexOf("## B")).toBeLessThan(store().markdown.indexOf("## A"));
    expect(store().moveSelected(1)).toBe(true);
    expect(order()).toBe("Intro One A B Two C");
  });
  it("moves a body across a section boundary in either direction", () => {
    selectTitle("A");
    store().moveSelected(-1); // above "# One": leaves the section
    expect(order()).toBe("Intro A One B Two C");
    selectTitle("B");
    store().moveSelected(1); // below "# Two": joins it as its first slide
    expect(order()).toBe("Intro A One Two B C");
  });
  it("moves a section together with its slides, one section at a time", () => {
    selectTitle("Two");
    expect(store().moveSelected(-1)).toBe(true);
    expect(order()).toBe("Intro Two C One A B");
    expect(selectedTitle()).toBe("Two");
    expect(store().moveSelected(1)).toBe(true);
    expect(order()).toBe("Intro One A B Two C");
  });
  it("does nothing for the cover, the agenda, the ends of the deck, or a section with no section to step over", () => {
    const before = store().markdown;
    store().select("cover");
    expect(store().moveSelected(1)).toBe(false);
    store().select(store().slides[1].id); // agenda
    expect(store().moveSelected(1)).toBe(false);
    selectTitle("Intro");
    expect(store().moveSelected(-1)).toBe(false);
    selectTitle("C");
    expect(store().moveSelected(1)).toBe(false);
    selectTitle("One");
    expect(store().moveSelected(-1)).toBe(false); // only "Intro" above it, which is not a section
    selectTitle("Two");
    expect(store().moveSelected(1)).toBe(false);
    expect(store().markdown).toBe(before);
  });
  it("moves the whole block when a continuation slide is selected", () => {
    const long = `# One\n\n## Long\n\n${Array.from({ length: 30 }, (_, i) => `- line ${i}`).join("\n")}\n\n---\n\n- tail\n\n## Next\n\n- n\n`;
    store().setMarkdown(long);
    const cont = store().slides.find((s) => s.continuation && s.continuation.index > 1)!;
    store().select(cont.id);
    expect(store().moveSelected(1)).toBe(true);
    expect(order()).toBe("One Next Long");
  });
});
