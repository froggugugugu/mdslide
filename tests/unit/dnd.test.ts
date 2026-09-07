import { describe, expect, it } from "vitest";
import { dropTarget } from "../../src/model/dnd";
import { moveBlock, parseMarkdown, serializeDeck } from "../../src/model/parser";
import { renderDeck } from "../../src/model/render";

// cover, agenda, Intro (before any chapter), # One { a1, a2 (auto-split into parts) }, # Two { b1 }, # Three { c1 }
const MD = `---
title: T
---

## Intro

- i

# One

## a1

- a

## a2

${Array.from({ length: 30 }, (_, i) => `- line ${i}`).join("\n")}

# Two

## b1

- b

# Three

## c1

- c
`;

const deck = parseMarkdown(MD);
const slides = renderDeck(deck);
const block = (title: string) => deck.blocks.find((b) => b.title === title)!;
const slide = (title: string, part = 0) => slides.filter((s) => s.title === title)[part];
const order = (d = deck) => d.blocks.map((b) => b.title).join(" ");

describe("dropTarget: where a dragged block lands", () => {
  it("a body drops before or after the hovered block; the line sits on the block's first or last part", () => {
    const t = dropTarget(deck, slides, block("c1").id, slide("a1"), true)!;
    expect(t).toMatchObject({ toId: block("a1").id, place: "before", lineSlideId: slide("a1").id, lineSide: "top" });
    const parts = slides.filter((s) => s.title === "a2");
    expect(parts.length).toBeGreaterThan(1);
    const u = dropTarget(deck, slides, block("c1").id, parts[0], false)!; // lower half of (1/N): after the whole block
    expect(u).toMatchObject({ toId: block("a2").id, place: "after", lineSlideId: parts[parts.length - 1].id, lineSide: "bottom" });
    // after a chapter header = first slide of that chapter; the line sits under the header
    expect(dropTarget(deck, slides, block("c1").id, slide("Two"), false)).toMatchObject({ toId: block("Two").id, place: "after", lineSlideId: slide("Two").id, lineSide: "bottom" });
    expect(dropTarget(deck, slides, block("c1").id, slides[0], true)).toBeNull(); // cover: nowhere to go
    expect(dropTarget(deck, slides, block("c1").id, slide("c1"), true)).toBeNull(); // itself
  });

  it("a chapter lands between chapters only: inside another chapter means after it, with the line under its last slide", () => {
    const parts = slides.filter((s) => s.title === "a2");
    const t = dropTarget(deck, slides, block("Three").id, slide("a1"), true)!;
    expect(t).toMatchObject({ toId: block("One").id, place: "after", lineSlideId: parts[parts.length - 1].id, lineSide: "bottom" });
    // and the move keeps Two's own slides with Two
    const moved = moveBlock(deck, block("Three").id, t.toId, t.place);
    expect(order(moved)).toBe("Intro One a1 a2 Three c1 Two b1");
    expect(serializeDeck(moved)).toContain("# Three\n\n## c1\n\n- c\n\n# Two\n\n## b1");
  });

  it("a chapter header's upper half means before that chapter, its lower half after it", () => {
    expect(dropTarget(deck, slides, block("Three").id, slide("One"), true)).toMatchObject({ toId: block("One").id, place: "before", lineSlideId: slide("One").id, lineSide: "top" });
    const parts = slides.filter((s) => s.title === "a2");
    expect(dropTarget(deck, slides, block("Three").id, slide("One"), false)).toMatchObject({ toId: block("One").id, place: "after", lineSlideId: parts[parts.length - 1].id, lineSide: "bottom" });
  });

  it("hovering the cover, the agenda or a slide before the first chapter means before the first chapter", () => {
    expect(dropTarget(deck, slides, block("Three").id, slides[0], true)).toMatchObject({ toId: block("One").id, place: "before" });
    expect(dropTarget(deck, slides, block("Three").id, slide("Intro"), false)).toMatchObject({ toId: block("One").id, place: "before", lineSlideId: slide("One").id, lineSide: "top" });
    const moved = moveBlock(deck, block("Three").id, block("One").id, "before");
    expect(order(moved)).toBe("Intro Three c1 One a1 a2 Two b1"); // Intro stays before the chapters
  });

  it("returns null where the drop would change nothing or would be into itself", () => {
    expect(dropTarget(deck, slides, block("One").id, slide("a1"), true)).toBeNull();      // into its own chapter
    expect(dropTarget(deck, slides, block("One").id, slide("One"), false)).toBeNull();    // after itself
    expect(dropTarget(deck, slides, block("Two").id, slide("a1"), false)).toBeNull();     // after One: Two is already there
    expect(dropTarget(deck, slides, block("Two").id, slide("Three"), true)).toBeNull();   // before Three: already there
    expect(dropTarget(deck, slides, block("One").id, slides[0], true)).toBeNull();        // before the first chapter: it is the first
    expect(dropTarget(deck, slides, block("Three").id, slide("b1"), true)).toBeNull();    // after Two: already there
  });
});
