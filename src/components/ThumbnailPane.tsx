import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { useCurrentMaster, useDeckStore } from "../store/deckStore";
import { SlideCanvas } from "./SlideCanvas";
import type { RenderedSlide } from "../model/types";
import { copyText, slideRef } from "../model/refs";
import { dropTarget, type DropTarget } from "../model/dnd";

/**
 * Drag unit is the source block, not the rendered slide: every part of an auto-split slide is a handle for the whole
 * block ("2.1 (1/2)" and "(2/2)" alike), and dragging a section header moves the section with all of its body slides.
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

  const onDragStart = (s: RenderedSlide) => (e: DragEvent) => {
    if (!s.blockId) { e.preventDefault(); return; }
    setDragging(s.blockId);
    e.dataTransfer.effectAllowed = "move";
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
    setDragging(null); setOver(null);
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
            onDragStart={onDragStart(s)} onDragOver={onDragOver(s)} onDragEnd={() => { setDragging(null); setOver(null); }}
            onClick={() => select(s.id)}
            onContextMenu={(e) => { e.preventDefault(); select(s.id); void copyText(slideRef(s, deckFile)); }}
            title={`右クリックで ${slideRef(s, deckFile)} をコピー`}>
            {line === "top" && <div className="drop-line" style={{ top: 0 }} />}
            <div className={`nav-item ${selected ? "selected" : ""} ${isSection ? "section" : ""} ${dragging === s.blockId ? "dragging" : ""}`}
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
