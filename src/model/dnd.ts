import type { Deck, RenderedSlide } from "./types";
import { sectionSpan } from "./parser";

/** Where a dragged block would land, and where the drop line is drawn (a tile and its top or bottom edge). */
export interface DropTarget {
  toId: string;
  place: "before" | "after";
  lineSlideId: string;
  lineSide: "top" | "bottom";
}

/**
 * Resolve a hover position into a drop for `moveBlock`.
 * - A body drops before or after the hovered block (the line sits on that block's first or last auto-split part).
 * - A chapter (section) lands between chapters only, so it never swallows another chapter's slides: hovering anywhere
 *   inside a chapter means "after that chapter" (the line under its last slide), the upper half of a chapter's header
 *   means "before it", and anything before the first chapter means "before the first chapter".
 * Returns null when there is nowhere to drop or the drop would change nothing.
 */
export function dropTarget(deck: Deck, slides: RenderedSlide[], draggingId: string, over: RenderedSlide, upperHalf: boolean): DropTarget | null {
  const blocks = deck.blocks;
  const dragging = blocks.find((b) => b.id === draggingId);
  if (!dragging) return null;
  const parts = (blockId: string) => slides.filter((s) => s.blockId === blockId);
  const withLine = (toId: string, place: "before" | "after", lineBlockId: string): DropTarget | null => {
    const p = parts(lineBlockId);
    if (!p.length) return null;
    return place === "before"
      ? { toId, place, lineSlideId: p[0].id, lineSide: "top" }
      : { toId, place, lineSlideId: p[p.length - 1].id, lineSide: "bottom" };
  };

  if (dragging.kind === "body") {
    if (!over.blockId || over.blockId === draggingId) return null;
    const place = upperHalf ? "before" : "after";
    return withLine(over.blockId, place, over.blockId);
  }

  // A chapter: find the chapter the hovered slide belongs to.
  const sections = blocks.filter((b) => b.kind === "section");
  const overIndex = over.blockId ? blocks.findIndex((b) => b.id === over.blockId) : -1;
  const owner = overIndex < 0 ? undefined : blocks.slice(0, overIndex + 1).reverse().find((b) => b.kind === "section");
  const si = sections.indexOf(dragging);
  const lastBlockOf = (section: typeof dragging) => { const i = blocks.indexOf(section); return blocks[i + sectionSpan(blocks, i) - 1]; };

  if (!owner) {
    // Cover, agenda, or a slide before the first chapter: before the first chapter (unless that is the dragged one).
    const first = sections[0];
    if (!first || first.id === draggingId) return null;
    return withLine(first.id, "before", first.id);
  }
  if (owner.id === draggingId) return null;
  const oi = sections.indexOf(owner);
  if (over.blockId === owner.id && upperHalf) {
    if (oi === si + 1) return null; // already right before it
    return withLine(owner.id, "before", owner.id);
  }
  if (oi === si - 1) return null; // already right after it
  return withLine(owner.id, "after", lastBlockOf(owner).id);
}
