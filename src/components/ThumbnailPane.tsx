import { useState, type DragEvent } from "react";
import { useCurrentMaster, useDeckStore } from "../store/deckStore";
import { SlideCanvas } from "./SlideCanvas";
import type { RenderedSlide } from "../model/types";
import { copyText, slideRef } from "../model/refs";

/**
 * Drag unit is the source block, not the rendered slide: dragging "2.1 (1/2)" moves the whole block,
 * and dragging a section header moves the section with all of its body slides.
 */
export function ThumbnailPane() {
  const slides = useDeckStore((s) => s.slides);
  const selectedId = useDeckStore((s) => s.selectedId);
  const select = useDeckStore((s) => s.select);
  const move = useDeckStore((s) => s.move);
  const deckFile = useDeckStore((s) => s.workspace?.deckFile ?? "deck.md");
  const master = useCurrentMaster();
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; place: "before" | "after" } | null>(null);

  const onDragStart = (s: RenderedSlide) => (e: DragEvent) => {
    if (!s.blockId) { e.preventDefault(); return; }
    setDragging(s.blockId);
    e.dataTransfer.effectAllowed = "move";
  };
  const onDragOver = (s: RenderedSlide) => (e: DragEvent) => {
    if (!dragging || !s.blockId || s.blockId === dragging) return;
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setOver({ id: s.blockId, place: e.clientY < rect.top + rect.height / 2 ? "before" : "after" });
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    if (dragging && over) move(dragging, over.id, over.place);
    setDragging(null); setOver(null);
  };

  return (
    <div className="h-full overflow-y-auto px-2 py-3 select-none" onDrop={onDrop} onDragOver={(e) => dragging && e.preventDefault()}>
      {slides.map((s, i) => {
        const selected = s.id === selectedId;
        const isSection = s.kind === "section";
        const indicator = over && s.blockId === over.id ? over.place : null;
        const continuation = !!s.continuation && s.continuation.index > 1;
        return (
          <div key={s.id} className={`relative ${isSection && i > 0 ? "mt-3" : ""}`}
            draggable={!!s.blockId && !continuation}
            onDragStart={onDragStart(s)} onDragOver={onDragOver(s)} onDragEnd={() => { setDragging(null); setOver(null); }}
            onClick={() => select(s.id)}
            onContextMenu={(e) => { e.preventDefault(); select(s.id); void copyText(slideRef(s, deckFile)); }}
            title={`右クリックで ${slideRef(s, deckFile)} をコピー`}>
            {indicator === "before" && <div className="drop-line" style={{ top: 0 }} />}
            <div className={`nav-item ${selected ? "selected" : ""} ${isSection ? "section" : ""} ${dragging === s.blockId ? "dragging" : ""}`}
              style={{ paddingLeft: continuation ? 24 : undefined }}>
              <div className="num">{i + 1}</div>
              <div className="tile">
                <div className="thumb"><SlideCanvas slide={s} master={master} className="pointer-events-none" /></div>
                <div className="label">{s.displayTitle}</div>
              </div>
            </div>
            {indicator === "after" && <div className="drop-line" style={{ bottom: 0 }} />}
          </div>
        );
      })}
    </div>
  );
}
