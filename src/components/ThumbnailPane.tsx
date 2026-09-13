import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useCurrentMaster, useDeckStore } from "../store/deckStore";
import { SlideCanvas } from "./SlideCanvas";
import type { RenderedSlide } from "../model/types";
import { copyText, slideRef } from "../model/refs";
import { dropTarget, movingSlides, type DropTarget } from "../model/dnd";

/**
 * Drag unit is the source block, not the rendered slide: every part of an auto-split slide is a handle for the whole
 * block ("2.1 (1/2)" and "(2/2)" alike), and dragging a section header moves the section with all of its body slides.
 * While dragging, everything that travels is dimmed and the drag image is a label saying how many slides move.
 * Where a drop lands is decided by dropTarget (src/model/dnd.ts): a chapter only ever lands between chapters, so the
 * drop line is drawn at the chapter boundary, never in the middle of another chapter.
 * With the list focused, ↑↓ (or K/J) change the selection and ⌥↑ / ⌥↓ move the selected slide the same way a drag would.
 */
export function ThumbnailPane() {
  const slides = useDeckStore((s) => s.slides);
  const deck = useDeckStore((s) => s.deck);
  const selectedId = useDeckStore((s) => s.selectedId);
  const select = useDeckStore((s) => s.select);
  const selectAdjacent = useDeckStore((s) => s.selectAdjacent);
  const moveSelected = useDeckStore((s) => s.moveSelected);
  const move = useDeckStore((s) => s.move);
  const deckFile = useDeckStore((s) => s.workspace?.deckFile ?? "deck.md");
  const master = useCurrentMaster();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<DropTarget | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const moving = dragging ? new Set(movingSlides(deck, slides, dragging)) : null;

  // Keep the selected tile in view when the selection comes from the keyboard, the editor, or a reorder.
  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-slide-id="${selectedId.replace(/["\\]/g, "\\$&")}"]`);
    el?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const dir = e.key === "ArrowDown" || e.key === "j" || e.key === "J" ? 1 : e.key === "ArrowUp" || e.key === "k" || e.key === "K" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    if (e.altKey) moveSelected(dir); else selectAdjacent(dir);
  };

  const endDrag = () => { setDragging(null); setOver(null); ghostRef.current?.remove(); ghostRef.current = null; };
  const onDragStart = (s: RenderedSlide) => (e: DragEvent) => {
    if (!s.blockId) { e.preventDefault(); return; }
    const ids = movingSlides(deck, slides, s.blockId);
    setDragging(s.blockId);
    e.dataTransfer.effectAllowed = "move";
    // The drag image: a label with the block's title and how many slides come along, instead of the one tile grabbed.
    const first = slides.find((x) => x.id === ids[0]) ?? s;
    const ghost = document.createElement("div");
    ghost.className = "drag-ghost";
    ghost.textContent = `${first.displayTitle.replace(/ \(\d+\/\d+\)$/, "")}${ids.length > 1 ? ` ほか ${ids.length - 1} 枚` : ""}`;
    document.body.appendChild(ghost);
    ghostRef.current = ghost;
    e.dataTransfer.setDragImage?.(ghost, 16, 16);
  };
  const onDragOver = (s: RenderedSlide) => (e: DragEvent) => {
    if (!dragging) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const target = dropTarget(deck, slides, dragging, s, e.clientY < rect.top + rect.height / 2);
    if (!target) { setOver(null); return; } // not a place to drop: the browser shows "not allowed"
    e.preventDefault();
    setOver(target);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragging && over) move(dragging, over.toId, over.place);
    endDrag();
  };

  return (
    <div ref={listRef} className="nav-list h-full overflow-y-auto px-2 py-3 select-none" role="listbox" aria-label="スライド一覧" tabIndex={0}
      onKeyDown={onKeyDown} onDrop={onDrop} onDragOver={(e) => dragging && over && e.preventDefault()}>
      {slides.map((s, i) => {
        const selected = s.id === selectedId;
        const isSection = s.kind === "section";
        const line = over && over.lineSlideId === s.id ? over.lineSide : null;
        const continuation = !!s.continuation && s.continuation.index > 1;
        return (
          <div key={s.id} className={`relative ${isSection && i > 0 ? "mt-3" : ""}`} data-slide-id={s.id}
            role="option" aria-selected={selected}
            draggable={!!s.blockId}
            onDragStart={onDragStart(s)} onDragOver={onDragOver(s)} onDragEnd={endDrag}
            onClick={() => select(s.id)}
            onContextMenu={(e) => { e.preventDefault(); select(s.id); void copyText(slideRef(s, deckFile)); }}
            data-tip={`右クリックで ${slideRef(s, deckFile)} をコピー`}>
            {line === "top" && <div className="drop-line" style={{ top: 0 }} />}
            <div className={`nav-item ${selected ? "selected" : ""} ${isSection ? "section" : ""} ${moving?.has(s.id) ? "dragging" : ""}`}
              style={{ paddingLeft: continuation ? 24 : undefined }}>
              <div className="num">{i + 1}</div>
              <div className="tile">
                <div className="thumb"><SlideCanvas slide={s} master={master} className="pointer-events-none" /></div>
                <div className="label">{s.displayTitle}</div>
              </div>
            </div>
            {line === "bottom" && <div className="drop-line" style={{ bottom: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}
